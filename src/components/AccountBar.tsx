import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export function AccountBar({ email }: { email: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
  return (
    <div className="mx-auto flex max-w-5xl items-center justify-end gap-2 px-4 pt-3 text-xs text-muted-foreground">
      <span className="truncate">{email}</span>
      <Button variant="ghost" size="sm" onClick={signOut}><LogOut /> Выйти</Button>
    </div>
  );
}
