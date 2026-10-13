import { useQuery } from "@tanstack/react-query";
import { accountQuery } from "@/lib/catalog-queries";
import { clearItemImageCache } from "@/lib/item-images";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export function AccountBar({ email }: { email: string }) {
  const { data: access } = useQuery(accountQuery());
  const navigate = useNavigate();
  const qc = useQueryClient();
  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    clearItemImageCache();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
  return (
    <div className="mx-auto flex max-w-5xl items-center justify-end gap-2 px-4 pt-3 text-xs text-muted-foreground">
      {access?.active && <Button variant="ghost" size="sm" asChild><Link to="/catalog" search={{q:"",category:"all",rank:"all",slot:"all",subtype:"",sort:"recent",page:1,view:"grid"}}>Каталог</Link></Button>}
      {access?.active && access.admin && <Button variant="ghost" size="sm" asChild><Link to="/admin" search={{page:1}}>Админ</Link></Button>}
      <span className="truncate">{email}</span>
      <Button variant="ghost" size="sm" onClick={signOut}><LogOut /> Выйти</Button>
    </div>
  );
}
