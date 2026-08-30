import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];
export type RequestStatus = Database["public"]["Enums"]["request_status"];

export const ROLE_LABELS: Record<AppRole, string> = {
  hr: "الموارد البشرية",
  manager: "مدير",
  supervisor: "مشرف",
  employee: "موظف",
};

export const STATUS_LABELS: Record<RequestStatus, string> = {
  pending_manager: "بانتظار اعتماد المدير",
  pending_hr: "بانتظار اعتماد الإدارة",
  approved: "موافق عليها",
  rejected: "مرفوضة",
  cancelled: "ملغاة",
};

export const STATUS_TONE: Record<RequestStatus, "warning" | "info" | "success" | "destructive" | "muted"> = {
  pending_manager: "warning",
  pending_hr: "info",
  approved: "success",
  rejected: "destructive",
  cancelled: "muted",
};

/** Role priority: the highest role decides the default landing area. */
export const ROLE_PRIORITY: AppRole[] = ["hr", "manager", "supervisor", "employee"];

export function primaryRole(roles: AppRole[]): AppRole {
  return ROLE_PRIORITY.find((r) => roles.includes(r)) ?? "employee";
}

export const AR = {
  appName: "نظام الإجازات والعمل الإضافي",
  factory: "إدارة شؤون العاملين بالمصنع",
  loading: "جارٍ التحميل…",
  errorTitle: "حدث خطأ أثناء تحميل البيانات",
  retry: "إعادة المحاولة",
  noData: "لا توجد بيانات لعرضها",
  signOut: "تسجيل الخروج",
  search: "بحث",
} as const;

/** Arabic messages for common Supabase auth errors. */
export function authErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "بيانات الدخول غير صحيحة";
  if (m.includes("email not confirmed")) return "لم يتم تأكيد البريد الإلكتروني بعد";
  if (m.includes("user already registered") || m.includes("already been registered"))
    return "هذا البريد الإلكتروني مسجل بالفعل";
  if (m.includes("password should be at least")) return "كلمة المرور قصيرة جدًا (٦ أحرف على الأقل)";
  if (m.includes("rate limit") || m.includes("too many"))
    return "تم تجاوز عدد المحاولات المسموح، يرجى المحاولة لاحقًا";
  return "تعذّر إتمام العملية، يرجى المحاولة مرة أخرى";
}
