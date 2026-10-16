import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getSupabaseClient,
  type SupabaseIdentity,
} from '@/lib/supabase';
import type { CampaignCharacter, CampaignEncounter } from '@/storage/campaigns';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type OnlineLobbyMember = {
  user_id: string;
  display_name: string;
  role: 'dm' | 'player';
  claimed_character_id: string | null;
};

export type OnlineLobbyCharacter = {
  character_id: string;
  name: string;
  class_name: string;
  race: string | null;
  portrait_preset_id: string | null;
  initiative_bonus: number;
};

export type OnlineInitiativeResult = {
  initiative_key: string;
  participant_type: 'character' | 'enemy' | 'ally';
  participant_id: string;
  name: string;
  raw_roll: number;
  bonus: number;
  total: number;
  portrait_preset_id: string | null;
  image_id: string | null;
  sort_order: number;
};

export type OnlineDmParticipant = {
  initiative_key: string;
  participant_type: 'enemy' | 'ally';
  name: string;
  initiative_bonus: number;
  initiative_mode: 'individual' | 'horde';
  member_count: number;
  active_count: number;
  waiting_count: number;
  scheduled_count: number;
  hidden_count: number;
  defeated_count: number;
  inactive_count: number;
  arrival_round: number;
  image_id: string | null;
  sort_order: number;
  members: {
    participant_id: string;
    name: string;
    status: 'waiting' | 'active' | 'scheduled' | 'defeated' | 'inactive';
    is_hidden: boolean;
    is_active: boolean;
    arrival_round: number;
    max_hp: number;
    current_hp: number;
    conditions: unknown[];
  }[];
};

export type OnlineLobbySnapshot = {
  lobby_id: string;
  owner_id: string;
  encounter_name: string;
  status: 'open' | 'closed';
  combat_started: boolean;
  current_round: number;
  role: 'dm' | 'player';
  members: OnlineLobbyMember[];
  characters: OnlineLobbyCharacter[];
  initiative_results: OnlineInitiativeResult[];
  join_code?: string;
  enemy_data?: unknown[];
  dm_participants?: OnlineDmParticipant[];
};

const LAST_LOBBY_KEY_PREFIX = 'dnd-initiative-tracker.online-lobby.v1.';

function requireIdentity(identity: SupabaseIdentity) {
  if (!identity.userId) throw new Error('Sign in before using an online lobby.');
}

function parseSnapshot(value: unknown): OnlineLobbySnapshot {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Supabase returned an invalid lobby snapshot.');
  }
  const snapshot = value as Partial<OnlineLobbySnapshot>;
  if (
    typeof snapshot.lobby_id !== 'string' ||
    typeof snapshot.owner_id !== 'string' ||
    typeof snapshot.encounter_name !== 'string' ||
    (snapshot.status !== 'open' && snapshot.status !== 'closed') ||
    typeof snapshot.combat_started !== 'boolean' ||
    typeof snapshot.current_round !== 'number' ||
    (snapshot.role !== 'dm' && snapshot.role !== 'player') ||
    !Array.isArray(snapshot.members) ||
    !Array.isArray(snapshot.characters) ||
    !Array.isArray(snapshot.initiative_results)
  ) {
    throw new Error('Supabase returned an invalid lobby snapshot.');
  }
  const membersAreValid = snapshot.members.every(
    (member) =>
      typeof member === 'object' &&
      member !== null &&
      typeof member.user_id === 'string' &&
      typeof member.display_name === 'string' &&
      (member.role === 'dm' || member.role === 'player') &&
      (member.claimed_character_id === null ||
        typeof member.claimed_character_id === 'string'),
  );
  const charactersAreValid = snapshot.characters.every(
    (character) =>
      typeof character === 'object' &&
      character !== null &&
      typeof character.character_id === 'string' &&
      typeof character.name === 'string' &&
      typeof character.class_name === 'string' &&
      (character.race === null || typeof character.race === 'string') &&
      (character.portrait_preset_id === null ||
        typeof character.portrait_preset_id === 'string') &&
      Number.isInteger(character.initiative_bonus),
  );
  const resultsAreValid = snapshot.initiative_results.every(
    (result) =>
      typeof result === 'object' &&
      result !== null &&
      typeof result.initiative_key === 'string' &&
      (result.participant_type === 'character' ||
        result.participant_type === 'enemy' ||
        result.participant_type === 'ally') &&
      typeof result.participant_id === 'string' &&
      typeof result.name === 'string' &&
      Number.isInteger(result.raw_roll) &&
      result.raw_roll >= 1 &&
      result.raw_roll <= 20 &&
      Number.isInteger(result.bonus) &&
      Number.isInteger(result.total) &&
      result.total === result.raw_roll + result.bonus &&
      (result.portrait_preset_id === null ||
        typeof result.portrait_preset_id === 'string') &&
      (result.image_id === null || typeof result.image_id === 'string') &&
      Number.isInteger(result.sort_order),
  );
  const dmParticipantsAreValid =
    snapshot.role !== 'dm' ||
    (Array.isArray(snapshot.dm_participants) &&
      snapshot.dm_participants.every(
        (participant) =>
          typeof participant === 'object' &&
          participant !== null &&
          typeof participant.initiative_key === 'string' &&
          (participant.participant_type === 'enemy' ||
            participant.participant_type === 'ally') &&
          typeof participant.name === 'string' &&
          Number.isInteger(participant.initiative_bonus) &&
          (participant.initiative_mode === 'individual' ||
            participant.initiative_mode === 'horde') &&
          Number.isInteger(participant.member_count) &&
          Array.isArray(participant.members),
      ));
  if (!membersAreValid || !charactersAreValid || !resultsAreValid || !dmParticipantsAreValid) {
    throw new Error('Supabase returned an invalid initiative roster.');
  }
  if (snapshot.role === 'player' && (
    'enemy_data' in snapshot ||
    'join_code' in snapshot ||
    'dm_participants' in snapshot ||
    (!snapshot.combat_started &&
      snapshot.initiative_results.some((result) => result.participant_type !== 'character'))
  )) {
    throw new Error('Supabase exposed private lobby data to a player.');
  }
  if (
    snapshot.role === 'dm' &&
    (typeof snapshot.join_code !== 'string' ||
      !Array.isArray(snapshot.enemy_data) ||
      !Array.isArray(snapshot.dm_participants))
  ) {
    throw new Error('Supabase returned an incomplete DM lobby snapshot.');
  }
  return snapshot as OnlineLobbySnapshot;
}

