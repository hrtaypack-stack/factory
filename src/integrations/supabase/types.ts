export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      departments: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          created_at: string
          department_id: string | null
          email: string | null
          employee_code: string
          full_name: string
          hourly_rate: number | null
          id: string
          is_active: boolean
          job_title: string | null
          manager_id: string | null
          profile_id: string | null
          requires_manager_approval: boolean
          supervisor_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          email?: string | null
          employee_code: string
          full_name: string
          hourly_rate?: number | null
          id?: string
          is_active?: boolean
          job_title?: string | null
          manager_id?: string | null
          profile_id?: string | null
          requires_manager_approval?: boolean
          supervisor_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          email?: string | null
          employee_code?: string
          full_name?: string
          hourly_rate?: number | null
          id?: string
          is_active?: boolean
          job_title?: string | null
          manager_id?: string | null
          profile_id?: string | null
          requires_manager_approval?: boolean
          supervisor_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          created_at: string
          days_count: number
          employee_id: string
          end_date: string
          hr_decided_at: string | null
          hr_decided_by: string | null
          id: string
          leave_type_id: string
          manager_decided_at: string | null
          manager_decided_by: string | null
          manager_id: string | null
          reason: string | null
          rejection_reason: string | null
          start_date: string
          status: Database["public"]["Enums"]["request_status"]
          submitted_by: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          days_count?: number
          employee_id: string
          end_date: string
          hr_decided_at?: string | null
          hr_decided_by?: string | null
          id?: string
          leave_type_id: string
          manager_decided_at?: string | null
          manager_decided_by?: string | null
          manager_id?: string | null
          reason?: string | null
          rejection_reason?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["request_status"]
          submitted_by: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          days_count?: number
          employee_id?: string
          end_date?: string
          hr_decided_at?: string | null
          hr_decided_by?: string | null
          id?: string
          leave_type_id?: string
          manager_decided_at?: string | null
          manager_decided_by?: string | null
          manager_id?: string | null
          reason?: string | null
          rejection_reason?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["request_status"]
          submitted_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_types: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          is_paid: boolean
          max_days_per_year: number | null
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_paid?: boolean
          max_days_per_year?: number | null
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_paid?: boolean
          max_days_per_year?: number | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      overtime_request_employees: {
        Row: {
          created_at: string
          employee_id: string
          hours: number | null
          id: string
          overtime_request_id: string
          shift_code: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          hours?: number | null
          id?: string
          overtime_request_id: string
          shift_code?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          hours?: number | null
          id?: string
          overtime_request_id?: string
          shift_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "overtime_request_employees_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_request_employees_overtime_request_id_fkey"
            columns: ["overtime_request_id"]
            isOneToOne: false
            referencedRelation: "overtime_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      overtime_requests: {
        Row: {
          created_at: string
          department_id: string | null
          hr_decided_at: string | null
          hr_decided_by: string | null
          id: string
          manager_decided_at: string | null
          manager_decided_by: string | null
          manager_id: string | null
          notes: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["request_status"]
          submitted_by: string
          updated_at: string
          work_date: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          hr_decided_at?: string | null
          hr_decided_by?: string | null
          id?: string
          manager_decided_at?: string | null
          manager_decided_by?: string | null
          manager_id?: string | null
          notes?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          submitted_by: string
          updated_at?: string
          work_date: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          hr_decided_at?: string | null
          hr_decided_by?: string | null
          id?: string
          manager_decided_at?: string | null
          manager_decided_by?: string | null
          manager_id?: string | null
          notes?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          submitted_by?: string
          updated_at?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "overtime_requests_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_requests_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      employee_in_my_scope: { Args: { _employee_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_hr: { Args: never; Returns: boolean }
      my_employee_id: { Args: never; Returns: string }
    }
    Enums: {
      app_role: "hr" | "manager" | "supervisor" | "employee"
      request_status:
        | "pending_manager"
        | "pending_hr"
        | "approved"
        | "rejected"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["hr", "manager", "supervisor", "employee"],
      request_status: [
        "pending_manager",
        "pending_hr",
        "approved",
        "rejected",
        "cancelled",
      ],
    },
  },
} as const
