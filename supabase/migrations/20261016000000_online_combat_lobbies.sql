create table if not exists public.combat_lobbies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  campaign_id text not null,
  encounter_id text not null,
  encounter_name text not null check (char_length(encounter_name) between 1 and 100),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.combat_lobby_private (
  lobby_id uuid primary key references public.combat_lobbies(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  join_code text not null unique check (join_code ~ '^[A-F0-9]{12}$'),
  enemy_data jsonb not null default '[]'::jsonb
);

create table if not exists public.combat_lobby_characters (
  lobby_id uuid not null references public.combat_lobbies(id) on delete cascade,
  character_id text not null,
  name text not null check (char_length(name) between 1 and 80),
  class_name text not null check (char_length(class_name) between 1 and 80),
  race text,
  portrait_preset_id text,
  primary key (lobby_id, character_id)
);

create table if not exists public.combat_lobby_members (
  lobby_id uuid not null references public.combat_lobbies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  role text not null check (role in ('dm', 'player')),
  claimed_character_id text,
  joined_at timestamptz not null default now(),
  primary key (lobby_id, user_id),
  foreign key (lobby_id, claimed_character_id)
    references public.combat_lobby_characters(lobby_id, character_id)
);

create unique index if not exists combat_lobby_one_claim_per_character
  on public.combat_lobby_members (lobby_id, claimed_character_id)
  where claimed_character_id is not null;

create or replace function public.is_combat_lobby_member(target_lobby_id uuid)
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
      and l.owner_id = (select auth.uid())
  ) or exists (
    select 1
    from public.combat_lobby_members m
    where m.lobby_id = target_lobby_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.create_combat_lobby(
  p_campaign_id text,
  p_encounter_id text,
  p_encounter_name text,
  p_characters jsonb,
  p_enemy_data jsonb
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
  character_count integer := 0;
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
     or jsonb_typeof(p_enemy_data) is distinct from 'array' then
    raise exception 'Lobby roster or enemy data has an invalid format.';
  end if;
  if jsonb_array_length(p_characters) > 50
     or jsonb_array_length(p_enemy_data) > 100 then
    raise exception 'Lobby roster or enemy data has an invalid format.';
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
    character_count := character_count + 1;
    if coalesce(char_length(trim(character_row ->> 'id')), 0) = 0
       or coalesce(char_length(trim(character_row ->> 'name')), 0) not between 1 and 80
       or coalesce(char_length(trim(character_row ->> 'className')), 0) not between 1 and 80 then
      raise exception 'Every roster character must have a valid id, name, and class.';
    end if;
    insert into public.combat_lobby_characters (
      lobby_id, character_id, name, class_name, race, portrait_preset_id
    ) values (
      new_lobby_id,
      trim(character_row ->> 'id'),
      trim(character_row ->> 'name'),
      trim(character_row ->> 'className'),
      nullif(trim(character_row ->> 'race'), ''),
      nullif(trim(character_row ->> 'portraitPresetId'), '')
    );
  end loop;

  insert into public.combat_lobby_members (lobby_id, user_id, display_name, role)
  values (new_lobby_id, current_user_id, 'Dungeon Master', 'dm');

  return jsonb_build_object(
    'lobby_id', new_lobby_id,
    'join_code', new_join_code
  );
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
  for update of l;

  if matched_lobby_id is null then
    raise exception 'No open lobby matches that code.';
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
  lobby_member_role text;
  lobby_status text;
begin
  if current_user_id is null then
    raise exception 'Sign in before claiming a character.';
  end if;

  select role into lobby_member_role
  from public.combat_lobby_members
  where lobby_id = p_lobby_id and user_id = current_user_id;

  if lobby_member_role is null then
    raise exception 'Join this lobby before claiming a character.';
  end if;
  if lobby_member_role <> 'player' then
    raise exception 'The DM does not claim a player character.';
  end if;
  select status into lobby_status
  from public.combat_lobbies
  where id = p_lobby_id
  for update;

  if lobby_status is distinct from 'open' then
    raise exception 'This lobby is closed.';
  end if;

  select role into lobby_member_role
  from public.combat_lobby_members
  where lobby_id = p_lobby_id and user_id = current_user_id
  for update;

  if lobby_member_role is distinct from 'player' then
    raise exception 'Join this lobby as a player before claiming a character.';
  end if;

  if p_character_id is not null and not exists (
    select 1 from public.combat_lobby_characters
    where lobby_id = p_lobby_id and character_id = p_character_id
  ) then
    raise exception 'That character is not available in this lobby.';
  end if;

  update public.combat_lobby_members
  set claimed_character_id = p_character_id
  where lobby_id = p_lobby_id
    and user_id = current_user_id
    and role = 'player';
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
    'portrait_preset_id', c.portrait_preset_id
  ) order by c.name), '[]'::jsonb)
  into lobby_characters
  from public.combat_lobby_characters c
  where c.lobby_id = p_lobby_id;

  if lobby_member_role = 'dm' then
    select * into private_row
    from public.combat_lobby_private
    where lobby_id = p_lobby_id and owner_id = current_user_id;
  end if;

  return jsonb_build_object(
    'lobby_id', lobby_row.id,
    'owner_id', lobby_row.owner_id,
    'encounter_name', lobby_row.encounter_name,
    'status', lobby_row.status,
    'role', lobby_member_role,
    'members', lobby_members,
    'characters', lobby_characters
  ) || case
    when lobby_member_role = 'dm' then jsonb_build_object(
      'join_code', private_row.join_code,
      'enemy_data', private_row.enemy_data
    )
    else '{}'::jsonb
  end;
