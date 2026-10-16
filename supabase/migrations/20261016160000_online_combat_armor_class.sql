alter table public.combat_lobby_private_participants
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
  enemy_row jsonb;
  ally_row jsonb;
  schedules jsonb;
begin
  if jsonb_typeof(p_characters) is distinct from 'array' then
    raise exception 'Lobby roster has an invalid format.';
  end if;
  if jsonb_typeof(p_enemy_data) is distinct from 'array'
     or jsonb_typeof(p_allies) is distinct from 'array' then
    raise exception 'Lobby participant data has an invalid format.';
  end if;
  for character_row in select value from jsonb_array_elements(p_characters)
  loop
    if coalesce(character_row ->> 'armorClass', '10') !~ '^[0-9]+$' then
      raise exception 'Character AC must be a whole number from 1 through 40.';
    end if;
    if coalesce((character_row ->> 'armorClass')::integer, 10) not between 1 and 40 then
      raise exception 'Character AC must be a whole number from 1 through 40.';
    end if;
  end loop;
  for enemy_row in select value from jsonb_array_elements(p_enemy_data)
  loop
    if coalesce(enemy_row ->> 'armorClass', '10') !~ '^[0-9]+$' then
      raise exception 'Enemy AC must be a whole number from 1 through 40.';
    end if;
    if coalesce((enemy_row ->> 'armorClass')::integer, 10) not between 1 and 40 then
      raise exception 'Enemy AC must be a whole number from 1 through 40.';
    end if;
  end loop;
  for ally_row in select value from jsonb_array_elements(p_allies)
  loop
    if coalesce(ally_row ->> 'armorClass', '10') !~ '^[0-9]+$' then
      raise exception 'Ally AC must be a whole number from 1 through 40.';
    end if;
    if coalesce((ally_row ->> 'armorClass')::integer, 10) not between 1 and 40 then
      raise exception 'Ally AC must be a whole number from 1 through 40.';
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

  update public.combat_lobby_private_participants p
  set armor_class = coalesce((enemy.value ->> 'armorClass')::integer, 10)
  from jsonb_array_elements(p_enemy_data) as enemy(value)
  where p.lobby_id = (created_lobby ->> 'lobby_id')::uuid
    and p.participant_type = 'enemy'
    and split_part(p.initiative_key, ':', 2) = (enemy.value ->> 'id');

  update public.combat_lobby_private_participants p
  set armor_class = coalesce((ally.value ->> 'armorClass')::integer, 10)
  from jsonb_array_elements(p_allies) as ally(value)
  where p.lobby_id = (created_lobby ->> 'lobby_id')::uuid
    and p.participant_type = 'ally'
    and p.participant_id = 'ally:' || (ally.value ->> 'id');

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

revoke all on function public.create_combat_lobby_with_reinforcements(
  text, text, text, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function public.create_combat_lobby_with_reinforcements(
  text, text, text, jsonb, jsonb, jsonb
) to authenticated;

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
      sum(p.current_hp)::integer as current_hp,
      sum(p.max_hp)::integer as max_hp,
      min(p.image_id) as image_id,
      min(case when p.participant_type = 'ally' then p.image_id end)
        as portrait_preset_id,
      min(p.sort_order) as sort_order,
      count(*)::integer as visible_member_count
    from public.combat_lobby_private_participants p
    left join public.combat_lobby_initiative_results r
      on r.lobby_id = p.lobby_id and r.initiative_key = p.initiative_key
    where p.lobby_id = p_lobby_id
      and p.is_active
      and not p.is_hidden
      and p.status = 'active'
      and p.arrival_round <= lobby_row.current_round
    group by p.initiative_key, p.participant_type, p.initiative_mode
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'initiative_key', grouped.initiative_key,
    'participant_type', grouped.participant_type,
    'name', case
      when grouped.initiative_mode = 'horde' and grouped.visible_member_count > 1
        then grouped.group_name || ' Horde'
      else grouped.name
    end,
    'total', grouped.total,
    'armor_class', grouped.armor_class,
    'current_hp', grouped.current_hp,
    'max_hp', grouped.max_hp,
    'image_id', grouped.image_id,
    'portrait_preset_id', grouped.portrait_preset_id,
    'sort_order', grouped.sort_order,
    'visible_member_count', grouped.visible_member_count
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
