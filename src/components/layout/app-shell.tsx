import { useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarDays,
  Clock,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  Settings,
  Upload,
  UserCog,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { navForRole, type NavItem } from "@/lib/nav";
import { AR, ROLE_LABELS } from "@/lib/labels";
import { useSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const ICONS = {
  dashboard: LayoutDashboard,
  leave: CalendarDays,
  overtime: Clock,
  employees: Users,
  org: Network,
  reports: BarChart3,
  settings: Settings,
  import: Upload,
  accounts: UserCog,
} as const;

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition-colors",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-5 shrink-0" aria-hidden />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const role = session?.role ?? "employee";
  const items = navForRole(role);
  const bottomItems = items.filter((i) => i.primary);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("تعذّر تسجيل الخروج، حاول مرة أخرى");
      return;
    }
    navigate({ to: "/auth", replace: true });
  }

  const sidebarBody = (
    <div className="flex h-full flex-col gap-6 bg-sidebar p-4 text-sidebar-foreground">
      <div className="px-2">
        <p className="text-lg font-bold leading-tight">{AR.appName}</p>
        <p className="mt-1 text-xs text-sidebar-foreground/70">{AR.factory}</p>
      </div>
      <NavLinks items={items} onNavigate={() => setMenuOpen(false)} />
      <div className="mt-auto rounded-lg bg-sidebar-accent p-3">
        <p className="truncate text-sm font-semibold">{session?.fullName}</p>
        <p className="text-xs text-sidebar-foreground/70">{ROLE_LABELS[role]}</p>
        {session?.employee ? (
          <p className="mt-1 text-xs text-sidebar-foreground/70">
            الكود: {session.employee.employee_code}
          </p>
        ) : null}
        <Button variant="secondary" size="lg" className="mt-3 w-full" onClick={handleSignOut}>
          <LogOut className="size-4" aria-hidden />
          {AR.signOut}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 start-0 hidden w-72 border-e lg:block">{sidebarBody}</aside>

      <div className="lg:ms-72">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b bg-card/95 px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex items-center gap-2">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="size-11 lg:hidden" aria-label="القائمة">
                  <Menu className="size-6" aria-hidden />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[85vw] max-w-xs border-s-0 p-0">
                <SheetTitle className="sr-only">القائمة الرئيسية</SheetTitle>
                {sidebarBody}
              </SheetContent>
            </Sheet>
            <div className="lg:hidden">
              <p className="text-sm font-bold leading-tight">{AR.appName}</p>
              <p className="text-[11px] text-muted-foreground">{ROLE_LABELS[role]}</p>
            </div>
          </div>
          <div className="hidden items-center gap-3 lg:flex">
            <span className="text-sm text-muted-foreground">مرحبًا،</span>
            <span className="text-sm font-semibold">{session?.fullName}</span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-4 lg:px-8 lg:pb-10">{children}</main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-card lg:hidden">
        <ul className="grid grid-cols-4">
          {bottomItems.map((item) => {
            const Icon = ICONS[item.icon];
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  activeProps={{ className: "text-primary" }}
                  className="flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium text-muted-foreground"
                >
                  <Icon className="size-6" aria-hidden />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
