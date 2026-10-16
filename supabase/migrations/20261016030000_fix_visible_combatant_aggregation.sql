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
