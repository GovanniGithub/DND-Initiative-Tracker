-- Defeated creatures stay in the visible initiative list (flagged), and
-- reviving keeps the original initiative and restores a chosen amount of HP.

drop function if exists public.revive_combat_participant(uuid, text);

create or replace function public.revive_combat_participant(
  p_lobby_id uuid,
  p_participant_id text,
  p_hp integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  lobby_row public.combat_lobbies%rowtype;
  participant_row public.combat_lobby_private_participants%rowtype;
  revived_hp integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in before reviving a combatant.';
  end if;

  select * into lobby_row
  from public.combat_lobbies
  where id = p_lobby_id
  for update;
  if not found or lobby_row.owner_id <> auth.uid() then
    raise exception 'Only the DM who created this lobby can revive a combatant.';
  end if;
  if lobby_row.combat_started_at is null then
    raise exception 'Combat has not started.';
  end if;

  select * into participant_row
  from public.combat_lobby_private_participants
  where lobby_id = p_lobby_id
    and participant_id = p_participant_id
  for update;
  if not found or participant_row.status <> 'defeated' then
    raise exception 'That enemy or NPC is not defeated.';
  end if;

  revived_hp := least(participant_row.max_hp, greatest(1, coalesce(p_hp, participant_row.max_hp)));

  update public.combat_lobby_private_participants
  set current_hp = revived_hp,
      status = 'active',
      is_active = true
  where lobby_id = p_lobby_id
    and participant_id = p_participant_id;

  return jsonb_build_object('participant_id', p_participant_id, 'current_hp', revived_hp);
end;
$$;

revoke all on function public.revive_combat_participant(uuid, text, integer)
  from public, anon;
grant execute on function public.revive_combat_participant(uuid, text, integer)
  to authenticated;

create or replace function public.get_visible_combat_lobby_participants(
  p_lobby_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  lobby_row public.combat_lobbies%rowtype;
  participant_role text;
  visible_participants jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in before viewing combat participants.';
  end if;

  select * into lobby_row
  from public.combat_lobbies
  where id = p_lobby_id;
  if not found then
    raise exception 'This lobby does not exist.';
  end if;

  select m.role into participant_role
  from public.combat_lobby_members m
  where m.lobby_id = p_lobby_id and m.user_id = auth.uid();
  if participant_role is null then
    raise exception 'Join this lobby before viewing combat participants.';
  end if;
  if lobby_row.combat_started_at is null then
    return '[]'::jsonb;
  end if;

  with grouped_participants as (
    select
      p.initiative_key,
      p.participant_type,
      p.initiative_mode,
      min(p.group_name) as group_name,
      min(p.name) as name,
      max(r.total) as total,
      min(p.armor_class) as armor_class,
      (sum(p.current_hp) filter (where p.status = 'active'))::integer as current_hp,
      (sum(p.max_hp) filter (where p.status = 'active'))::integer as max_hp,
      min(p.image_id) as image_id,
      min(case when p.participant_type = 'ally' then p.image_id end)
        as portrait_preset_id,
      min(p.sort_order) as sort_order,
      count(*)::integer as member_total,
      (count(*) filter (where p.status = 'active'))::integer as visible_member_count
    from public.combat_lobby_private_participants p
    left join public.combat_lobby_initiative_results r
      on r.lobby_id = p.lobby_id and r.initiative_key = p.initiative_key
    where p.lobby_id = p_lobby_id
      and not p.is_hidden
      and (
        (p.status = 'active' and p.is_active)
        or p.status = 'defeated'
      )
      and p.arrival_round <= lobby_row.current_round
    group by p.initiative_key, p.participant_type, p.initiative_mode
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'initiative_key', grouped.initiative_key,
    'participant_type', grouped.participant_type,
    'name', case
      when grouped.initiative_mode = 'horde' and grouped.member_total > 1
        then grouped.group_name || ' Horde'
      else grouped.name
    end,
    'total', grouped.total,
    'armor_class', grouped.armor_class,
    'current_hp', coalesce(grouped.current_hp, 0),
    'max_hp', coalesce(grouped.max_hp, 0),
    'image_id', grouped.image_id,
    'portrait_preset_id', grouped.portrait_preset_id,
    'sort_order', grouped.sort_order,
    'visible_member_count', grouped.visible_member_count,
    'is_defeated', grouped.visible_member_count = 0
  ) order by grouped.total desc nulls last, grouped.sort_order, grouped.initiative_key), '[]'::jsonb)
  into visible_participants
  from grouped_participants grouped;

  return visible_participants;
end;
$$;

revoke all on function public.get_visible_combat_lobby_participants(uuid)
  from public, anon;
grant execute on function public.get_visible_combat_lobby_participants(uuid)
  to authenticated;
