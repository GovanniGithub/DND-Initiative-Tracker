alter table public.combat_lobbies
  add column if not exists combat_started_at timestamptz,
  add column if not exists current_round integer not null default 1
    check (current_round >= 1);

alter table public.combat_lobby_characters
  add column if not exists initiative_bonus integer not null default 0
    check (initiative_bonus between -100 and 100);

create table if not exists public.combat_lobby_private_participants (
  lobby_id uuid not null references public.combat_lobbies(id) on delete cascade,
  participant_id text not null,
  initiative_key text not null,
  participant_type text not null check (participant_type in ('enemy', 'ally')),
  name text not null check (char_length(name) between 1 and 80),
  group_name text not null check (char_length(group_name) between 1 and 80),
  initiative_bonus integer not null check (initiative_bonus between -100 and 100),
  initiative_mode text not null check (initiative_mode in ('individual', 'horde')),
  member_index integer not null default 0 check (member_index >= 0),
  image_id text,
  status text not null default 'waiting'
    check (status in ('waiting', 'active', 'scheduled', 'defeated', 'inactive')),
  is_hidden boolean not null default false,
  is_active boolean not null default false,
  arrival_round integer not null default 1 check (arrival_round >= 1),
  max_hp integer not null default 10 check (max_hp between 1 and 9999),
  current_hp integer not null default 10 check (current_hp between 0 and 9999),
  conditions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(conditions) = 'array'),
  sort_order integer not null,
  primary key (lobby_id, participant_id),
  check (current_hp <= max_hp)
);

create index if not exists combat_lobby_private_participants_initiative
  on public.combat_lobby_private_participants (lobby_id, initiative_key);

create table if not exists public.combat_lobby_initiative_results (
  lobby_id uuid not null references public.combat_lobbies(id) on delete cascade,
  initiative_key text not null,
  participant_type text not null check (participant_type in ('character', 'enemy', 'ally')),
  participant_id text not null,
  display_name text not null check (char_length(display_name) between 1 and 80),
  initiative_bonus integer not null check (initiative_bonus between -100 and 100),
  raw_roll integer not null check (raw_roll between 1 and 20),
  total integer not null,
  portrait_preset_id text,
  image_id text,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  primary key (lobby_id, initiative_key),
  check (total = raw_roll + initiative_bonus)
);

create index if not exists combat_lobby_initiative_order
  on public.combat_lobby_initiative_results (lobby_id, total desc, sort_order);

create or replace function public.can_read_combat_lobby_initiative(
  target_lobby_id uuid,
  target_participant_type text,
  target_initiative_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.combat_lobbies l
    where l.id = target_lobby_id
      and (
        l.owner_id = (select auth.uid())
        or exists (
          select 1 from public.combat_lobby_members m
          where m.lobby_id = l.id and m.user_id = (select auth.uid())
        )
      )
      and (
        l.owner_id = (select auth.uid())
        or target_participant_type = 'character'
        or (
          target_participant_type = 'enemy'
          and l.combat_started_at is not null
          and exists (
            select 1
            from public.combat_lobby_private_participants p
            where p.lobby_id = target_lobby_id
              and p.initiative_key = target_initiative_key
              and p.participant_type = 'enemy'
              and p.is_active
              and not p.is_hidden
              and p.status = 'active'
              and p.arrival_round <= l.current_round
          )
        )
      )
  );
$$;

