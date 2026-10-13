import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Новый пароль — Летопись героев" },
      { name: "description", content: "Задайте новый пароль для входа." },
      { property: "og:title", content: "Новый пароль — Летопись героев" },
      { property: "og:description", content: "Восстановление доступа." },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (window.location.hash.includes("type=recovery")) setOk(true);
    const { data } = supabase.auth.onAuthStateChange((e) => { if (e === "PASSWORD_RECOVERY") setOk(true); });
    return () => data.subscription.unsubscribe();
  }, []);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { toast.error("Не удалось сменить пароль"); return; }
    toast.success("Пароль изменён");
    navigate({ to: "/", replace: true });
  };
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <form onSubmit={save} className="panel grid w-full max-w-sm gap-3 p-6">
        <h1 className="text-2xl text-gold">Новый пароль</h1>
        {!ok && <p className="text-sm text-muted-foreground">Откройте эту страницу по ссылке из письма.</p>}
        <Label htmlFor="pw">Пароль</Label>
        <Input id="pw" type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" variant="gold" disabled={!ok}>Сохранить</Button>
      </form>
    </main>
  );
}