end;
$$;

create or replace function public.close_combat_lobby(p_lobby_id uuid)
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
    raise exception 'Only the DM who created this lobby can close it.';
  end if;

  update public.combat_lobbies set status = 'closed' where id = p_lobby_id;
end;
$$;

alter table public.combat_lobbies enable row level security;
alter table public.combat_lobby_private enable row level security;
alter table public.combat_lobby_characters enable row level security;
alter table public.combat_lobby_members enable row level security;

revoke all on public.combat_lobbies from anon, authenticated;
revoke all on public.combat_lobby_private from anon, authenticated;
revoke all on public.combat_lobby_characters from anon, authenticated;
revoke all on public.combat_lobby_members from anon, authenticated;

grant select on public.combat_lobbies to authenticated;
grant select on public.combat_lobby_characters to authenticated;
grant select on public.combat_lobby_members to authenticated;

drop policy if exists "Lobby participants read lobby metadata"
  on public.combat_lobbies;
create policy "Lobby participants read lobby metadata"
  on public.combat_lobbies for select to authenticated
  using (public.is_combat_lobby_member(id));

drop policy if exists "Only lobby owners read private combat data"
  on public.combat_lobby_private;
create policy "Only lobby owners read private combat data"
  on public.combat_lobby_private for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "Lobby participants read character roster"
  on public.combat_lobby_characters;
create policy "Lobby participants read character roster"
  on public.combat_lobby_characters for select to authenticated
  using (public.is_combat_lobby_member(lobby_id));

drop policy if exists "Lobby participants read member list"
  on public.combat_lobby_members;
create policy "Lobby participants read member list"
  on public.combat_lobby_members for select to authenticated
  using (public.is_combat_lobby_member(lobby_id));

revoke all on function public.is_combat_lobby_member(uuid) from public, anon;
grant execute on function public.is_combat_lobby_member(uuid) to authenticated;
revoke all on function public.create_combat_lobby(text, text, text, jsonb, jsonb)
  from public, anon;
grant execute on function public.create_combat_lobby(text, text, text, jsonb, jsonb)
  to authenticated;
revoke all on function public.join_combat_lobby(text, text) from public, anon;
grant execute on function public.join_combat_lobby(text, text) to authenticated;
revoke all on function public.claim_combat_lobby_character(uuid, text)
  from public, anon;
grant execute on function public.claim_combat_lobby_character(uuid, text)
  to authenticated;
revoke all on function public.get_combat_lobby_snapshot(uuid) from public, anon;
grant execute on function public.get_combat_lobby_snapshot(uuid) to authenticated;
revoke all on function public.close_combat_lobby(uuid) from public, anon;
grant execute on function public.close_combat_lobby(uuid) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.combat_lobbies;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.combat_lobby_members;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.combat_lobby_characters;
exception
  when duplicate_object then null;
end;
$$;
