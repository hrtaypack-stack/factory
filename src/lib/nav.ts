import type { AppRole } from "@/lib/labels";

export interface NavItem {
  to: string;
  label: string;
  icon: "dashboard" | "leave" | "overtime" | "employees" | "org" | "reports" | "settings";
  roles: AppRole[];
  /** shown in the mobile bottom bar */
  primary?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    to: "/dashboard",
    label: "الرئيسية",
    icon: "dashboard",
    roles: ["hr", "manager", "supervisor", "employee"],
    primary: true,
  },
  {
    to: "/leaves",
    label: "الإجازات",
    icon: "leave",
    roles: ["hr", "manager", "supervisor", "employee"],
    primary: true,
  },
  {
    to: "/overtime",
    label: "العمل الإضافي",
    icon: "overtime",
    roles: ["hr", "manager", "supervisor", "employee"],
    primary: true,
  },
  { to: "/employees", label: "الموظفون", icon: "employees", roles: ["hr", "manager", "supervisor"], primary: true },
  { to: "/org", label: "الهيكل التنظيمي", icon: "org", roles: ["hr"] },
  { to: "/leave-types", label: "أنواع الإجازات", icon: "settings", roles: ["hr"] },
  { to: "/reports", label: "التقارير", icon: "reports", roles: ["hr"] },
  { to: "/settings", label: "الإعدادات", icon: "settings", roles: ["hr", "manager", "supervisor", "employee"] },
];

export function navForRole(role: AppRole): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
