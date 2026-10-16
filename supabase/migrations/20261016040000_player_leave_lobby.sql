create or replace function public.leave_combat_lobby(p_lobby_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  member_role text;
  lobby_owner_id uuid;
begin
  if current_user_id is null then
    raise exception 'Sign in before leaving a lobby.';
  end if;

  select l.owner_id, m.role
  into lobby_owner_id, member_role
  from public.combat_lobbies l
  join public.combat_lobby_members m
    on m.lobby_id = l.id
  where l.id = p_lobby_id
    and m.user_id = current_user_id
  for update of m;

  if not found then
    raise exception 'You are not a member of this lobby.';
  end if;
  if lobby_owner_id = current_user_id or member_role <> 'player' then
    raise exception 'Only a player can leave a lobby. The DM cannot leave their own lobby.';
  end if;

  delete from public.combat_lobby_members
  where lobby_id = p_lobby_id
    and user_id = current_user_id
    and role = 'player';
end;
$$;

revoke all on function public.leave_combat_lobby(uuid) from public, anon;
grant execute on function public.leave_combat_lobby(uuid) to authenticated;
