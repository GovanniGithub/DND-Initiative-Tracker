alter table public.combat_lobbies
  add column if not exists combat_started_at timestamptz,
  add column if not exists current_round integer not null default 1
    check (current_round >= 1),
  add column if not exists visibility_revision integer not null default 0
    check (visibility_revision >= 0),
  add column if not exists initiative_schema_version integer not null default 0
    check (initiative_schema_version >= 0),
  add column if not exists combat_background_id text
    check (combat_background_id is null or combat_background_id in (
      'haunted-city',
      'moonlit-forest',
      'frozen-fortress',
      'desert-ruins',
      'rose-castle',
      'sunlit-harbor'
    ));

alter table public.combat_lobbies
  alter column initiative_schema_version set default 1;

create or replace function public.start_combat_lobby(p_lobby_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  lobby_row public.combat_lobbies%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in before starting combat.';
  end if;

  select * into lobby_row
  from public.combat_lobbies
  where id = p_lobby_id
  for update;
  if not found or lobby_row.owner_id <> auth.uid() then
    raise exception 'Only the DM who created this lobby can start combat.';
  end if;
  if lobby_row.status <> 'open' then
    raise exception 'This lobby is closed.';
  end if;
  if lobby_row.initiative_schema_version <> 1 then
    raise exception 'Reopen the encounter to create a current shared lobby before starting combat.';
  end if;
  if lobby_row.combat_started_at is not null then
    return jsonb_build_object(
      'combat_started', true,
      'started_at', lobby_row.combat_started_at,
      'current_round', lobby_row.current_round
    );
  end if;

  update public.combat_lobby_private_participants
  set status = 'active', is_active = true
  where lobby_id = p_lobby_id
    and status = 'waiting'
    and arrival_round <= lobby_row.current_round;

  update public.combat_lobbies
  set combat_started_at = now()
  where id = p_lobby_id;

  return jsonb_build_object(
    'combat_started', true,
    'current_round', lobby_row.current_round
  );
end;
$$;

create or replace function public.set_combat_lobby_background(
  p_lobby_id uuid,
  p_background_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in before changing the combat background.';
  end if;
  if p_background_id is not null and p_background_id not in (
    'haunted-city',
    'moonlit-forest',
    'frozen-fortress',
    'desert-ruins',
    'rose-castle',
    'sunlit-harbor'
  ) then
    raise exception 'Choose a supported combat background.';
  end if;
  update public.combat_lobbies
  set combat_background_id = p_background_id
  where id = p_lobby_id
    and owner_id = auth.uid()
    and status = 'open'
    and combat_started_at is null;
  if not found then
    raise exception 'Only the DM can set the background before combat starts.';
  end if;
end;
$$;

create or replace function public.join_combat_lobby(
  p_join_code text,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  matched_lobby_id uuid;
begin
  if current_user_id is null then
    raise exception 'Sign in before joining an online lobby.';
  end if;
  if coalesce(char_length(trim(p_display_name)), 0) not between 1 and 40 then
    raise exception 'Display name must be between 1 and 40 characters.';
  end if;
  if coalesce(trim(p_join_code), '') !~* '^[A-F0-9]{12}$' then
    raise exception 'Enter the 12-character lobby code.';
  end if;

  select l.id into matched_lobby_id
  from public.combat_lobbies l
  join public.combat_lobby_private p on p.lobby_id = l.id
  where p.join_code = upper(trim(p_join_code))
    and l.status = 'open'
    and l.combat_started_at is null
  for update of l;

  if matched_lobby_id is null then
    raise exception 'No open lobby matches that code, or combat has already started.';
  end if;

  insert into public.combat_lobby_members (
    lobby_id, user_id, display_name, role
  ) values (
    matched_lobby_id, current_user_id, trim(p_display_name), 'player'
  )
  on conflict (lobby_id, user_id)
  do update set display_name = excluded.display_name;

  return matched_lobby_id;
end;
$$;

create or replace function public.claim_combat_lobby_character(
  p_lobby_id uuid,
  p_character_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  lobby_row public.combat_lobbies%rowtype;
  member_role text;
  current_character_id text;
begin
  if current_user_id is null then
    raise exception 'Sign in before claiming a character.';
  end if;

  select * into lobby_row
  from public.combat_lobbies
  where id = p_lobby_id
  for update;
  if not found or lobby_row.status <> 'open' then
    raise exception 'This lobby is closed.';
  end if;
  if lobby_row.combat_started_at is not null then
    raise exception 'Characters cannot be claimed after combat starts.';
  end if;

  select role, claimed_character_id
  into member_role, current_character_id
  from public.combat_lobby_members
  where lobby_id = p_lobby_id and user_id = current_user_id
  for update;
  if member_role is null then
    raise exception 'Join this lobby before claiming a character.';
  end if;
  if member_role <> 'player' then
    raise exception 'The DM does not claim a player character.';
  end if;
  if current_character_id is distinct from p_character_id and exists (
    select 1
    from public.combat_lobby_initiative_results r
    where r.lobby_id = p_lobby_id
      and r.participant_type = 'character'
      and r.participant_id = current_character_id
  ) then
    raise exception 'Your character is ready. Ask the DM to reset its initiative before changing your claim.';
  end if;
  if p_character_id is not null and not exists (
    select 1 from public.combat_lobby_characters
    where lobby_id = p_lobby_id and character_id = p_character_id
  ) then
    raise exception 'That character is not available in this lobby.';
  end if;

  update public.combat_lobby_members
  set claimed_character_id = p_character_id
  where lobby_id = p_lobby_id and user_id = current_user_id and role = 'player';
exception
  when unique_violation then
    raise exception 'That character has already been claimed by another player.';
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
    'initiative_bonus', c.initiative_bonus
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'initiative_key', p.initiative_key,
    'participant_type', p.participant_type,
    'name', case
      when p.initiative_mode = 'horde' and count(*) > 1
        then min(p.group_name) || ' Horde'
      else min(p.name)
    end,
    'total', max(r.total),
    'image_id', min(p.image_id),
    'portrait_preset_id', min(case when p.participant_type = 'ally' then p.image_id end),
    'sort_order', min(p.sort_order),
    'visible_member_count', count(*)::integer
  ) order by max(r.total) desc nulls last, min(p.sort_order), p.initiative_key), '[]'::jsonb)
  into visible_participants
  from public.combat_lobby_private_participants p
  left join public.combat_lobby_initiative_results r
    on r.lobby_id = p.lobby_id and r.initiative_key = p.initiative_key
  where p.lobby_id = p_lobby_id
    and p.is_active
    and not p.is_hidden
    and p.status = 'active'
    and p.arrival_round <= lobby_row.current_round
  group by p.initiative_key, p.participant_type, p.initiative_mode;

  return visible_participants;
end;
$$;

revoke all on function public.start_combat_lobby(uuid) from public, anon;
grant execute on function public.start_combat_lobby(uuid) to authenticated;
revoke all on function public.set_combat_lobby_background(uuid, text)
  from public, anon;
grant execute on function public.set_combat_lobby_background(uuid, text)
  to authenticated;
revoke all on function public.get_visible_combat_lobby_participants(uuid)
  from public, anon;
grant execute on function public.get_visible_combat_lobby_participants(uuid)
  to authenticated;

create or replace function public.notify_combat_lobby_participant_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_lobby_id uuid;
  round_number integer;
  combat_started boolean;
  old_is_visible boolean := false;
  new_is_visible boolean := false;
begin
  target_lobby_id := case when tg_op = 'DELETE' then old.lobby_id else new.lobby_id end;
  select l.combat_started_at is not null, l.current_round
  into combat_started, round_number
  from public.combat_lobbies l
  where l.id = target_lobby_id;
  if not coalesce(combat_started, false) then
    return null;
  end if;

  if tg_op <> 'INSERT' then
    old_is_visible := old.is_active
      and not old.is_hidden
      and old.status = 'active'
      and old.arrival_round <= round_number;
  end if;
  if tg_op <> 'DELETE' then
    new_is_visible := new.is_active
      and not new.is_hidden
      and new.status = 'active'
      and new.arrival_round <= round_number;
  end if;
  if old_is_visible or new_is_visible then
    update public.combat_lobbies
    set visibility_revision = visibility_revision + 1
    where id = target_lobby_id;
  end if;
  return null;
end;
$$;

create or replace function public.notify_combat_lobby_initiative_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_lobby_id uuid;
  changed_initiative_key text;
  changed_participant_type text;
begin
  target_lobby_id := case when tg_op = 'DELETE' then old.lobby_id else new.lobby_id end;
  changed_initiative_key := case
    when tg_op = 'DELETE' then old.initiative_key else new.initiative_key end;
  changed_participant_type := case
    when tg_op = 'DELETE' then old.participant_type else new.participant_type end;
  if changed_participant_type = 'character' or exists (
    select 1
    from public.combat_lobbies l
    join public.combat_lobby_private_participants p
      on p.lobby_id = l.id
     and p.initiative_key = changed_initiative_key
     and p.participant_type = changed_participant_type
    where l.id = target_lobby_id
      and l.combat_started_at is not null
      and p.is_active
      and not p.is_hidden
      and p.status = 'active'
      and p.arrival_round <= l.current_round
  ) then
    update public.combat_lobbies
    set visibility_revision = visibility_revision + 1
    where id = target_lobby_id;
  end if;
  return null;
end;
$$;

drop trigger if exists combat_lobby_initiative_visibility_changed
  on public.combat_lobby_initiative_results;
create trigger combat_lobby_initiative_visibility_changed
after insert or update or delete on public.combat_lobby_initiative_results
for each row execute function public.notify_combat_lobby_initiative_change();

revoke select on public.combat_lobby_initiative_results from authenticated;
drop policy if exists "Lobby members read permitted initiative results"
  on public.combat_lobby_initiative_results;
