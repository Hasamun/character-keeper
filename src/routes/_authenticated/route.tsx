import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
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
  return (
    <CharactersProvider userId={user.id}>
      <AccountBar email={user.email ?? ""} />
      <Outlet />
    </CharactersProvider>
  );
}
