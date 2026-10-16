create or replace function public.set_combat_participant_hp(
  p_lobby_id uuid,
  p_participant_id text,
  p_current_hp integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  lobby_row public.combat_lobbies%rowtype;
  participant_row public.combat_lobby_private_participants%rowtype;
  new_hp integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in before changing hit points.';
  end if;

  select * into lobby_row
  from public.combat_lobbies
  where id = p_lobby_id;
  if not found or lobby_row.owner_id <> auth.uid() then
    raise exception 'Only the DM who created this lobby can change hit points.';
  end if;
  if lobby_row.combat_started_at is null then
    raise exception 'Start combat before changing hit points.';
  end if;

  select * into participant_row
  from public.combat_lobby_private_participants
  where lobby_id = p_lobby_id
    and participant_id = p_participant_id
  for update;
  if not found then
    raise exception 'That enemy or NPC is not in this lobby.';
  end if;
  if participant_row.status not in ('active', 'defeated') then
    raise exception 'Only enemies and NPCs in combat can take damage.';
  end if;

  new_hp := greatest(0, least(coalesce(p_current_hp, 0), participant_row.max_hp));

  update public.combat_lobby_private_participants
  set current_hp = new_hp,
      status = case when new_hp = 0 then 'defeated' else 'active' end,
      is_active = new_hp > 0
  where lobby_id = p_lobby_id
    and participant_id = p_participant_id;

  return jsonb_build_object(
    'participant_id', p_participant_id,
    'current_hp', new_hp,
    'status', case when new_hp = 0 then 'defeated' else 'active' end
  );
end;
$$;

revoke all on function public.set_combat_participant_hp(uuid, text, integer)
  from public, anon;
grant execute on function public.set_combat_participant_hp(uuid, text, integer)
  to authenticated;

-- Same ordering as combat_lobby_turn_order, but a defeated combatant that still
-- holds the current turn stays in the list so the next turn follows it.
create or replace function public.combat_lobby_turn_order_including(
  p_lobby_id uuid,
  p_round integer,
  p_include_key text
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
  dm_participants as (
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
      and (
        (p.status = 'active' and p.is_active and p.arrival_round <= p_round)
        or (p.initiative_key = p_include_key and p.status = 'defeated')
      )
    group by p.initiative_key, p.participant_type, p.initiative_mode
  )
  select * from party_members
  union all
  select * from dm_participants;
$$;

revoke all on function public.combat_lobby_turn_order_including(uuid, integer, text)
  from public, anon, authenticated;

create or replace function public.advance_combat_lobby_turn(p_lobby_id uuid)
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
  from public.combat_lobby_turn_order_including(
    p_lobby_id,
    lobby_row.current_round,
    lobby_row.current_turn_key
  ) combatant;

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
