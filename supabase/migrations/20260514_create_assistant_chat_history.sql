create extension if not exists pgcrypto with schema extensions;

create table if not exists public.assistant_chat_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question text not null,
  answer text not null,
  source text not null default 'ai',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.assistant_chat_history enable row level security;

create index if not exists assistant_chat_history_user_created_idx
  on public.assistant_chat_history (user_id, created_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'assistant_chat_history'
      and policyname = 'Users can insert own assistant chat history'
  ) then
    create policy "Users can insert own assistant chat history"
      on public.assistant_chat_history
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'assistant_chat_history'
      and policyname = 'Users can read own assistant chat history'
  ) then
    create policy "Users can read own assistant chat history"
      on public.assistant_chat_history
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;
