alter table public.profiles
add column if not exists premium_override boolean not null default false;

comment on column public.profiles.premium_override is 'Admin/manual Prime access override. App Store purchases should still be managed through RevenueCat and is_premium.';
