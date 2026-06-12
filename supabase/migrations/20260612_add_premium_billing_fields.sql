alter table public.profiles
add column if not exists premium_until timestamptz,
add column if not exists premium_plan text,
add column if not exists premium_source text,
add column if not exists premium_last_payment_at timestamptz,
add column if not exists premium_order_id text;

comment on column public.profiles.premium_until is 'Prime access expiration timestamp. Null can represent legacy/lifetime/manual access when combined with app logic.';
comment on column public.profiles.premium_plan is 'Prime billing plan identifier such as 1_month, 3_month, or 12_month.';
comment on column public.profiles.premium_source is 'Prime access source such as revenuecat_ios, android_web, or admin_override.';
comment on column public.profiles.premium_last_payment_at is 'Timestamp of the latest successful Prime payment event.';
comment on column public.profiles.premium_order_id is 'External order or payment identifier for Prime billing reconciliation.';
