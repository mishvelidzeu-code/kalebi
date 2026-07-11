-- Server-side daily usage tracking for the ai-assistant Edge Function.
-- Only the service role touches this table (RLS enabled, no policies on purpose).

create table if not exists public.assistant_ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_date date not null,
  feature text not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date, feature)
);

alter table public.assistant_ai_usage enable row level security;

-- Atomically consume one unit of daily usage.
-- Returns the new count, or -1 when the daily limit is already reached.
-- Usage day follows Georgian local time to match the in-app counter.
create or replace function public.consume_assistant_ai_usage(
  p_user_id uuid,
  p_feature text,
  p_limit integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Tbilisi')::date;
  v_count integer;
begin
  if p_limit is null or p_limit <= 0 then
    return -1;
  end if;

  insert into public.assistant_ai_usage as usage (user_id, usage_date, feature, count)
  values (p_user_id, v_today, p_feature, 1)
  on conflict (user_id, usage_date, feature)
  do update set count = usage.count + 1, updated_at = now()
  where usage.count < p_limit
  returning usage.count into v_count;

  if v_count is null then
    return -1;
  end if;

  return v_count;
end;
$$;

-- Give back one unit when the upstream AI call fails after consuming.
create or replace function public.refund_assistant_ai_usage(
  p_user_id uuid,
  p_feature text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.assistant_ai_usage
  set count = greatest(count - 1, 0), updated_at = now()
  where user_id = p_user_id
    and usage_date = (now() at time zone 'Asia/Tbilisi')::date
    and feature = p_feature;
end;
$$;

revoke all on function public.consume_assistant_ai_usage(uuid, text, integer) from public;
revoke all on function public.consume_assistant_ai_usage(uuid, text, integer) from anon;
revoke all on function public.consume_assistant_ai_usage(uuid, text, integer) from authenticated;
revoke all on function public.refund_assistant_ai_usage(uuid, text) from public;
revoke all on function public.refund_assistant_ai_usage(uuid, text) from anon;
revoke all on function public.refund_assistant_ai_usage(uuid, text) from authenticated;

grant execute on function public.consume_assistant_ai_usage(uuid, text, integer) to service_role;
grant execute on function public.refund_assistant_ai_usage(uuid, text) to service_role;
