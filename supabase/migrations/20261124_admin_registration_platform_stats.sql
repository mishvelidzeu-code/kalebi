-- Registrations by platform (iOS / Android) for the admin dashboard: today, all
-- time and per day.
--
-- The app never stored which platform an account was created on, so it is
-- worked out from what the device left behind, most reliable first:
--   1. the first app_sessions visit (platform = Platform.OS; recorded from the
--      first sign-in on builds with visit tracking, i.e. since 2026-10-28),
--   2. the user agent of the user's oldest login session in auth.sessions
--      (iOS: "...CFNetwork/... Darwin/...", Android: "okhttp/..."),
--   3. the platform of the user's push tokens, when they are all one platform.
-- Anything left is counted as "unknown".
--
-- Callable by the admin from the app, and from the SQL editor:
--   select public.admin_registration_platform_stats();

create or replace function public.admin_registration_platform_stats(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
set timezone = 'UTC'
as $$
declare
  v_tz constant text := 'Asia/Tbilisi';
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 90);
  v_today date := (now() at time zone v_tz)::date;
  v_first_day date := v_today - (v_days - 1);
  v_ua jsonb := '{}'::jsonb;
  v_result jsonb;
begin
  -- Same admin rule as the activity stats, kept in one place: that function
  -- raises 42501 for any signed-in user who is not the admin (the SQL editor
  -- and service_role pass).
  perform public.admin_app_usage_stats(1);

  -- Separate block: if auth.sessions or its user_agent column ever changes,
  -- the stats still work from the other two sources.
  begin
    select coalesce(jsonb_object_agg(user_id, platform), '{}'::jsonb)
    into v_ua
    from (
      select distinct on (user_id) user_id, platform
      from (
        select
          user_id,
          created_at,
          case
            when user_agent ~* '(okhttp|android|dalvik)' then 'android'
            when user_agent ~* '(cfnetwork|darwin|iphone|ipad|ios)' then 'ios'
          end as platform
        from auth.sessions
      ) sessions_with_platform
      where platform is not null
      order by user_id, created_at
    ) first_login;
  exception when others then
    v_ua := '{}'::jsonb;
  end;

  with first_visit as (
    select distinct on (user_id) user_id, platform
    from public.app_sessions
    where platform in ('ios', 'android')
    order by user_id, started_at
  ),
  token_platform as (
    select user_id, min(platform) as platform
    from public.push_tokens
    where platform in ('ios', 'android')
    group by user_id
    having count(distinct platform) = 1
  ),
  registrations as (
    select
      (coalesce(u.created_at, p.created_at) at time zone v_tz)::date as day,
      coalesce(fv.platform, v_ua ->> p.id::text, tp.platform, 'unknown') as platform,
      case
        when fv.platform is not null then 'app_sessions'
        when v_ua ? p.id::text then 'user_agent'
        when tp.platform is not null then 'push_token'
        else 'unknown'
      end as source
    from public.profiles p
    left join auth.users u on u.id = p.id
    left join first_visit fv on fv.user_id = p.id
    left join token_platform tp on tp.user_id = p.id
  ),
  days as (
    select v_today - offs as day from generate_series(0, v_days - 1) as offs
  ),
  per_day as (
    select
      days.day,
      count(r.day) filter (where r.platform = 'ios') as ios,
      count(r.day) filter (where r.platform = 'android') as android,
      count(r.day) filter (where r.platform = 'unknown') as unknown
    from days
    left join registrations r on r.day = days.day
    group by days.day
  )
  select jsonb_build_object(
    'today', jsonb_build_object(
      'all', count(*) filter (where day = v_today),
      'ios', count(*) filter (where day = v_today and platform = 'ios'),
      'android', count(*) filter (where day = v_today and platform = 'android'),
      'unknown', count(*) filter (where day = v_today and platform = 'unknown')
    ),
    'total', jsonb_build_object(
      'all', count(*),
      'ios', count(*) filter (where platform = 'ios'),
      'android', count(*) filter (where platform = 'android'),
      'unknown', count(*) filter (where platform = 'unknown')
    ),
    'sources', jsonb_build_object(
      'app_sessions', count(*) filter (where source = 'app_sessions'),
      'user_agent', count(*) filter (where source = 'user_agent'),
      'push_token', count(*) filter (where source = 'push_token'),
      'unknown', count(*) filter (where source = 'unknown')
    ),
    'daily', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('day', day, 'ios', ios, 'android', android, 'unknown', unknown)
          order by day desc
        ),
        '[]'::jsonb
      )
      from per_day
    )
  )
  into v_result
  from registrations;

  return v_result;
end;
$$;

revoke all on function public.admin_registration_platform_stats(integer) from public;
revoke all on function public.admin_registration_platform_stats(integer) from anon;
grant execute on function public.admin_registration_platform_stats(integer) to authenticated;
