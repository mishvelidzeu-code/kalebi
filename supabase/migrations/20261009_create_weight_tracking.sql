-- Weight-loss mode ("წონის კლება") — a Prime feature layered on top of cycle
-- tracking. Additive only: one new log table plus defaulted / nullable profile
-- columns. The live app never reads any of them, so applying this is invisible
-- to current users.

create table if not exists public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  weight_kg numeric(5,2) not null check (weight_kg between 20 and 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One weigh-in per day; the unique index also serves (user_id, date) range reads.
  unique (user_id, date)
);

comment on table public.weight_logs is 'Weight-loss mode: one weigh-in (kg) per user per day.';

alter table public.weight_logs enable row level security;

drop policy if exists "weight_logs_select_own" on public.weight_logs;
create policy "weight_logs_select_own"
  on public.weight_logs for select
  using (auth.uid() = user_id);

drop policy if exists "weight_logs_insert_own" on public.weight_logs;
create policy "weight_logs_insert_own"
  on public.weight_logs for insert
  with check (auth.uid() = user_id);

drop policy if exists "weight_logs_update_own" on public.weight_logs;
create policy "weight_logs_update_own"
  on public.weight_logs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "weight_logs_delete_own" on public.weight_logs;
create policy "weight_logs_delete_own"
  on public.weight_logs for delete
  using (auth.uid() = user_id);

-- Setup values. weight_mode is only the user's choice: the app still requires
-- Prime and turns the mode off for the fertility goal and for pregnancy, so a
-- user setting it on her own row gains nothing.
alter table public.profiles
  add column if not exists weight_mode boolean not null default false,
  add column if not exists height_cm numeric(4,1),
  add column if not exists weight_start_kg numeric(5,2),
  add column if not exists weight_target_kg numeric(5,2),
  add column if not exists activity_level text,
  add column if not exists weight_started_at date;

alter table public.profiles drop constraint if exists profiles_height_cm_check;
alter table public.profiles
  add constraint profiles_height_cm_check check (height_cm is null or height_cm between 100 and 250);

alter table public.profiles drop constraint if exists profiles_weight_start_kg_check;
alter table public.profiles
  add constraint profiles_weight_start_kg_check check (weight_start_kg is null or weight_start_kg between 20 and 400);

alter table public.profiles drop constraint if exists profiles_weight_target_kg_check;
alter table public.profiles
  add constraint profiles_weight_target_kg_check check (weight_target_kg is null or weight_target_kg between 20 and 400);

alter table public.profiles drop constraint if exists profiles_activity_level_check;
alter table public.profiles
  add constraint profiles_activity_level_check check (activity_level is null or activity_level in ('low', 'moderate', 'high'));
