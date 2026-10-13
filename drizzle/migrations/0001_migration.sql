drop policy "own profile update" on public.profiles;
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());