export async function createOnlineCombatLobby(
  identity: SupabaseIdentity,
  campaignId: string,
  encounter: CampaignEncounter,
  characters: CampaignCharacter[],
  allies: NonNullable<CampaignEncounter['allies']> = [],
): Promise<OnlineLobbySnapshot> {
  requireIdentity(identity);
  const supabase = getSupabaseClient();
  const roster = characters
    .filter((character) => (character.status ?? 'active') === 'active')
    .map((character) => ({
      id: character.id,
      name: character.name,
      className: character.className,
      race: character.race ?? '',
      portraitPresetId: character.portraitPresetId ?? '',
      initiativeBonus: character.initiative,
    }));
  const enemyData = encounter.enemies.map((enemy) => ({
    id: enemy.id,
    name: enemy.name,
    initiative: enemy.initiative,
    imageId: enemy.imageId ?? '',
    quantity: enemy.quantity ?? 1,
    initiativeMode: enemy.initiativeMode ?? 'individual',
    maxHp: enemy.maxHp ?? 10,
    isHidden: enemy.isHidden ?? false,
    arrivalRound: enemy.arrivalRound ?? 1,
    status: enemy.status ?? 'waiting',
    isActive: false,
    conditions: [],
  }));
  const allyData = allies.map((ally) => ({
    id: ally.id,
    name: ally.name,
    initiative: ally.initiative,
    portraitPresetId: ally.portraitPresetId ?? '',
    maxHp: ally.maxHp ?? 10,
  }));
  const { data, error } = await supabase.rpc('create_combat_lobby_with_initiative', {
    p_campaign_id: campaignId,
    p_encounter_id: encounter.id,
    p_encounter_name: encounter.name,
    p_characters: roster,
    p_enemy_data: enemyData,
    p_allies: allyData,
  });
  if (error) throw new Error(`Online lobby could not be created: ${error.message}`);
  const created = data as { lobby_id?: unknown; join_code?: unknown } | null;
  if (
    !created ||
    typeof created.lobby_id !== 'string' ||
    typeof created.join_code !== 'string'
  ) {
    throw new Error('Supabase created the lobby but returned an invalid response.');
  }

  const snapshot = await loadOnlineLobbySnapshot(identity, created.lobby_id);
  await rememberOnlineLobby(identity, created.lobby_id);
  return snapshot;
}

export async function rememberOnlineLobby(
  identity: SupabaseIdentity,
  lobbyId: string,
): Promise<void> {
  requireIdentity(identity);
  await AsyncStorage.setItem(`${LAST_LOBBY_KEY_PREFIX}${identity.userId}`, lobbyId);
}

export async function restoreLastOnlineLobby(
  identity: SupabaseIdentity,
): Promise<OnlineLobbySnapshot | null> {
  requireIdentity(identity);
  const lobbyId = await AsyncStorage.getItem(`${LAST_LOBBY_KEY_PREFIX}${identity.userId}`);
  if (!lobbyId) return null;
  try {
    return await loadOnlineLobbySnapshot(identity, lobbyId);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/not a member|does not exist|invalid lobby/i.test(message)) {
      await AsyncStorage.removeItem(`${LAST_LOBBY_KEY_PREFIX}${identity.userId}`);
      return null;
    }
    throw error;
  }
}

export async function submitPlayerInitiative(
  identity: SupabaseIdentity,
  lobbyId: string,
  rawRoll: number | null,
): Promise<void> {
  requireIdentity(identity);
  if (rawRoll !== null && (!Number.isInteger(rawRoll) || rawRoll < 1 || rawRoll > 20)) {
    throw new Error('A d20 result must be a whole number from 1 through 20.');
  }
  const { error } = await getSupabaseClient().rpc('submit_player_combat_initiative', {
    p_lobby_id: lobbyId,
    p_raw_roll: rawRoll,
  });
  if (error) throw new Error(`Initiative could not be submitted: ${error.message}`);
}

