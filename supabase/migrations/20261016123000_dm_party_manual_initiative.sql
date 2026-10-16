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

revoke all on function public.submit_dm_party_combat_initiative(uuid, text, integer)
  from public, anon;
grant execute on function public.submit_dm_party_combat_initiative(uuid, text, integer)
  to authenticated;
