import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey =
      Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl) {
      throw new Error("Missing SUPABASE_URL environment variable");
    }

    // 1. Authenticate the caller using user JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "missing_authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(supabaseUrl, supabaseAnonKey || "", {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Verify HR role
    const { data: hrCheck, error: hrCheckError } = await userClient.rpc("is_hr");
    if (hrCheckError || !hrCheck) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Parse action and payload
    const body = await req.json();
    const { action, ...payload } = body;

    const hasServiceRole = Boolean(supabaseServiceKey);
    const adminClient = hasServiceRole
      ? createClient(supabaseUrl, supabaseServiceKey!)
      : userClient;

    let result;

    switch (action) {
      case "create_account": {
        const {
          full_name,
          employee_code,
          email,
          password,
          role = "employee",
          department_id = null,
          job_title = null,
          supervisor_id = null,
          manager_id = null,
          requires_manager_approval = true,
          is_active = true,
        } = payload;

        if (!full_name || !employee_code || !email || !password) {
          return new Response(JSON.stringify({ error: "missing_required_fields" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (password.length < 6) {
          return new Response(JSON.stringify({ error: "password_too_short" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const cleanEmail = String(email).trim().toLowerCase();
        const cleanName = String(full_name).trim();
        const cleanCode = String(employee_code).trim();

        if (hasServiceRole) {
          // Standard Architecture: Use Supabase Auth Admin API
          let authUserId: string | null = null;
          let createdNewUser = false;

          const { data: newAuthData, error: createAuthError } =
            await adminClient.auth.admin.createUser({
              email: cleanEmail,
              password: password,
              email_confirm: true,
              user_metadata: { full_name: cleanName },
            });

          if (createAuthError) {
            const errLower = createAuthError.message.toLowerCase();
            if (errLower.includes("already registered") || errLower.includes("already exists")) {
              // User already exists in Auth: check if already linked to an employee
              const { data: userList } = await adminClient.auth.admin.listUsers();
              const existing = userList?.users?.find(
                (u: { email?: string }) => u.email?.toLowerCase() === cleanEmail
              );
              if (!existing) {
                throw createAuthError;
              }

              const { data: existingLinkedEmp } = await adminClient
                .from("employees")
                .select("id")
                .eq("profile_id", existing.id)
                .maybeSingle();

              if (existingLinkedEmp) {
                return new Response(JSON.stringify({ error: "auth_account_already_linked" }), {
                  status: 400,
                  headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
              }

              // Update existing auth user password and status
              await adminClient.auth.admin.updateUserById(existing.id, {
                password: password,
                user_metadata: { full_name: cleanName },
                ban_duration: is_active ? "none" : "876000h",
              });
              authUserId = existing.id;
            } else {
              throw createAuthError;
            }
          } else if (newAuthData?.user) {
            authUserId = newAuthData.user.id;
            createdNewUser = true;
          }

          if (!authUserId) {
            throw new Error("failed_to_resolve_auth_user");
          }

          // Complete employee record creation in PostgreSQL
          try {
            const { data: dbData, error: dbError } = await adminClient.rpc(
              "hr_complete_employee_account",
              {
                _user_id: authUserId,
                _employee_code: cleanCode,
                _full_name: cleanName,
                _email: cleanEmail,
                _role: role,
                _department_id: department_id || null,
                _job_title: job_title || null,
                _supervisor_id: supervisor_id || null,
                _manager_id: manager_id || null,
                _requires_manager_approval: requires_manager_approval ?? true,
                _is_active: is_active ?? true,
                _caller_id: userData.user.id,
              }
            );

            if (dbError) throw dbError;
            result = dbData;
          } catch (dbErr) {
            // Roll back the created Auth user if database insertion failed
            if (createdNewUser && authUserId) {
              await adminClient.auth.admin.deleteUser(authUserId);
            }
            throw dbErr;
          }
        } else {
          // Fallback when service role key is not configured in environment
          const { data, error } = await userClient.rpc("hr_create_employee_account", {
            _full_name: cleanName,
            _employee_code: cleanCode,
            _email: cleanEmail,
            _password: password,
            _role: role,
            _department_id: department_id || null,
            _job_title: job_title || null,
            _supervisor_id: supervisor_id || null,
            _manager_id: manager_id || null,
            _requires_manager_approval: requires_manager_approval ?? true,
            _is_active: is_active ?? true,
          });

          if (error) throw error;
          result = data;
        }
        break;
      }

      case "update_account": {
        const {
          employee_id,
          full_name,
          employee_code,
          email,
          role,
          department_id = null,
          job_title = null,
          supervisor_id = null,
          manager_id = null,
          requires_manager_approval = true,
          is_active = true,
        } = payload;

        const { data, error } = await userClient.rpc("hr_update_employee_account", {
          _employee_id: employee_id,
          _full_name: full_name,
          _employee_code: employee_code,
          _email: email,
          _role: role,
          _department_id: department_id,
          _job_title: job_title,
          _supervisor_id: supervisor_id,
          _manager_id: manager_id,
          _requires_manager_approval: requires_manager_approval,
          _is_active: is_active,
        });

        if (error) throw error;

        // If service role is available, sync to Auth admin
        if (hasServiceRole) {
          const { data: emp } = await adminClient
            .from("employees")
            .select("profile_id")
            .eq("id", employee_id)
            .maybeSingle();

          if (emp?.profile_id) {
            await adminClient.auth.admin.updateUserById(emp.profile_id, {
              user_metadata: { full_name: String(full_name).trim() },
              ban_duration: is_active ? "none" : "876000h",
            });
          }
        }

        result = data;
        break;
      }

      case "reset_password": {
        const { employee_id, new_password } = payload;
        if (!employee_id || !new_password || new_password.length < 6) {
          return new Response(JSON.stringify({ error: "password_too_short" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Update via DB RPC
        const { data, error } = await userClient.rpc("hr_reset_employee_password", {
          _employee_id: employee_id,
          _new_password: new_password,
        });

        if (error) throw error;

        // If service role available, update via Auth admin API
        if (hasServiceRole) {
          const { data: emp } = await adminClient
            .from("employees")
            .select("profile_id")
            .eq("id", employee_id)
            .maybeSingle();

          if (emp?.profile_id) {
            await adminClient.auth.admin.updateUserById(emp.profile_id, {
              password: new_password,
            });
          }
        }

        result = data;
        break;
      }

      case "toggle_status": {
        const { employee_id, is_active } = payload;
        const { data, error } = await userClient.rpc("hr_toggle_account_status", {
          _employee_id: employee_id,
          _is_active: is_active,
        });

        if (error) throw error;

        if (hasServiceRole) {
          const { data: emp } = await adminClient
            .from("employees")
            .select("profile_id")
            .eq("id", employee_id)
            .maybeSingle();

          if (emp?.profile_id) {
            await adminClient.auth.admin.updateUserById(emp.profile_id, {
              ban_duration: is_active ? "none" : "876000h",
            });
          }
        }

        result = data;
        break;
      }

      case "link_account": {
        const { employee_id, user_id, role = "employee" } = payload;
        const { data, error } = await userClient.rpc("hr_link_employee_to_account", {
          _employee_id: employee_id,
          _user_id: user_id,
          _role: role,
        });

        if (error) throw error;
        result = data;
        break;
      }

      default:
        return new Response(JSON.stringify({ error: "invalid_action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify(result || { success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Manage-account error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "internal_error", details: String(err) }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
