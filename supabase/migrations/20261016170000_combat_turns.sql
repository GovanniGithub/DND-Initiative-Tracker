alter table public.combat_lobbies
  add column if not exists current_turn_key text;

create or replace function public.combat_lobby_turn_order(
  p_lobby_id uuid,
  p_round integer
)
returns table (
  initiative_key text,
  name text,
  total integer,
  is_party_member boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with party_members as (
    select
      'character:' || c.character_id as initiative_key,
      c.name,
      r.total,
      true as is_party_member
    from public.combat_lobby_characters c
    left join public.combat_lobby_initiative_results r
      on r.lobby_id = c.lobby_id
      and r.initiative_key = 'character:' || c.character_id
    where c.lobby_id = p_lobby_id
  ),
  active_dm_participants as (
    select
      p.initiative_key,
      case
        when min(p.initiative_mode) = 'horde' and count(*) > 1
          then min(p.group_name) || ' Horde'
        else min(p.name)
      end as name,
      max(r.total) as total,
      false as is_party_member
    from public.combat_lobby_private_participants p
    left join public.combat_lobby_initiative_results r
      on r.lobby_id = p.lobby_id and r.initiative_key = p.initiative_key
    where p.lobby_id = p_lobby_id
      and p.status = 'active'
      and p.is_active
      and p.arrival_round <= p_round
    group by p.initiative_key, p.participant_type, p.initiative_mode
  )
  select * from party_members
  union all
  select * from active_dm_participants;
$$;

revoke all on function public.combat_lobby_turn_order(uuid, integer)
  from public, anon, authenticated;

update public.combat_lobbies l
set current_turn_key = (
  select turn_order.initiative_key
  from public.combat_lobby_turn_order(l.id, l.current_round) turn_order
  order by
    turn_order.total desc nulls last,
    turn_order.is_party_member desc,
    lower(turn_order.name),
    turn_order.initiative_key
  limit 1
)
where l.combat_started_at is not null
  and l.current_turn_key is null;

alter function public.start_combat_lobby(uuid)
  rename to start_combat_lobby_without_turn;

revoke all on function public.start_combat_lobby_without_turn(uuid)
  from public, anon, authenticated;

create function public.start_combat_lobby(p_lobby_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  lobby_row public.combat_lobbies%rowtype;
  first_turn_key text;
begin
  result := public.start_combat_lobby_without_turn(p_lobby_id);

  select * into lobby_row
  from public.combat_lobbies
  where id = p_lobby_id;

  if lobby_row.current_turn_key is null then
    select turn_order.initiative_key into first_turn_key
    from public.combat_lobby_turn_order(p_lobby_id, lobby_row.current_round) turn_order
    order by
      turn_order.total desc nulls last,
      turn_order.is_party_member desc,
      lower(turn_order.name),
      turn_order.initiative_key
    limit 1;

    update public.combat_lobbies
    set current_turn_key = first_turn_key
    where id = p_lobby_id;
  else
    first_turn_key := lobby_row.current_turn_key;
  end if;

  return result || jsonb_build_object('current_turn_key', first_turn_key);
end;
$$;

revoke all on function public.start_combat_lobby(uuid) from public, anon;
grant execute on function public.start_combat_lobby(uuid) to authenticated;

alter function public.get_combat_lobby_snapshot(uuid)
  rename to get_combat_lobby_snapshot_without_turn;

revoke all on function public.get_combat_lobby_snapshot_without_turn(uuid)
  from public, anon, authenticated;

create function public.get_combat_lobby_snapshot(p_lobby_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
  current_turn_key_value text;
begin
  snapshot := public.get_combat_lobby_snapshot_without_turn(p_lobby_id);

  select current_turn_key into current_turn_key_value
  from public.combat_lobbies
  where id = p_lobby_id;

  if snapshot ->> 'role' = 'player'
    and current_turn_key_value is not null
    and current_turn_key_value not like 'character:%'
    and not exists (
      select 1
      from public.combat_lobby_private_participants p
      where p.lobby_id = p_lobby_id
        and p.initiative_key = current_turn_key_value
        and p.status = 'active'
        and p.is_active
        and not p.is_hidden
        and p.arrival_round <= (snapshot ->> 'current_round')::integer
    )
  then
    current_turn_key_value := null;
  end if;

  return snapshot || jsonb_build_object(
    'current_turn_key',
    current_turn_key_value
  );
end;
$$;

revoke all on function public.get_combat_lobby_snapshot(uuid) from public, anon;
grant execute on function public.get_combat_lobby_snapshot(uuid) to authenticated;

create function public.advance_combat_lobby_turn(p_lobby_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  lobby_row public.combat_lobbies%rowtype;
  turn_order text[];
  current_turn_index integer;
  next_turn_key text;
  next_round integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in before advancing combat.';
  end if;

  select * into lobby_row
  from public.combat_lobbies
  where id = p_lobby_id
  for update;
  if not found or lobby_row.owner_id <> auth.uid() then
    raise exception 'Only the DM who created this lobby can advance combat.';
  end if;
  if lobby_row.combat_started_at is null then
    raise exception 'Start combat before advancing a turn.';
  end if;

  select coalesce(
    array_agg(
      combatant.initiative_key
      order by
        combatant.total desc nulls last,
        combatant.is_party_member desc,
        lower(combatant.name),
        combatant.initiative_key
    ),
    array[]::text[]
  )
  into turn_order
  from public.combat_lobby_turn_order(p_lobby_id, lobby_row.current_round) combatant;

  if cardinality(turn_order) = 0 then
    raise exception 'There are no combatants available to take a turn.';
  end if;

  next_round := lobby_row.current_round;
  current_turn_index := array_position(turn_order, lobby_row.current_turn_key);

  if current_turn_index is null then
    next_turn_key := turn_order[1];
  elsif current_turn_index = cardinality(turn_order) then
    if lobby_row.current_round >= 999 then
      raise exception 'Combat cannot advance beyond round 999.';
    end if;

    next_round := lobby_row.current_round + 1;

    update public.combat_lobby_private_participants
    set status = 'active',
        is_active = true
    where lobby_id = p_lobby_id
      and participant_type = 'enemy'
      and arrival_mode = 'round'
      and status = 'scheduled'
      and arrival_round <= next_round;

    select coalesce(
      array_agg(
        combatant.initiative_key
        order by
          combatant.total desc nulls last,
          combatant.is_party_member desc,
          lower(combatant.name),
          combatant.initiative_key
      ),
      array[]::text[]
    )
    into turn_order
    from public.combat_lobby_turn_order(p_lobby_id, next_round) combatant;

    if cardinality(turn_order) = 0 then
      raise exception 'There are no combatants available to take a turn.';
    end if;
    next_turn_key := turn_order[1];
  else
    next_turn_key := turn_order[current_turn_index + 1];
  end if;

  update public.combat_lobbies
  set current_round = next_round,
      current_turn_key = next_turn_key
  where id = p_lobby_id;

  return jsonb_build_object(
    'current_round', next_round,
    'current_turn_key', next_turn_key
  );
end;
$$;

revoke all on function public.advance_combat_lobby_turn(uuid)
  from public, anon;
grant execute on function public.advance_combat_lobby_turn(uuid)
  to authenticated;
