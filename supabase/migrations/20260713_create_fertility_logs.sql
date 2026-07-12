-- Fertility ("მინდა დაორსულება") mode tracking log.
-- One flexible table for all daily fertility entries; `value` is a small jsonb
-- payload whose shape depends on `type`.
create table if not exists public.fertility_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  type text not null check (type in
    ('intercourse', 'lh_test', 'bbt', 'cervical_mucus', 'ovulation_symptom')),
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date, type)
);

comment on table public.fertility_logs is 'Daily fertility-mode entries. value shape by type: intercourse {protected:bool}, lh_test {result:negative|weak|positive|peak}, bbt {temp:number}, cervical_mucus {mucus:dry|sticky|creamy|watery|eggwhite}, ovulation_symptom {symptoms:text[]}.';

create index if not exists fertility_logs_user_date_idx
  on public.fertility_logs (user_id, date);

alter table public.fertility_logs enable row level security;

drop policy if exists "fertility_logs_select_own" on public.fertility_logs;
create policy "fertility_logs_select_own"
  on public.fertility_logs for select
  using (auth.uid() = user_id);

drop policy if exists "fertility_logs_insert_own" on public.fertility_logs;
create policy "fertility_logs_insert_own"
  on public.fertility_logs for insert
  with check (auth.uid() = user_id);

drop policy if exists "fertility_logs_update_own" on public.fertility_logs;
create policy "fertility_logs_update_own"
  on public.fertility_logs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "fertility_logs_delete_own" on public.fertility_logs;
create policy "fertility_logs_delete_own"
  on public.fertility_logs for delete
  using (auth.uid() = user_id);
