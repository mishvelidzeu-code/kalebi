-- profiles is writable by its owner (RLS policy "Users can update their profile",
-- no column restriction), which is fine for everything the app itself writes:
-- is_premium and has_pregnancy_subscription are overwritten from the store on
-- every launch, so a self-granted value does not survive.
--
-- premium_override is the exception. ThemeContext short-circuits on it and never
-- consults RevenueCat, so a user who set it on their own row would keep Prime
-- forever. Lock it here, at the database, where the client cannot argue.
--
-- Only this flag is locked. The other billing columns still have to be writable
-- by the client until those writes move server-side.

create or replace function public.guard_premium_override()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_email constant text := 'mishvelidze.u@gmail.com';
begin
  -- No end-user JWT: service_role, migrations, the SQL editor. Left alone so
  -- server-side code and manual admin work keep working.
  if auth.uid() is null then
    return new;
  end if;

  -- The admin dashboard toggles this from the client with the admin's own JWT.
  if coalesce(auth.jwt() ->> 'email', '') = admin_email then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.premium_override, false) then
      new.premium_override := false;
    end if;

    return new;
  end if;

  if new.premium_override is distinct from old.premium_override then
    raise exception 'premium_override can only be changed by an administrator'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_premium_override on public.profiles;

create trigger guard_premium_override
before insert or update on public.profiles
for each row
execute function public.guard_premium_override();
