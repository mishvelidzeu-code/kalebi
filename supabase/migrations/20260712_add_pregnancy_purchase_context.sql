alter table public.profiles
add column if not exists pregnancy_purchase_context text;

comment on column public.profiles.pregnancy_purchase_context is 'Analytics-only marker for which screen initiated the shared pregnancy/fertility subscription purchase: "fertility" (მინდა დაორსულება) or "pregnancy" (ორსულობის რეჟიმი). Does not affect access — one subscription unlocks both modes.';
