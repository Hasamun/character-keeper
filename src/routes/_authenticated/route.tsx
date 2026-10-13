import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CharactersProvider } from "@/lib/characters-store";
import { AccountBar } from "@/components/AccountBar";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { redirect: location.href } });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  useEffect(() => {
    // Return to the page the user wanted before a Google sign-in round-trip.
    const p = sessionStorage.getItem("auth-redirect");
    if (p) {
      sessionStorage.removeItem("auth-redirect");
      if (p.startsWith("/") && !p.startsWith("//")) navigate({ to: p, replace: true });
    }
  }, [navigate]);
  return (
    <CharactersProvider userId={user.id}>
      <AccountBar email={user.email ?? ""} />
      <Outlet />
    </CharactersProvider>
  );
}
