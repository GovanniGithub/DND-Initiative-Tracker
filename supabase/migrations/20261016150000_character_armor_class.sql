alter table public.combat_lobby_characters
  add column if not exists armor_class integer not null default 10
    check (armor_class between 1 and 40);

create or replace function public.create_combat_lobby_with_reinforcements(
  p_campaign_id text,
  p_encounter_id text,
  p_encounter_name text,
  p_characters jsonb,
  p_enemy_data jsonb,
  p_allies jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_lobby jsonb;
  character_row jsonb;
  schedules jsonb;
begin
  if jsonb_typeof(p_characters) is distinct from 'array' then
    raise exception 'Lobby roster has an invalid format.';
  end if;
  for character_row in select value from jsonb_array_elements(p_characters)
  loop
    if coalesce(character_row ->> 'armorClass', '10') !~ '^[0-9]+$' then
      raise exception 'Character AC must be a whole number from 1 through 40.';
    end if;
    if (character_row ->> 'armorClass')::integer not between 1 and 40 then
      raise exception 'Character AC must be a whole number from 1 through 40.';
    end if;
  end loop;

  created_lobby := public.create_combat_lobby_with_initiative(
    p_campaign_id,
    p_encounter_id,
    p_encounter_name,
    p_characters,
    p_enemy_data,
    p_allies
  );

  update public.combat_lobby_characters c
  set armor_class = coalesce((character_row.value ->> 'armorClass')::integer, 10)
  from jsonb_array_elements(p_characters) as character_row(value)
  where c.lobby_id = (created_lobby ->> 'lobby_id')::uuid
    and c.character_id = character_row.value ->> 'id';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', enemy.value ->> 'id',
    'arrivalMode', coalesce(enemy.value ->> 'arrivalMode', 'round'),
    'arrivalRound', coalesce(nullif(enemy.value ->> 'arrivalRound', '')::integer, 1),
    'arrivalNote', enemy.value ->> 'arrivalNote'
  )), '[]'::jsonb)
  into schedules
  from jsonb_array_elements(p_enemy_data) as enemy(value);

  perform public.configure_combat_lobby_reinforcements(
    (created_lobby ->> 'lobby_id')::uuid,
    schedules
  );
  return created_lobby;
end;
$$;