export async function submitDmInitiative(
  identity: SupabaseIdentity,
  lobbyId: string,
  initiativeKeys: string[],
  options: { rawRoll?: number; rollUnrolled?: boolean } = {},
): Promise<void> {
  requireIdentity(identity);
  if (
    options.rawRoll !== undefined &&
    (!Number.isInteger(options.rawRoll) || options.rawRoll < 1 || options.rawRoll > 20)
  ) {
    throw new Error('A d20 result must be a whole number from 1 through 20.');
  }
  const { error } = await getSupabaseClient().rpc('submit_dm_combat_initiative', {
    p_lobby_id: lobbyId,
    p_initiative_keys: initiativeKeys,
    p_raw_roll: options.rawRoll ?? null,
    p_roll_unrolled: options.rollUnrolled ?? false,
  });
  if (error) throw new Error(`Initiative could not be saved: ${error.message}`);
}

export async function resetDmInitiative(
  identity: SupabaseIdentity,
  lobbyId: string,
  initiativeKey: string,
): Promise<void> {
  requireIdentity(identity);
  const { error } = await getSupabaseClient().rpc('reset_combat_lobby_initiative', {
    p_lobby_id: lobbyId,
    p_initiative_key: initiativeKey,
  });
  if (error) throw new Error(`Initiative could not be reset: ${error.message}`);
}

export async function joinOnlineCombatLobby(
  identity: SupabaseIdentity,
  joinCode: string,
  displayName: string,
): Promise<OnlineLobbySnapshot> {
  requireIdentity(identity);
  const normalizedCode = joinCode.trim().replace(/\s/g, '').toUpperCase();
  if (!/^[A-F0-9]{12}$/.test(normalizedCode)) {
    throw new Error('Enter the 12-character lobby code.');
  }
  if (!displayName.trim()) throw new Error('Enter a display name to join.');
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('join_combat_lobby', {
    p_join_code: normalizedCode,
    p_display_name: displayName.trim(),
  });
  if (error) throw new Error(`Lobby could not be joined: ${error.message}`);
  if (typeof data !== 'string') {
    throw new Error('Supabase joined the lobby but returned an invalid response.');
  }
  const snapshot = await loadOnlineLobbySnapshot(identity, data);
  await rememberOnlineLobby(identity, data);
  return snapshot;
}

export async function loadOnlineLobbySnapshot(
  identity: SupabaseIdentity,
  lobbyId: string,
): Promise<OnlineLobbySnapshot> {
  requireIdentity(identity);
  const { data, error } = await getSupabaseClient().rpc('get_combat_lobby_snapshot', {
    p_lobby_id: lobbyId,
  });
  if (error) throw new Error(`Lobby could not be loaded: ${error.message}`);
  return parseSnapshot(data);
}

export async function claimOnlineLobbyCharacter(
  identity: SupabaseIdentity,
  lobbyId: string,
  characterId: string | null,
): Promise<void> {
  requireIdentity(identity);
  const { error } = await getSupabaseClient().rpc('claim_combat_lobby_character', {
    p_lobby_id: lobbyId,
    p_character_id: characterId,
  });
  if (error) throw new Error(`Character claim could not be saved: ${error.message}`);
}

export async function closeOnlineCombatLobby(
  identity: SupabaseIdentity,
  lobbyId: string,
): Promise<void> {
  requireIdentity(identity);
  const { error } = await getSupabaseClient().rpc('close_combat_lobby', {
    p_lobby_id: lobbyId,
  });
  if (error) throw new Error(`Lobby could not be closed: ${error.message}`);
}

export function subscribeToOnlineCombatLobby(
  identity: SupabaseIdentity,
  lobbyId: string,
  onChange: () => void,
  onError: (message: string) => void,
): () => void {
  requireIdentity(identity);
  const supabase = getSupabaseClient();
  let isDisposed = false;
  const channel: RealtimeChannel = supabase
    .channel(`combat-lobby:${lobbyId}:${identity.userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'combat_lobbies', filter: `id=eq.${lobbyId}` },
      onChange,
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'combat_lobby_initiative_results',
        filter: `lobby_id=eq.${lobbyId}`,
      },
      onChange,
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'combat_lobby_members',
        filter: `lobby_id=eq.${lobbyId}`,
      },
      onChange,
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'combat_lobby_characters',
        filter: `lobby_id=eq.${lobbyId}`,
      },
      onChange,
    )
    .subscribe((status, error) => {
      if (isDisposed) return;
      if (status === 'SUBSCRIBED') {
        onChange();
      } else if (
        status === 'CHANNEL_ERROR' ||
        status === 'TIMED_OUT' ||
        status === 'CLOSED'
      ) {
        onError(error?.message ?? `Lobby live updates disconnected (${status}).`);
      }
    });
  return () => {
    isDisposed = true;
    void supabase.removeChannel(channel);
  };
}