create or replace function public.create_combat_lobby_with_initiative(
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
  current_user_id uuid := auth.uid();
  new_lobby_id uuid;
  new_join_code text;
  character_row jsonb;
  enemy_row jsonb;
  ally_row jsonb;
  quantity integer;
  enemy_id text;
  enemy_name text;
  enemy_bonus integer;
  enemy_mode text;
  enemy_max_hp integer;
  enemy_image_id text;
  member_index integer;
  participant_sort_order integer := 0;
  initiative_key text;
  participant_id text;
  arrival_round integer;
  participant_status text;
  participant_hidden boolean;
  participant_active boolean;
  ally_id text;
  ally_name text;
  ally_bonus integer;
  ally_max_hp integer;
begin
  if current_user_id is null then
    raise exception 'Sign in before creating an online lobby.';
  end if;
  if coalesce(char_length(trim(p_campaign_id)), 0) = 0
     or coalesce(char_length(trim(p_encounter_id)), 0) = 0 then
    raise exception 'Campaign and encounter identifiers are required.';
  end if;
  if coalesce(char_length(trim(p_encounter_name)), 0) not between 1 and 100 then
    raise exception 'Encounter name must be between 1 and 100 characters.';
  end if;
  if jsonb_typeof(p_characters) is distinct from 'array'
     or jsonb_typeof(p_enemy_data) is distinct from 'array'
     or jsonb_typeof(p_allies) is distinct from 'array' then
    raise exception 'Lobby roster or participant data has an invalid format.';
  end if;
  if jsonb_array_length(p_characters) > 50
     or jsonb_array_length(p_enemy_data) > 100
     or jsonb_array_length(p_allies) > 50 then
    raise exception 'Lobby roster or participant data exceeds the supported size.';
  end if;

  insert into public.combat_lobbies (
    owner_id, campaign_id, encounter_id, encounter_name
  ) values (
    current_user_id, trim(p_campaign_id), trim(p_encounter_id), trim(p_encounter_name)
  ) returning id into new_lobby_id;

  loop
    new_join_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    begin
      insert into public.combat_lobby_private (lobby_id, owner_id, join_code, enemy_data)
      values (new_lobby_id, current_user_id, new_join_code, p_enemy_data);
      exit;
    exception when unique_violation then
      if exists (
        select 1 from public.combat_lobby_private where join_code = new_join_code
      ) then
        continue;
      end if;
      raise;
    end;
  end loop;

  for character_row in select value from jsonb_array_elements(p_characters)
  loop
    if coalesce(char_length(trim(character_row ->> 'id')), 0) = 0
       or coalesce(char_length(trim(character_row ->> 'name')), 0) not between 1 and 80
       or coalesce(char_length(trim(character_row ->> 'className')), 0) not between 1 and 80
       or coalesce(character_row ->> 'initiativeBonus', '0') !~ '^-?[0-9]+$'
       or coalesce((character_row ->> 'initiativeBonus')::integer, 0) not between -100 and 100 then
      raise exception 'Every roster character must have a valid id, name, class, and initiative bonus.';
    end if;
    participant_sort_order := participant_sort_order + 1;
    insert into public.combat_lobby_characters (
      lobby_id, character_id, name, class_name, race, portrait_preset_id, initiative_bonus
    ) values (
      new_lobby_id,
      trim(character_row ->> 'id'),
      trim(character_row ->> 'name'),
      trim(character_row ->> 'className'),
      nullif(trim(character_row ->> 'race'), ''),
      nullif(trim(character_row ->> 'portraitPresetId'), ''),
      coalesce((character_row ->> 'initiativeBonus')::integer, 0)
    );
  end loop;

  for ally_row in select value from jsonb_array_elements(p_allies)
  loop
    ally_id := trim(ally_row ->> 'id');
    ally_name := trim(ally_row ->> 'name');
    if coalesce(char_length(ally_id), 0) = 0
       or coalesce(char_length(ally_name), 0) not between 1 and 80
       or coalesce(ally_row ->> 'initiative', '') !~ '^-?[0-9]+$' then
      raise exception 'Every NPC must have a valid id, name, and initiative bonus.';
    end if;
    ally_bonus := (ally_row ->> 'initiative')::integer;
    if ally_bonus not between -100 and 100 then
      raise exception 'NPC initiative bonuses must be between -100 and 100.';
    end if;
    ally_max_hp := coalesce(nullif(ally_row ->> 'maxHp', '')::integer, 10);
    participant_sort_order := participant_sort_order + 1;
    insert into public.combat_lobby_private_participants (
      lobby_id, participant_id, initiative_key, participant_type, name, group_name,
      initiative_bonus, initiative_mode, image_id, max_hp, current_hp, sort_order
    ) values (
      new_lobby_id, 'ally:' || ally_id, 'ally:' || ally_id, 'ally', ally_name, ally_name,
      ally_bonus, 'individual', nullif(ally_row ->> 'portraitPresetId', ''),
      ally_max_hp, ally_max_hp, participant_sort_order
    );
  end loop;

  for enemy_row in select value from jsonb_array_elements(p_enemy_data)
  loop
    enemy_id := trim(enemy_row ->> 'id');
    enemy_name := trim(enemy_row ->> 'name');
    if coalesce(char_length(enemy_id), 0) = 0
       or coalesce(char_length(enemy_name), 0) not between 1 and 80
       or coalesce(enemy_row ->> 'initiative', '') !~ '^-?[0-9]+$' then
      raise exception 'Every enemy must have a valid id, name, and initiative bonus.';
    end if;
    enemy_bonus := (enemy_row ->> 'initiative')::integer;
    if enemy_bonus not between -100 and 100 then
      raise exception 'Enemy initiative bonuses must be between -100 and 100.';
    end if;
    quantity := coalesce(nullif(enemy_row ->> 'quantity', '')::integer, 1);
    if quantity not between 1 and 99 then
      raise exception 'Enemy quantity must be between 1 and 99.';
    end if;
    enemy_mode := coalesce(nullif(enemy_row ->> 'initiativeMode', ''), 'individual');
    if enemy_mode not in ('individual', 'horde') then
      raise exception 'Enemy initiative mode must be individual or horde.';
    end if;
    enemy_max_hp := coalesce(nullif(enemy_row ->> 'maxHp', '')::integer, 10);
    if enemy_max_hp not between 1 and 9999 then
      raise exception 'Enemy maximum HP must be between 1 and 9999.';
    end if;
    arrival_round := coalesce(nullif(enemy_row ->> 'arrivalRound', '')::integer, 1);
    if arrival_round < 1 then
      raise exception 'Enemy arrival round must be at least 1.';
    end if;
    participant_status := coalesce(nullif(enemy_row ->> 'status', ''), 'waiting');
    if participant_status not in ('waiting', 'active', 'scheduled', 'defeated', 'inactive') then
      raise exception 'Enemy status is invalid.';
    end if;
    participant_hidden := coalesce((enemy_row ->> 'isHidden')::boolean, false);
    participant_active := coalesce((enemy_row ->> 'isActive')::boolean, false);
    enemy_image_id := nullif(enemy_row ->> 'imageId', '');
    for member_index in 0..(quantity - 1)
    loop
      if enemy_mode = 'horde' and quantity > 1 then
        initiative_key := 'enemy:' || enemy_id || ':horde';
        participant_id := 'enemy:' || enemy_id || ':member:' || member_index::text;
      else
        initiative_key := 'enemy:' || enemy_id || ':' || member_index::text;
        participant_id := initiative_key;
      end if;
      participant_sort_order := participant_sort_order + 1;
      insert into public.combat_lobby_private_participants (
        lobby_id, participant_id, initiative_key, participant_type, name, group_name,
        initiative_bonus, initiative_mode, member_index, image_id, status, is_hidden,
        is_active, arrival_round, max_hp, current_hp, conditions, sort_order
      ) values (
        new_lobby_id,
        participant_id,
        initiative_key,
        'enemy',
        case when quantity > 1 then enemy_name || ' ' || (member_index + 1)::text else enemy_name end,
        enemy_name,
        enemy_bonus,
        enemy_mode,
        member_index,
        enemy_image_id,
        participant_status,
        participant_hidden,
        participant_active,
        arrival_round,
        enemy_max_hp,
        enemy_max_hp,
        '[]'::jsonb,
        participant_sort_order
      );
    end loop;
  end loop;

  insert into public.combat_lobby_members (lobby_id, user_id, display_name, role)
  values (new_lobby_id, current_user_id, 'Dungeon Master', 'dm');

  return jsonb_build_object('lobby_id', new_lobby_id, 'join_code', new_join_code);
end;
$$;

create or replace function public.submit_player_combat_initiative(
  p_lobby_id uuid,
  p_raw_roll integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  claimed_character text;
  character_row public.combat_lobby_characters%rowtype;
  lobby_row public.combat_lobbies%rowtype;
  result_raw_roll integer;
  result_total integer;
  result_key text;
begin
  if current_user_id is null then
    raise exception 'Sign in before submitting initiative.';
  end if;
  if p_raw_roll is not null and p_raw_roll not between 1 and 20 then
    raise exception 'A d20 result must be a whole number from 1 through 20.';
  end if;

  select * into lobby_row
  from public.combat_lobbies
  where id = p_lobby_id
  for update;
  if not found or lobby_row.status <> 'open' or lobby_row.combat_started_at is not null then
    raise exception 'Initiative submissions are closed for this lobby.';
  end if;

  select m.claimed_character_id into claimed_character
  from public.combat_lobby_members
  where lobby_id = p_lobby_id
    and user_id = current_user_id
    and role = 'player'
  for update;
  if claimed_character is null then
    raise exception 'Claim a character before submitting initiative.';
  end if;

  select * into character_row
  from public.combat_lobby_characters
  where lobby_id = p_lobby_id and character_id = claimed_character
  for update;
  if not found then
    raise exception 'Your claimed character is not in this lobby.';
  end if;

  result_key := 'character:' || character_row.character_id;
  result_raw_roll := coalesce(p_raw_roll, floor(random() * 20)::integer + 1);
  result_total := result_raw_roll + character_row.initiative_bonus;

  insert into public.combat_lobby_initiative_results (
    lobby_id, initiative_key, participant_type, participant_id, display_name,
    initiative_bonus, raw_roll, total, portrait_preset_id, sort_order
  ) values (
    p_lobby_id, result_key, 'character', character_row.character_id, character_row.name,
    character_row.initiative_bonus, result_raw_roll, result_total,
    character_row.portrait_preset_id,
    (select row_number from (
      select character_id, row_number() over (order by name, character_id) as row_number
      from public.combat_lobby_characters where lobby_id = p_lobby_id
    ) ordered_characters where character_id = character_row.character_id)
  );

  return jsonb_build_object(
    'initiative_key', result_key,
    'raw_roll', result_raw_roll,
    'bonus', character_row.initiative_bonus,
    'total', result_total
  );
exception
  when unique_violation then
    raise exception 'Your character is already ready. Only the DM can reset initiative.';
end;
$$;

create or replace function public.submit_dm_combat_initiative(
  p_lobby_id uuid,
  p_initiative_keys text[] default array[]::text[],
  p_raw_roll integer default null,
  p_roll_unrolled boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_keys text[];
  target_key text;
  target_row record;
  result_raw_roll integer;
  saved_results jsonb := '[]'::jsonb;
  is_owner boolean;
  lobby_status text;
begin
  if auth.uid() is null then
    raise exception 'Sign in before rolling initiative.';
  end if;
  select l.owner_id = auth.uid(), l.status
  into is_owner, lobby_status
  from public.combat_lobbies l
  where l.id = p_lobby_id
  for update;
  if not coalesce(is_owner, false) then
    raise exception 'Only the DM who created this lobby can roll enemy or NPC initiative.';
  end if;
  if lobby_status <> 'open' then
    raise exception 'The lobby is closed.';
  end if;
  if p_raw_roll is not null and p_raw_roll not between 1 and 20 then
    raise exception 'A d20 result must be a whole number from 1 through 20.';
  end if;

  if p_roll_unrolled then
    if p_raw_roll is not null then
      raise exception 'Roll Unrolled uses backend-generated d20 results.';
    end if;
    select coalesce(array_agg(keys.initiative_key order by keys.sort_order, keys.initiative_key), array[]::text[])
    into requested_keys
    from (
      select p.initiative_key, min(p.sort_order) as sort_order
      from public.combat_lobby_private_participants p
      where p.lobby_id = p_lobby_id
      group by p.initiative_key
    ) keys
    where not exists (
      select 1 from public.combat_lobby_initiative_results r
      where r.lobby_id = p_lobby_id and r.initiative_key = keys.initiative_key
    );
  else
    select coalesce(array_agg(distinct requested.key), array[]::text[])
    into requested_keys
    from unnest(coalesce(p_initiative_keys, array[]::text[])) requested(key);
  end if;

  if cardinality(requested_keys) = 0 then
    return saved_results;
  end if;
  if p_raw_roll is not null and cardinality(requested_keys) <> 1 then
    raise exception 'Enter a manual d20 result for one enemy or NPC at a time.';
  end if;
  if exists (
    select 1
    from unnest(requested_keys) requested(key)
    where not exists (
      select 1 from public.combat_lobby_private_participants p
      where p.lobby_id = p_lobby_id and p.initiative_key = requested.key
    )
  ) then
    raise exception 'One or more selected participants are not in this encounter.';
  end if;

  perform p.participant_id
  from public.combat_lobby_private_participants p
  where p.lobby_id = p_lobby_id and p.initiative_key = any(requested_keys)
  order by p.participant_id
  for update;

  for target_row in
    select p.initiative_key, p.participant_type, min(p.name) as name, p.group_name,
      p.initiative_bonus, p.initiative_mode, p.image_id, min(p.sort_order) as sort_order,
      count(*)::integer as member_count
    from public.combat_lobby_private_participants p
    where p.lobby_id = p_lobby_id and p.initiative_key = any(requested_keys)
    group by p.initiative_key, p.participant_type, p.group_name,
      p.initiative_bonus, p.initiative_mode, p.image_id
    order by min(p.sort_order), p.initiative_key
  loop
    if exists (
      select 1 from public.combat_lobby_initiative_results r
      where r.lobby_id = p_lobby_id and r.initiative_key = target_row.initiative_key
    ) then
      if p_roll_unrolled then
        continue;
      end if;
      raise exception 'A selected enemy or NPC is already ready. Reset it before rolling again.';
    end if;

    result_raw_roll := coalesce(p_raw_roll, floor(random() * 20)::integer + 1);
    insert into public.combat_lobby_initiative_results (
      lobby_id, initiative_key, participant_type, participant_id, display_name,
      initiative_bonus, raw_roll, total, image_id, sort_order
    ) values (
      p_lobby_id,
      target_row.initiative_key,
      target_row.participant_type,
      target_row.initiative_key,
      case
        when target_row.initiative_mode = 'horde' and target_row.member_count > 1
          then target_row.group_name || ' Horde'
        else target_row.name
      end,
      target_row.initiative_bonus,
      result_raw_roll,
      result_raw_roll + target_row.initiative_bonus,
      target_row.image_id,
      target_row.sort_order
    );
    saved_results := saved_results || jsonb_build_array(jsonb_build_object(
      'initiative_key', target_row.initiative_key,
      'raw_roll', result_raw_roll,
      'bonus', target_row.initiative_bonus,
      'total', result_raw_roll + target_row.initiative_bonus
    ));
  end loop;

  return saved_results;
exception
  when unique_violation then
    raise exception 'An initiative result was submitted at the same time. Refresh and reset before trying again.';
end;
$$;

create or replace function public.reset_combat_lobby_initiative(
  p_lobby_id uuid,
  p_initiative_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.combat_lobbies
    where id = p_lobby_id and owner_id = auth.uid()
  ) then
    raise exception 'Only the DM who created this lobby can reset initiative.';
  end if;
  delete from public.combat_lobby_initiative_results
  where lobby_id = p_lobby_id and initiative_key = p_initiative_key;
  if not found then
    raise exception 'That initiative result does not exist.';
  end if;
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

  select * into lobby_row from public.combat_lobbies where id = p_lobby_id;
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
  from public.combat_lobby_members m where m.lobby_id = p_lobby_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'character_id', c.character_id,
    'name', c.name,
    'class_name', c.class_name,
    'race', c.race,
    'portrait_preset_id', c.portrait_preset_id,
    'initiative_bonus', c.initiative_bonus
  ) order by c.name, c.character_id), '[]'::jsonb)
  into lobby_characters
  from public.combat_lobby_characters c where c.lobby_id = p_lobby_id;

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
    and (
      lobby_member_role = 'dm'
      or r.participant_type = 'character'
      or (
        r.participant_type = 'enemy'
        and lobby_row.combat_started_at is not null
        and exists (
          select 1 from public.combat_lobby_private_participants p
          where p.lobby_id = r.lobby_id
            and p.initiative_key = r.initiative_key
            and p.participant_type = 'enemy'
            and p.is_active
            and not p.is_hidden
            and p.status = 'active'
            and p.arrival_round <= lobby_row.current_round
        )
      )
    );

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
    'encounter_name', lobby_row.encounter_name,
    'status', lobby_row.status,
    'combat_started', lobby_row.combat_started_at is not null,
    'current_round', lobby_row.current_round,
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

