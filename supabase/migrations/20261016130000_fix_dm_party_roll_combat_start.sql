insert into public.combat_lobby_initiative_actors (
  lobby_id,
  initiative_key,
  submitted_by
)
select
  result.lobby_id,
  result.initiative_key,
  lobby.owner_id
from public.combat_lobby_initiative_results result
join public.combat_lobbies lobby on lobby.id = result.lobby_id
where result.participant_type = 'character'
  and not exists (
    select 1
    from public.combat_lobby_initiative_actors actor
    where actor.lobby_id = result.lobby_id
      and actor.initiative_key = result.initiative_key
  );

create or replace function public.submit_dm_party_combat_initiative(
  p_lobby_id uuid,
  p_character_id text,
  p_raw_roll integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  lobby_row public.combat_lobbies%rowtype;
  character_row public.combat_lobby_characters%rowtype;
  result_key text;
  result_total integer;
begin
  if current_user_id is null then
    raise exception 'Sign in before entering party initiative.';
  end if;
  if p_raw_roll is null or p_raw_roll not between 1 and 20 then
    raise exception 'A d20 result must be a whole number from 1 through 20.';
  end if;

  select * into lobby_row
  from public.combat_lobbies
  where id = p_lobby_id
  for update;
  if not found or lobby_row.owner_id <> current_user_id then
    raise exception 'Only the DM who created this lobby can enter party initiative.';
  end if;
  if lobby_row.status <> 'open' or lobby_row.combat_started_at is not null then
    raise exception 'Initiative submissions are closed for this lobby.';
  end if;

  select * into character_row
  from public.combat_lobby_characters
  where lobby_id = p_lobby_id and character_id = p_character_id
  for update;
  if not found then
    raise exception 'That party character is not in this lobby.';
  end if;

  result_key := 'character:' || character_row.character_id;
  result_total := p_raw_roll + character_row.initiative_bonus;

  insert into public.combat_lobby_initiative_results (
    lobby_id, initiative_key, participant_type, participant_id, display_name,
    initiative_bonus, raw_roll, total, portrait_preset_id, sort_order
  ) values (
    p_lobby_id,
    result_key,
    'character',
    character_row.character_id,
    character_row.name,
    character_row.initiative_bonus,
    p_raw_roll,
    result_total,
    character_row.portrait_preset_id,
    (
      select ordered_characters.row_number
      from (
        select
          characters.character_id,
          row_number() over (order by characters.name, characters.character_id)::integer as row_number
        from public.combat_lobby_characters characters
        where characters.lobby_id = p_lobby_id
      ) ordered_characters
      where ordered_characters.character_id = character_row.character_id
    )
  );

  insert into public.combat_lobby_initiative_actors (
    lobby_id, initiative_key, submitted_by
  ) values (
    p_lobby_id, result_key, current_user_id
  );

  return jsonb_build_object(
    'initiative_key', result_key,
    'raw_roll', p_raw_roll,
    'bonus', character_row.initiative_bonus,
    'total', result_total
  );
exception
  when unique_violation then
    raise exception 'This character already has an initiative result. Only the DM can reset it first.';
end;
$$;

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

revoke all on function public.submit_dm_party_combat_initiative(uuid, text, integer)
  from public, anon;
grant execute on function public.submit_dm_party_combat_initiative(uuid, text, integer)
  to authenticated;
revoke all on function public.start_combat_lobby(uuid)
  from public, anon;
grant execute on function public.start_combat_lobby(uuid)
  to authenticated;
