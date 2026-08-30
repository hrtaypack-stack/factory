import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { AR, authErrorMessage } from "@/lib/labels";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "تسجيل الدخول | نظام الإجازات والعمل الإضافي" },
      {
        name: "description",
        content: "تسجيل الدخول إلى نظام إدارة الإجازات والعمل الإضافي الخاص بالمصنع.",
      },
      { property: "og:title", content: "تسجيل الدخول | نظام الإجازات والعمل الإضافي" },
      {
        property: "og:description",
        content: "تسجيل الدخول إلى نظام إدارة الإجازات والعمل الإضافي الخاص بالمصنع.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [name, setName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      if (data.user) navigate({ to: "/dashboard", replace: true });
      else setChecking(false);
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword) {
      toast.error("يرجى إدخال البريد الإلكتروني وكلمة المرور");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword,
    });
    setBusy(false);
    if (error) {
      toast.error(authErrorMessage(error.message));
      return;
    }
    toast.success("تم تسجيل الدخول بنجاح");
    navigate({ to: "/dashboard", replace: true });
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("يرجى إدخال الاسم الكامل");
      return;
    }
    if (signupPassword.length < 6) {
      toast.error("كلمة المرور يجب أن تكون ٦ أحرف على الأقل");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: signupEmail.trim(),
      password: signupPassword,
      options: {
        data: { full_name: name.trim() },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });
    setBusy(false);
    if (error) {
      toast.error(authErrorMessage(error.message));
      return;
    }
    toast.success("تم إنشاء الحساب، يمكنك الآن تسجيل الدخول");
    navigate({ to: "/dashboard", replace: true });
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-7 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-secondary px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Building2 className="size-7" aria-hidden />
          </div>
          <h1 className="mt-4 text-2xl font-bold">{AR.appName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{AR.factory}</p>
        </div>

        <div className="surface-card p-5">
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login" className="py-2.5 text-base">
                تسجيل الدخول
              </TabsTrigger>
              <TabsTrigger value="signup" className="py-2.5 text-base">
                إنشاء حساب
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form className="mt-4 space-y-4" onSubmit={handleLogin}>
                <div className="space-y-2">
                  <Label htmlFor="login-email">البريد الإلكتروني</Label>
                  <Input
                    id="login-email"
                    type="email"
                    dir="ltr"
                    autoComplete="email"
                    className="h-12 text-base"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">كلمة المرور</Label>
                  <Input
                    id="login-password"
                    type="password"
                    dir="ltr"
                    autoComplete="current-password"
                    className="h-12 text-base"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={busy}>
                  {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : "دخول"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form className="mt-4 space-y-4" onSubmit={handleSignup}>
                <div className="space-y-2">
                  <Label htmlFor="signup-name">الاسم الكامل</Label>
                  <Input
                    id="signup-name"
                    className="h-12 text-base"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">البريد الإلكتروني</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    dir="ltr"
                    autoComplete="email"
                    className="h-12 text-base"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">كلمة المرور</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    dir="ltr"
                    autoComplete="new-password"
                    className="h-12 text-base"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">٦ أحرف على الأقل</p>
                </div>
                <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={busy}>
                  {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : "إنشاء الحساب"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  الحسابات الجديدة تُنشأ بصلاحية «موظف»، وتقوم الموارد البشرية بتحديد الصلاحيات
                  وربط الحساب بملف الموظف.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
