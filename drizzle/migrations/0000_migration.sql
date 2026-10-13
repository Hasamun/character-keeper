create type public.app_role as enum ('admin', 'user');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  is_blocked boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

create policy "own roles readable" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "profiles readable by signed-in" on public.profiles for select to authenticated using (true);
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and is_blocked = (select p.is_blocked from public.profiles p where p.id = auth.uid()));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), ''));
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.characters (
  id text primary key,
  owner_id uuid not null,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index characters_owner_idx on public.characters(owner_id);
grant select, insert, update, delete on public.characters to authenticated;
grant all on public.characters to service_role;
alter table public.characters enable row level security;
create policy "owner select" on public.characters for select to authenticated using (owner_id = auth.uid());
create policy "owner insert" on public.characters for insert to authenticated with check (owner_id = auth.uid());
create policy "owner update" on public.characters for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner delete" on public.characters for delete to authenticated using (owner_id = auth.uid());