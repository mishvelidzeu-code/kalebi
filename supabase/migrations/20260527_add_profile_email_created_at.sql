alter table public.profiles
add column if not exists email text,
add column if not exists created_at timestamptz;

alter table public.profiles
alter column created_at set default now();

create index if not exists profiles_created_at_idx
  on public.profiles (created_at desc);

create index if not exists profiles_email_idx
  on public.profiles (lower(email));

comment on column public.profiles.email is 'Cached auth email for admin search and support workflows.';
comment on column public.profiles.created_at is 'Profile creation timestamp used for admin dashboard metrics.';

update public.profiles as profile
set email = auth_user.email
from auth.users as auth_user
where profile.id = auth_user.id
  and profile.email is null;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Admin can read all profiles'
  ) then
    create policy "Admin can read all profiles"
      on public.profiles
      for select
      to authenticated
      using ((auth.jwt() ->> 'email') = 'mishvelidze.u@gmail.com');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Admin can update all profiles'
  ) then
    create policy "Admin can update all profiles"
      on public.profiles
      for update
      to authenticated
      using ((auth.jwt() ->> 'email') = 'mishvelidze.u@gmail.com')
      with check ((auth.jwt() ->> 'email') = 'mishvelidze.u@gmail.com');
  end if;
end $$;
