-- Push tokens belong to the device, not the account. The client used to upsert
-- its token straight into push_tokens, but the update policy only lets a user
-- change rows they already own. So when someone signs in with a different
-- account on the same phone, the upsert is refused and the token stays with the
-- first account forever: targeted pushes (by email, Prime, pregnancy, "me")
-- never reach the account that is actually signed in.
--
-- register_push_token moves the token to whoever is signed in now. It only
-- ever writes auth.uid(), so a user can register a token for themselves but
-- never for anyone else. The table's own policies are unchanged.

create or replace function public.register_push_token(
  p_token text,
  p_platform text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- Expo tokens look like ExponentPushToken[...] (older ones ExpoPushToken[...]).
  if p_token is null
     or length(p_token) > 255
     or p_token !~ '^Expo(nent)?PushToken\[[^]]+\]$' then
    raise exception 'invalid push token' using errcode = '22023';
  end if;

  insert into public.push_tokens (user_id, expo_push_token, platform)
  values (v_user_id, p_token, p_platform)
  on conflict (expo_push_token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform;
end;
$$;

comment on function public.register_push_token(text, text) is
  'Registers this device''s Expo push token for the signed-in user, taking it over from any previous account.';

revoke all on function public.register_push_token(text, text) from public;
revoke all on function public.register_push_token(text, text) from anon;
grant execute on function public.register_push_token(text, text) to authenticated;
