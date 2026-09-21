-- UI language chosen in the app: 'ka' (default), 'en' or 'ru'. Written by the
-- client (best effort) so reminders and the assistant can follow it later.
-- Existing rows stay 'ka' — that is what every current user sees today.
alter table public.profiles
  add column if not exists language text not null default 'ka';

alter table public.profiles
  drop constraint if exists profiles_language_check;

alter table public.profiles
  add constraint profiles_language_check check (language in ('ka', 'en', 'ru'));
