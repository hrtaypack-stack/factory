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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
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

    // Use admin client with service_role if available, or fall back to user-authenticated RPC
    const adminClient = supabaseServiceKey
      ? createClient(supabaseUrl, supabaseServiceKey)
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

        // Call the transactional database function
        const { data, error } = await userClient.rpc("hr_create_employee_account", {
          _full_name: full_name,
          _employee_code: employee_code,
          _email: email,
          _password: password,
          _role: role,
          _department_id: department_id,
          _job_title: job_title,
          _supervisor_id: supervisor_id,
          _manager_id: manager_id,
          _requires_manager_approval: requires_manager_approval,
          _is_active: is_active,
        });

        if (error) throw error;
        result = data;
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

        const { data, error } = await userClient.rpc("hr_reset_employee_password", {
          _employee_id: employee_id,
          _new_password: new_password,
        });

        if (error) throw error;
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

