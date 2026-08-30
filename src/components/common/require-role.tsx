import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { LoadingState, ErrorState } from "@/components/common/states";
import type { AppRole } from "@/lib/labels";

export function RequireRole({ roles, children }: { roles: AppRole[]; children: ReactNode }) {
  const { data: session, isPending, isError, refetch } = useSession();

  if (isPending) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const allowed = (session?.roles ?? []).some((r) => roles.includes(r));
  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <ShieldAlert className="size-9 text-destructive" aria-hidden />
        <p className="text-lg font-semibold">لا تملك صلاحية الوصول إلى هذه الصفحة</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          هذه الصفحة مخصصة لصلاحيات محددة. يرجى التواصل مع الموارد البشرية إذا كنت تحتاج إلى الوصول.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