create or replace function public.get_combat_lobby_snapshot(p_lobby_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  lobby_row public.combat_lobbies%rowtype;
  lobby_member_role text;
  lobby_members jsonb;
  lobby_characters jsonb;
  private_row public.combat_lobby_private%rowtype;
  initiative_results jsonb;
  dm_participants jsonb := '[]'::jsonb;
begin
  if current_user_id is null or not public.is_combat_lobby_member(p_lobby_id) then
    raise exception 'You are not a member of this lobby.';
  end if;

  select * into lobby_row
  from public.combat_lobbies
  where id = p_lobby_id;
  select role into lobby_member_role
  from public.combat_lobby_members
  where lobby_id = p_lobby_id and user_id = current_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', m.user_id,
    'display_name', m.display_name,
    'role', m.role,
    'claimed_character_id', m.claimed_character_id
  ) order by m.joined_at), '[]'::jsonb)
  into lobby_members
  from public.combat_lobby_members m
  where m.lobby_id = p_lobby_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'character_id', c.character_id,
    'name', c.name,
    'class_name', c.class_name,
    'race', c.race,
    'portrait_preset_id', c.portrait_preset_id,
    'initiative_bonus', c.initiative_bonus,
    'armor_class', c.armor_class
  ) order by c.name, c.character_id), '[]'::jsonb)
  into lobby_characters
  from public.combat_lobby_characters c
  where c.lobby_id = p_lobby_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'initiative_key', r.initiative_key,
    'participant_type', r.participant_type,
    'participant_id', r.participant_id,
    'name', r.display_name,
    'raw_roll', r.raw_roll,
    'bonus', r.initiative_bonus,
    'total', r.total,
    'portrait_preset_id', r.portrait_preset_id,
    'image_id', r.image_id,
    'sort_order', r.sort_order
  ) order by r.total desc, r.sort_order, r.initiative_key), '[]'::jsonb)
  into initiative_results
  from public.combat_lobby_initiative_results r
  where r.lobby_id = p_lobby_id
    and (lobby_member_role = 'dm' or r.participant_type = 'character');

  if lobby_member_role = 'dm' then
    select * into private_row
    from public.combat_lobby_private
    where lobby_id = p_lobby_id and owner_id = current_user_id;

    select coalesce(jsonb_agg(jsonb_build_object(
      'initiative_key', grouped.initiative_key,
      'participant_type', grouped.participant_type,
      'name', case
        when grouped.initiative_mode = 'horde' and grouped.member_count > 1
          then grouped.group_name || ' Horde'
        else grouped.name
      end,
      'initiative_bonus', grouped.initiative_bonus,
      'initiative_mode', grouped.initiative_mode,
      'member_count', grouped.member_count,
      'active_count', grouped.active_count,
      'waiting_count', grouped.waiting_count,
      'scheduled_count', grouped.scheduled_count,
      'hidden_count', grouped.hidden_count,
      'defeated_count', grouped.defeated_count,
      'inactive_count', grouped.inactive_count,
      'arrival_round', grouped.earliest_arrival_round,
      'image_id', grouped.image_id,
      'sort_order', grouped.sort_order,
      'members', grouped.members
    ) order by grouped.sort_order, grouped.initiative_key), '[]'::jsonb)
    into dm_participants
    from (
      select
        p.initiative_key,
        p.participant_type,
        min(p.name) as name,
        min(p.group_name) as group_name,
        min(p.initiative_bonus) as initiative_bonus,
        min(p.initiative_mode) as initiative_mode,
        count(*)::integer as member_count,
        count(*) filter (where p.status = 'active' and p.is_active)::integer as active_count,
        count(*) filter (where p.status = 'waiting')::integer as waiting_count,
        count(*) filter (where p.status = 'scheduled')::integer as scheduled_count,
        count(*) filter (where p.is_hidden)::integer as hidden_count,
        count(*) filter (where p.status = 'defeated')::integer as defeated_count,
        count(*) filter (where p.status = 'inactive')::integer as inactive_count,
        min(p.arrival_round)::integer as earliest_arrival_round,
        min(p.image_id) as image_id,
        min(p.sort_order) as sort_order,
        jsonb_agg(jsonb_build_object(
          'participant_id', p.participant_id,
          'name', p.name,
          'status', p.status,
          'is_hidden', p.is_hidden,
          'is_active', p.is_active,
          'arrival_round', p.arrival_round,
          'max_hp', p.max_hp,
          'current_hp', p.current_hp,
          'conditions', p.conditions
        ) order by p.member_index) as members
      from public.combat_lobby_private_participants p
      where p.lobby_id = p_lobby_id
      group by p.initiative_key, p.participant_type
    ) grouped;
  end if;

  return jsonb_build_object(
    'lobby_id', lobby_row.id,
    'owner_id', lobby_row.owner_id,
    'encounter_id', lobby_row.encounter_id,
    'encounter_name', lobby_row.encounter_name,
    'status', lobby_row.status,
    'combat_started', lobby_row.combat_started_at is not null,
    'current_round', lobby_row.current_round,
    'visibility_revision', lobby_row.visibility_revision,
    'initiative_schema_version', lobby_row.initiative_schema_version,
    'background_id', lobby_row.combat_background_id,
    'role', lobby_member_role,
    'members', lobby_members,
    'characters', lobby_characters,
    'initiative_results', initiative_results
  ) || case
    when lobby_member_role = 'dm' then jsonb_build_object(
      'join_code', private_row.join_code,
      'enemy_data', private_row.enemy_data,
      'dm_participants', dm_participants
    )
    else '{}'::jsonb
  end;
end;
$$;

revoke all on function public.create_combat_lobby_with_reinforcements(
  text, text, text, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function public.create_combat_lobby_with_reinforcements(
  text, text, text, jsonb, jsonb, jsonb
) to authenticated;
revoke all on function public.get_combat_lobby_snapshot(uuid) from public, anon;
grant execute on function public.get_combat_lobby_snapshot(uuid) to authenticated;