alter table public.combat_lobby_private_participants enable row level security;
alter table public.combat_lobby_initiative_results enable row level security;
revoke all on public.combat_lobby_private_participants from anon, authenticated;
revoke all on public.combat_lobby_initiative_results from anon, authenticated;
grant select on public.combat_lobby_initiative_results to authenticated;

drop policy if exists "Lobby members read permitted initiative results"
  on public.combat_lobby_initiative_results;
create policy "Lobby members read permitted initiative results"
  on public.combat_lobby_initiative_results for select to authenticated
  using (public.can_read_combat_lobby_initiative(lobby_id, participant_type, initiative_key));

revoke all on function public.can_read_combat_lobby_initiative(uuid, text, text)
  from public, anon;
grant execute on function public.can_read_combat_lobby_initiative(uuid, text, text)
  to authenticated;
revoke all on function public.create_combat_lobby_with_initiative(text, text, text, jsonb, jsonb, jsonb)
  from public, anon;
grant execute on function public.create_combat_lobby_with_initiative(text, text, text, jsonb, jsonb, jsonb)
  to authenticated;
revoke all on function public.submit_player_combat_initiative(uuid, integer)
  from public, anon;
grant execute on function public.submit_player_combat_initiative(uuid, integer)
  to authenticated;
revoke all on function public.submit_dm_combat_initiative(uuid, text[], integer, boolean)
  from public, anon;
grant execute on function public.submit_dm_combat_initiative(uuid, text[], integer, boolean)
  to authenticated;
revoke all on function public.reset_combat_lobby_initiative(uuid, text)
  from public, anon;
grant execute on function public.reset_combat_lobby_initiative(uuid, text)
  to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.combat_lobby_initiative_results;
exception
  when duplicate_object then null;
end;
$$;
