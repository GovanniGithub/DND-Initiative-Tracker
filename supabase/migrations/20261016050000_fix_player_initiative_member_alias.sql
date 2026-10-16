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

  select member.claimed_character_id into claimed_character
  from public.combat_lobby_members member
  where member.lobby_id = p_lobby_id
    and member.user_id = current_user_id
    and member.role = 'player'
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
  if exists (
    select 1
    from public.combat_lobby_initiative_actors actor
    where actor.lobby_id = p_lobby_id
      and actor.submitted_by = current_user_id
      and actor.initiative_key <> result_key
  ) then
    raise exception 'Your device already submitted initiative for another character. Ask the DM to reset it first.';
  end if;

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
  insert into public.combat_lobby_initiative_actors (
    lobby_id, initiative_key, submitted_by
  ) values (p_lobby_id, result_key, current_user_id);

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

revoke all on function public.submit_player_combat_initiative(uuid, integer)
  from public, anon;
grant execute on function public.submit_player_combat_initiative(uuid, integer)
  to authenticated;
