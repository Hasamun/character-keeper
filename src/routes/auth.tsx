import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

type Search = { redirect?: string };
const safePath = (p?: string) => (p && p.startsWith("/") && !p.startsWith("//") ? p : "/");

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): Search => (typeof s["redirect"] === "string" ? { redirect: s["redirect"] } : {}),
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Вход — Летопись героев" },
      { name: "description", content: "Войдите, чтобы ваши герои были доступны на любом устройстве." },
      { property: "og:title", content: "Вход — Летопись героев" },
      { property: "og:description", content: "Вход в трекер персонажей." },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const { redirect } = Route.useSearch();
  const target = safePath(redirect);
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) navigate({ to: target, replace: true }); });
  }, [navigate, target]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: target, replace: true });
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + target } });
        if (error) throw error;
        toast.success("Проверьте почту — мы отправили ссылку для подтверждения.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        toast.success("Ссылка для смены пароля отправлена на почту.");
        setMode("signin");
      }
    } catch (err) {
      toast.error(err instanceof Error ? translate(err.message) : "Что-то пошло не так");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    if (target !== "/") sessionStorage.setItem("auth-redirect", target);
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) { toast.error("Не удалось войти через Google"); return; }
    if (r.redirected) return;
    navigate({ to: target, replace: true });
  };

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="panel w-full max-w-sm p-6">
        <p className="text-center text-xs uppercase tracking-[0.3em] text-muted-foreground">Трекер персонажей</p>
        <h1 className="mb-6 mt-1 text-center text-3xl font-bold text-gold">Летопись героев</h1>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="email">Почта</Label>
            <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {mode !== "forgot" && (
            <div className="grid gap-1.5">
              <Label htmlFor="password">Пароль</Label>
              <Input id="password" type="password" minLength={6} required autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          )}
          <Button type="submit" variant="gold" size="lg" disabled={busy}>
            {mode === "signin" ? "Войти" : mode === "signup" ? "Зарегистрироваться" : "Отправить ссылку"}
          </Button>
        </form>
        {mode !== "forgot" && (
          <>
            <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />или<span className="h-px flex-1 bg-border" /></div>
            <Button variant="outline" size="lg" className="w-full" onClick={google}>Продолжить с Google</Button>
          </>
        )}
        <div className="mt-5 grid gap-1 text-center text-sm">
          {mode === "signin" && <>
            <button className="text-primary hover:underline" onClick={() => setMode("signup")}>Нет аккаунта? Зарегистрироваться</button>
            <button className="text-muted-foreground hover:text-foreground" onClick={() => setMode("forgot")}>Забыли пароль?</button>
          </>}
          {mode !== "signin" && <button className="text-primary hover:underline" onClick={() => setMode("signin")}>Уже есть аккаунт? Войти</button>}
        </div>
      </div>
    </main>
  );
}

function translate(m: string) {
  if (/invalid login/i.test(m)) return "Неверная почта или пароль";
  if (/not confirmed/i.test(m)) return "Подтвердите почту по ссылке из письма";
  if (/already registered/i.test(m)) return "Такой аккаунт уже есть";
  if (/password/i.test(m) && /weak|pwned|leaked/i.test(m)) return "Слишком простой пароль, выберите другой";
  return m;
}
