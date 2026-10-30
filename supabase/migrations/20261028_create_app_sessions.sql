-- App usage tracking: one row per foreground visit to the app, so the admin
-- panel can show how many people open it, how often and for how long.
--
-- The client generates the id and upserts the row twice: when the visit starts
-- (so it counts even if the app is killed) and when it goes to the background
-- (ended_at + duration). Times come from the device clock, because a visit
-- queued offline is uploaded later and server time would be wrong for it.

create table if not exists public.app_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds integer,
  platform text,
  app_version text,
  created_at timestamptz not null default now()
);

comment on table public.app_sessions is 'One row per foreground visit to the app (admin usage stats).';

create index if not exists app_sessions_started_at_idx
  on public.app_sessions (started_at desc);

create index if not exists app_sessions_user_started_at_idx
  on public.app_sessions (user_id, started_at desc);

alter table public.app_sessions enable row level security;

-- Upsert (insert ... on conflict do update) needs select as well as insert and
-- update on the user's own rows. Nobody else's rows are visible.
drop policy if exists "Users can read their own app sessions" on public.app_sessions;
create policy "Users can read their own app sessions"
  on public.app_sessions
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can insert their own app sessions" on public.app_sessions;
create policy "Users can insert their own app sessions"
  on public.app_sessions
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update their own app sessions" on public.app_sessions;
create policy "Users can update their own app sessions"
  on public.app_sessions
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Usage numbers for the admin dashboard. Callable by the admin from the app,
-- and from the SQL editor (`select public.admin_app_usage_stats();`).
create or replace function public.admin_app_usage_stats(p_days integer default 14)
returns jsonb
language plpgsql
security definer
set search_path = public
-- auth.sessions.refreshed_at is a timestamp without time zone holding UTC.
set timezone = 'UTC'
as $$
declare
  admin_email constant text := 'mishvelidze.u@gmail.com';
  v_tz constant text := 'Asia/Tbilisi';
  -- Longer than this is an app left open on a table, not use; kept out of averages.
  v_max_seconds constant integer := 4 * 60 * 60;
  v_days integer := least(greatest(coalesce(p_days, 14), 1), 60);
  v_today date := (now() at time zone v_tz)::date;
  v_first_day date := v_today - (v_days - 1);
  v_total_users integer;
  v_active jsonb;
  v_week jsonb;
  v_daily jsonb;
  v_tracking_since timestamptz;
begin
  -- execute is granted to authenticated only, so a null uid here is the SQL
  -- editor or service_role.
  if auth.uid() is not null and coalesce(auth.jwt() ->> 'email', '') <> admin_email then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select count(*) into v_total_users from auth.users;

  -- Last time each user was seen. Supabase renews the login token about once an
  -- hour while the app is open, so auth.sessions also covers the time before
  -- app_sessions existed.
  begin
    with seen as (
      select user_id, greatest(created_at, updated_at, refreshed_at) as seen_at
      from auth.sessions
      union all
      select user_id, coalesce(ended_at, started_at)
      from public.app_sessions
    ),
    last_seen as (
      select user_id, max(seen_at) as seen_at from seen group by user_id
    )
    select jsonb_build_object(
      'active_24h', count(*) filter (where seen_at > now() - interval '1 day'),
      'active_7d', count(*) filter (where seen_at > now() - interval '7 days'),
      'active_30d', count(*) filter (where seen_at > now() - interval '30 days')
    )
    into v_active
    from last_seen;
  exception when others then
    select jsonb_build_object(
      'active_24h', count(distinct user_id) filter (where coalesce(ended_at, started_at) > now() - interval '1 day'),
      'active_7d', count(distinct user_id) filter (where coalesce(ended_at, started_at) > now() - interval '7 days'),
      'active_30d', count(distinct user_id) filter (where coalesce(ended_at, started_at) > now() - interval '30 days')
    )
    into v_active
    from public.app_sessions;
  end;

  select min(started_at) into v_tracking_since from public.app_sessions;

  select jsonb_build_object(
    'sessions', count(*),
    'users', count(distinct user_id),
    'user_days', count(distinct (user_id, (started_at at time zone v_tz)::date)),
    'median_seconds', round(percentile_cont(0.5) within group (order by duration_seconds)
      filter (where duration_seconds between 0 and v_max_seconds)),
    'total_seconds', coalesce(sum(duration_seconds)
      filter (where duration_seconds between 0 and v_max_seconds), 0)
  )
  into v_week
  from public.app_sessions
  where started_at > now() - interval '7 days';

  with days as (
    select v_today - offs as day from generate_series(0, v_days - 1) as offs
  ),
  visits as (
    select
      (started_at at time zone v_tz)::date as day,
      count(distinct user_id) as users,
      count(*) as sessions,
      round(percentile_cont(0.5) within group (order by duration_seconds)
        filter (where duration_seconds between 0 and v_max_seconds)) as median_seconds
    from public.app_sessions
    where started_at >= (v_first_day::timestamp at time zone v_tz)
    group by 1
  ),
  signups as (
    select (created_at at time zone v_tz)::date as day, count(*) as new_users
    from auth.users
    where created_at >= (v_first_day::timestamp at time zone v_tz)
    group by 1
  )
  select jsonb_agg(
    jsonb_build_object(
      'day', days.day,
      'users', coalesce(visits.users, 0),
      'sessions', coalesce(visits.sessions, 0),
      'median_seconds', visits.median_seconds,
      'new_users', coalesce(signups.new_users, 0)
    )
    order by days.day desc
  )
  into v_daily
  from days
  left join visits on visits.day = days.day
  left join signups on signups.day = days.day;

  return jsonb_build_object(
    'total_users', v_total_users,
    'tracking_since', v_tracking_since,
    'week', v_week,
    'daily', coalesce(v_daily, '[]'::jsonb)
  ) || v_active;
end;
$$;

revoke all on function public.admin_app_usage_stats(integer) from public;
revoke all on function public.admin_app_usage_stats(integer) from anon;
grant execute on function public.admin_app_usage_stats(integer) to authenticated;
