alter table public.profiles
add column if not exists premium_plan text,
add column if not exists premium_source text,
add column if not exists premium_last_payment_at timestamptz,
add column if not exists premium_order_id text,
add column if not exists pregnancy_until timestamptz,
add column if not exists pregnancy_plan text,
add column if not exists pregnancy_source text,
add column if not exists pregnancy_last_payment_at timestamptz,
add column if not exists pregnancy_order_id text;

create table if not exists public.billing_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_key text not null check (product_key in ('prime', 'pregnancy')),
  platform text not null check (platform in ('ios', 'android', 'web', 'admin', 'unknown')),
  source text not null,
  status text not null check (status in ('active', 'expired', 'canceled', 'refunded', 'past_due')),
  plan_key text,
  starts_at timestamptz,
  ends_at timestamptz,
  canceled_at timestamptz,
  external_customer_id text,
  external_subscription_id text,
  external_order_id text,
  last_payment_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_entitlements_user_product_idx
  on public.billing_entitlements (user_id, product_key);

create index if not exists billing_entitlements_status_ends_at_idx
  on public.billing_entitlements (status, ends_at);

create index if not exists billing_entitlements_external_subscription_idx
  on public.billing_entitlements (source, external_subscription_id)
  where external_subscription_id is not null;

create unique index if not exists billing_entitlements_external_order_unique_idx
  on public.billing_entitlements (source, external_order_id)
  where external_order_id is not null;

create or replace function public.set_billing_entitlements_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_billing_entitlements_updated_at
  on public.billing_entitlements;

create trigger set_billing_entitlements_updated_at
before update on public.billing_entitlements
for each row
execute function public.set_billing_entitlements_updated_at();

alter table public.billing_entitlements enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'billing_entitlements'
      and policyname = 'Users can read own billing entitlements'
  ) then
    create policy "Users can read own billing entitlements"
      on public.billing_entitlements
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'billing_entitlements'
      and policyname = 'Admin can read all billing entitlements'
  ) then
    create policy "Admin can read all billing entitlements"
      on public.billing_entitlements
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
      and tablename = 'billing_entitlements'
      and policyname = 'Admin can manage billing entitlements'
  ) then
    create policy "Admin can manage billing entitlements"
      on public.billing_entitlements
      for all
      to authenticated
      using ((auth.jwt() ->> 'email') = 'mishvelidze.u@gmail.com')
      with check ((auth.jwt() ->> 'email') = 'mishvelidze.u@gmail.com');
  end if;
end $$;

insert into public.billing_entitlements (
  user_id,
  product_key,
  platform,
  source,
  status,
  plan_key,
  starts_at,
  ends_at,
  external_order_id,
  last_payment_at,
  metadata
)
select
  profile.id,
  'prime',
  case
    when profile.premium_source ilike '%ios%' or profile.premium_source ilike '%revenuecat%' then 'ios'
    when profile.premium_source ilike '%android%' then 'android'
    when profile.premium_source ilike '%admin%' then 'admin'
    else 'unknown'
  end,
  coalesce(profile.premium_source, case when profile.premium_override then 'admin_override' else 'legacy_profile' end),
  case
    when profile.premium_override then 'active'
    when profile.premium_until is null then 'active'
    when profile.premium_until > now() then 'active'
    else 'expired'
  end,
  profile.premium_plan,
  coalesce(profile.premium_last_payment_at, profile.created_at, now()),
  profile.premium_until,
  profile.premium_order_id,
  profile.premium_last_payment_at,
  jsonb_build_object('backfill', true, 'is_premium', profile.is_premium, 'premium_override', profile.premium_override)
from public.profiles as profile
where (
    coalesce(profile.is_premium, false) = true
    or coalesce(profile.premium_override, false) = true
  )
  and not exists (
    select 1
    from public.billing_entitlements as entitlement
    where entitlement.user_id = profile.id
      and entitlement.product_key = 'prime'
      and entitlement.metadata ->> 'backfill' = 'true'
  )
on conflict do nothing;

insert into public.billing_entitlements (
  user_id,
  product_key,
  platform,
  source,
  status,
  plan_key,
  starts_at,
  ends_at,
  external_order_id,
  last_payment_at,
  metadata
)
select
  profile.id,
  'pregnancy',
  case
    when profile.pregnancy_source ilike '%ios%' or profile.pregnancy_source ilike '%revenuecat%' then 'ios'
    when profile.pregnancy_source ilike '%android%' then 'android'
    when profile.pregnancy_source ilike '%admin%' then 'admin'
    else 'unknown'
  end,
  coalesce(profile.pregnancy_source, 'legacy_profile'),
  case
    when profile.pregnancy_until is null then 'active'
    when profile.pregnancy_until > now() then 'active'
    else 'expired'
  end,
  profile.pregnancy_plan,
  coalesce(profile.pregnancy_last_payment_at, profile.created_at, now()),
  profile.pregnancy_until,
  profile.pregnancy_order_id,
  profile.pregnancy_last_payment_at,
  jsonb_build_object('backfill', true, 'has_pregnancy_subscription', profile.has_pregnancy_subscription)
from public.profiles as profile
where coalesce(profile.has_pregnancy_subscription, false) = true
  and not exists (
    select 1
    from public.billing_entitlements as entitlement
    where entitlement.user_id = profile.id
      and entitlement.product_key = 'pregnancy'
      and entitlement.metadata ->> 'backfill' = 'true'
  )
on conflict do nothing;
