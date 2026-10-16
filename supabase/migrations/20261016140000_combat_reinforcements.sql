alter table public.combat_lobby_private_participants
  add column if not exists arrival_mode text not null default 'round'
    check (arrival_mode in ('round', 'dm')),
  add column if not exists arrival_note text
    check (arrival_note is null or char_length(arrival_note) <= 200);

create or replace function public.configure_combat_lobby_reinforcements(
  p_lobby_id uuid,
  p_schedules jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  lobby_row public.combat_lobbies%rowtype;
  schedule_row jsonb;
  enemy_id_value text;
  arrival_mode_value text;
  arrival_round_value integer;
  arrival_note_value text;
  changed_rows integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in before scheduling reinforcements.';
  end if;
  select * into lobby_row
  from public.combat_lobbies
  where id = p_lobby_id
  for update;
  if not found or lobby_row.owner_id <> auth.uid() then
    raise exception 'Only the DM who created this lobby can schedule reinforcements.';
  end if;
  if lobby_row.status <> 'open' or lobby_row.combat_started_at is not null then
    raise exception 'Reinforcements can only be scheduled before combat starts.';
  end if;
  if p_schedules is null or jsonb_typeof(p_schedules) <> 'array' then
    raise exception 'Reinforcement schedules must be a list.';
  end if;

  for schedule_row in select value from jsonb_array_elements(p_schedules)
  loop
    enemy_id_value := schedule_row ->> 'id';
    arrival_mode_value := coalesce(schedule_row ->> 'arrivalMode', 'round');
    if coalesce(enemy_id_value, '') !~ '^[A-Za-z0-9_-]{1,80}$'
       or arrival_mode_value not in ('round', 'dm')
       or coalesce(schedule_row ->> 'arrivalRound', '') !~ '^[0-9]+$' then
      raise exception 'A reinforcement has an invalid id, arrival mode, or round.';
    end if;
    arrival_round_value := (schedule_row ->> 'arrivalRound')::integer;
    if arrival_round_value not between 1 and 999 then
      raise exception 'Reinforcement arrival rounds must be from 1 through 999.';
    end if;
    arrival_note_value := nullif(trim(schedule_row ->> 'arrivalNote'), '');
    if char_length(coalesce(arrival_note_value, '')) > 200 then
      raise exception 'Reinforcement trigger notes cannot exceed 200 characters.';
    end if;

    update public.combat_lobby_private_participants p
    set arrival_mode = arrival_mode_value,
        arrival_note = case when arrival_mode_value = 'dm' then arrival_note_value else null end,
        arrival_round = case when arrival_mode_value = 'dm' then 1 else arrival_round_value end,
        status = case
          when arrival_mode_value = 'dm' or arrival_round_value > 1 then 'scheduled'
          else 'waiting'
        end,
        is_active = false
    where p.lobby_id = p_lobby_id
      and p.participant_type = 'enemy'
      and left(
        p.participant_id,
        char_length('enemy:' || enemy_id_value || ':')
      ) = 'enemy:' || enemy_id_value || ':';
    get diagnostics changed_rows = row_count;
    if changed_rows = 0 then
      raise exception 'The scheduled enemy was not found in this lobby.';
    end if;
  end loop;
end;
$$;

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
  schedules jsonb;
begin
  created_lobby := public.create_combat_lobby_with_initiative(
    p_campaign_id,
    p_encounter_id,
    p_encounter_name,
    p_characters,
    p_enemy_data,
    p_allies
  );

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

create or replace function public.activate_combat_lobby_reinforcement(
  p_lobby_id uuid,
  p_initiative_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  lobby_row public.combat_lobbies%rowtype;
  changed_rows integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in before activating a reinforcement.';
  end if;
  select * into lobby_row
  from public.combat_lobbies
  where id = p_lobby_id
  for update;
  if not found or lobby_row.owner_id <> auth.uid() then
    raise exception 'Only the DM who created this lobby can activate reinforcements.';
  end if;
  if lobby_row.combat_started_at is null then
    raise exception 'Start combat before activating a reinforcement.';
  end if;

  update public.combat_lobby_private_participants
  set status = 'active',
      is_active = true
  where lobby_id = p_lobby_id
    and initiative_key = p_initiative_key
    and participant_type = 'enemy'
    and arrival_mode = 'dm'
    and status = 'scheduled';
  get diagnostics changed_rows = row_count;
  if changed_rows = 0 then
    raise exception 'That enemy is not waiting for DM activation.';
  end if;

  return jsonb_build_object('activated', true, 'current_round', lobby_row.current_round);
end;
$$;

create or replace function public.advance_combat_lobby_round(p_lobby_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  lobby_row public.combat_lobbies%rowtype;
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
    raise exception 'Start combat before advancing the round.';
  end if;
  if lobby_row.current_round >= 999 then
    raise exception 'Combat cannot advance beyond round 999.';
  end if;
  next_round := lobby_row.current_round + 1;
  update public.combat_lobbies
  set current_round = next_round
  where id = p_lobby_id;

  update public.combat_lobby_private_participants
  set status = 'active',
      is_active = true
  where lobby_id = p_lobby_id
    and participant_type = 'enemy'
    and arrival_mode = 'round'
    and status = 'scheduled'
    and arrival_round <= next_round;

  return jsonb_build_object('current_round', next_round);
end;
$$;

revoke all on function public.configure_combat_lobby_reinforcements(uuid, jsonb)
  from public, anon;
grant execute on function public.configure_combat_lobby_reinforcements(uuid, jsonb)
  to authenticated;
revoke all on function public.create_combat_lobby_with_reinforcements(
  text, text, text, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function public.create_combat_lobby_with_reinforcements(
  text, text, text, jsonb, jsonb, jsonb
) to authenticated;
revoke all on function public.activate_combat_lobby_reinforcement(uuid, text)
  from public, anon;
grant execute on function public.activate_combat_lobby_reinforcement(uuid, text)
  to authenticated;
revoke all on function public.advance_combat_lobby_round(uuid)
  from public, anon;
grant execute on function public.advance_combat_lobby_round(uuid)
  to authenticated;
