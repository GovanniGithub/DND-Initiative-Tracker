import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getSupabaseClient,
  type SupabaseIdentity,
} from '@/lib/supabase';
import type {
  CampaignCharacter,
  CampaignEncounter,
  CampaignEncounterBackgroundId,
} from '@/storage/campaigns';
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
  armor_class: number;
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
  arrival_mode?: 'round' | 'dm';
  arrival_note?: string | null;
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

export type OnlineVisibleCombatant = {
  initiative_key: string;
  participant_type: 'enemy' | 'ally';
  name: string;
  total: number | null;
  armor_class?: number;
  current_hp?: number;
  max_hp?: number;
  image_id: string | null;
  portrait_preset_id: string | null;
  sort_order: number;
  visible_member_count: number;
  is_defeated?: boolean;
};

type OnlineDmEnemyData = {
  id: string;
  arrivalMode: 'round' | 'dm';
  arrivalRound: number;
  arrivalNote: string | null;
};

export type OnlineLobbySnapshot = {
  lobby_id: string;
  owner_id: string;
  encounter_id: string;
  encounter_name: string;
  status: 'open' | 'closed';
  combat_started: boolean;
  current_round: number;
  current_turn_key: string | null;
  visibility_revision: number;
  initiative_schema_version: number;
  background_id: CampaignEncounterBackgroundId | null;
  role: 'dm' | 'player';
  members: OnlineLobbyMember[];
  characters: OnlineLobbyCharacter[];
  initiative_results: OnlineInitiativeResult[];
  visible_combatants: OnlineVisibleCombatant[];
  join_code?: string;
  enemy_data?: OnlineDmEnemyData[];
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
  const visibleCombatants = snapshot.visible_combatants ?? [];
  if (snapshot.current_turn_key === undefined) {
    throw new Error(
      'Turn-by-turn online combat is not enabled on this Supabase project. Run supabase/migrations/20261016170000_combat_turns.sql in the Supabase SQL Editor.',
    );
  }
  if (
    typeof snapshot.visibility_revision !== 'number' ||
    typeof snapshot.initiative_schema_version !== 'number'
  ) {
    throw new Error(
      'Shared initiative is not enabled on this Supabase project. Run supabase/migrations/20261016010000_shared_initiative.sql in the Supabase SQL Editor.',
    );
  }
  if (snapshot.background_id === undefined) {
    throw new Error(
      'Shared combat backgrounds are not enabled on this Supabase project. Run supabase/migrations/20261016020000_start_shared_combat.sql in the Supabase SQL Editor.',
    );
  }
  if (
    snapshot.background_id !== null &&
    snapshot.background_id !== 'haunted-city' &&
    snapshot.background_id !== 'moonlit-forest' &&
    snapshot.background_id !== 'frozen-fortress' &&
    snapshot.background_id !== 'desert-ruins' &&
    snapshot.background_id !== 'rose-castle' &&
    snapshot.background_id !== 'sunlit-harbor'
  ) {
    throw new Error('Supabase returned an unsupported combat background.');
  }
  if (
    typeof snapshot.lobby_id !== 'string' ||
    typeof snapshot.owner_id !== 'string' ||
    typeof snapshot.encounter_id !== 'string' ||
    typeof snapshot.encounter_name !== 'string' ||
    (snapshot.status !== 'open' && snapshot.status !== 'closed') ||
    typeof snapshot.combat_started !== 'boolean' ||
    typeof snapshot.current_round !== 'number' ||
    (snapshot.current_turn_key !== null &&
      typeof snapshot.current_turn_key !== 'string') ||
    typeof snapshot.visibility_revision !== 'number' ||
    !Number.isInteger(snapshot.visibility_revision) ||
    snapshot.visibility_revision < 0 ||
    typeof snapshot.initiative_schema_version !== 'number' ||
    !Number.isInteger(snapshot.initiative_schema_version) ||
    snapshot.initiative_schema_version < 0 ||
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
      Number.isInteger(character.initiative_bonus) &&
      Number.isInteger(character.armor_class) &&
      character.armor_class >= 1 &&
      character.armor_class <= 40,
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
  const visibleCombatantsAreValid =
    Array.isArray(visibleCombatants) &&
    visibleCombatants.every(
      (participant) =>
        typeof participant === 'object' &&
        participant !== null &&
        typeof participant.initiative_key === 'string' &&
        (participant.participant_type === 'enemy' ||
          participant.participant_type === 'ally') &&
        typeof participant.name === 'string' &&
        (participant.total === null || Number.isInteger(participant.total)) &&
        (participant.armor_class === undefined ||
          (Number.isInteger(participant.armor_class) &&
            participant.armor_class >= 1 &&
            participant.armor_class <= 40)) &&
        (participant.current_hp === undefined ||
          (Number.isInteger(participant.current_hp) && participant.current_hp >= 0)) &&
        (participant.max_hp === undefined ||
          (Number.isInteger(participant.max_hp) &&
            participant.max_hp >= (participant.is_defeated ? 0 : 1))) &&
        (participant.current_hp === undefined ||
          participant.max_hp === undefined ||
          participant.current_hp <= participant.max_hp) &&
        (participant.image_id === null || typeof participant.image_id === 'string') &&
        (participant.portrait_preset_id === null ||
          typeof participant.portrait_preset_id === 'string') &&
        Number.isInteger(participant.sort_order) &&
        Number.isInteger(participant.visible_member_count) &&
        participant.visible_member_count >= (participant.is_defeated ? 0 : 1),
    );
  if (
    !membersAreValid ||
    !charactersAreValid ||
    !resultsAreValid ||
    !dmParticipantsAreValid ||
    !visibleCombatantsAreValid
  ) {
    throw new Error('Supabase returned an invalid initiative roster.');
  }
  if (snapshot.role === 'player' && (
    'enemy_data' in snapshot ||
    'join_code' in snapshot ||
    'dm_participants' in snapshot ||
    (!snapshot.combat_started && visibleCombatants.length > 0) ||
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
  const enemyDataById = new Map<string, OnlineDmEnemyData>();
  if (snapshot.role === 'dm') {
    for (const value of snapshot.enemy_data ?? []) {
      if (
        typeof value === 'object' &&
        value !== null &&
        typeof value.id === 'string' &&
        (value.arrivalMode === 'round' || value.arrivalMode === 'dm')
      ) {
        enemyDataById.set(value.id, {
          id: value.id,
          arrivalMode: value.arrivalMode,
          arrivalRound:
            typeof value.arrivalRound === 'number' ? value.arrivalRound : 1,
          arrivalNote: typeof value.arrivalNote === 'string' ? value.arrivalNote : null,
        });
      }
    }
  }
  const dmParticipants = snapshot.dm_participants?.map((participant) => {
    const enemyId = participant.initiative_key.match(/^enemy:([^:]+):/)?.[1];
    const schedule = enemyId ? enemyDataById.get(enemyId) : undefined;
    return {
      ...participant,
      arrival_mode: schedule?.arrivalMode ?? 'round',
      arrival_note: schedule?.arrivalNote ?? null,
    };
  });
  return {
    ...snapshot,
    visible_combatants: visibleCombatants,
    ...(dmParticipants ? { dm_participants: dmParticipants } : {}),
  } as OnlineLobbySnapshot;
}

export const PORTRAIT_URL_PREFIX = 'url:';
const PORTRAIT_BUCKET = 'combat-portraits';

// Uploaded photos live only on the device, so share them through Supabase
// Storage and pass the public URL through the existing portrait text column.
async function resolveSharedPortrait(
  identity: SupabaseIdentity,
  ownerId: string,
  presetId: string | undefined,
  portraitUri: string | null | undefined,
): Promise<string> {
  if (presetId || !portraitUri) return presetId ?? '';
  try {
    const storage = getSupabaseClient().storage.from(PORTRAIT_BUCKET);
    const body = await (await fetch(portraitUri)).arrayBuffer();
    const path = `${identity.userId}/${ownerId}.jpg`;
    const { error } = await storage.upload(path, body, {
      contentType: 'image/jpeg',
      upsert: true,
      cacheControl: '60',
    });
    if (error) return '';
    const version = Date.now();
    return `${PORTRAIT_URL_PREFIX}${storage.getPublicUrl(path).data.publicUrl}?v=${version}`;
  } catch {
    return '';
  }
}

export async function createOnlineCombatLobby(
  identity: SupabaseIdentity,
  campaignId: string,
  encounter: CampaignEncounter,
  characters: CampaignCharacter[],
  allies: NonNullable<CampaignEncounter['allies']> = [],
  backgroundId: CampaignEncounterBackgroundId | null = null,
): Promise<OnlineLobbySnapshot> {
  requireIdentity(identity);
  const supabase = getSupabaseClient();
  const roster = await Promise.all(
    characters
      .filter((character) => (character.status ?? 'active') === 'active')
      .map(async (character) => ({
        id: character.id,
        name: character.name,
        className: character.className,
        race: character.race ?? '',
        portraitPresetId: await resolveSharedPortrait(
          identity,
          character.id,
          character.portraitPresetId,
          character.portraitUri,
        ),
        initiativeBonus: character.initiative,
        armorClass: character.armorClass ?? 10,
      })),
  );
  const enemyData = encounter.enemies.map((enemy) => ({
    id: enemy.id,
    name: enemy.name,
    initiative: enemy.initiative,
    armorClass: enemy.armorClass ?? 10,
    imageId: enemy.imageId ?? '',
    quantity: enemy.quantity ?? 1,
    initiativeMode: enemy.initiativeMode ?? 'individual',
    maxHp: enemy.maxHp ?? 10,
    isHidden: enemy.isHidden ?? false,
    arrivalMode: enemy.arrivalMode ?? 'round',
    arrivalNote: enemy.arrivalNote ?? '',
    arrivalRound: enemy.arrivalMode === 'dm' ? 1 : enemy.arrivalRound ?? 1,
    status:
      enemy.arrivalMode === 'dm' ||
      (enemy.arrivalRound ?? 1) > 1
        ? 'scheduled'
        : 'waiting',
    isActive: false,
    conditions: [],
  }));
  const allyData = await Promise.all(allies.map(async (ally) => ({
    id: ally.id,
    name: ally.name,
    initiative: ally.initiative,
    armorClass: ally.armorClass ?? 10,
    portraitPresetId: await resolveSharedPortrait(
      identity,
      ally.id,
      ally.portraitPresetId,
      ally.portraitUri,
    ),
    maxHp: ally.maxHp ?? 10,
  })));
  const { data, error } = await supabase.rpc('create_combat_lobby_with_reinforcements', {
    p_campaign_id: campaignId,
    p_encounter_id: encounter.id,
    p_encounter_name: encounter.name,
    p_characters: roster,
    p_enemy_data: enemyData,
    p_allies: allyData,
  });
  if (error) {
    const migrationMissing =
      error.code === 'PGRST202' ||
      /could not find the function|schema cache/i.test(error.message);
    throw new Error(
      migrationMissing
        ? 'Online reinforcement scheduling is not enabled on this Supabase project. Run supabase/migrations/20261016140000_combat_reinforcements.sql in the Supabase SQL Editor.'
        : `Online lobby could not be created: ${error.message}`,
    );
  }
  const created = data as { lobby_id?: unknown; join_code?: unknown } | null;
  if (
    !created ||
    typeof created.lobby_id !== 'string' ||
    typeof created.join_code !== 'string'
  ) {
    throw new Error('Supabase created the lobby but returned an invalid response.');
  }

  const { error: backgroundError } = await supabase.rpc('set_combat_lobby_background', {
    p_lobby_id: created.lobby_id,
    p_background_id: backgroundId,
  });
  if (backgroundError) {
    const migrationMissing =
      backgroundError.code === 'PGRST202' ||
      /could not find the function|schema cache/i.test(backgroundError.message);
    throw new Error(
      migrationMissing
        ? 'Combat backgrounds are not enabled on this Supabase project. Run supabase/migrations/20261016020000_start_shared_combat.sql in the Supabase SQL Editor.'
        : `Combat background could not be saved: ${backgroundError.message}`,
    );
  }
  const snapshot = await loadOnlineLobbySnapshot(identity, created.lobby_id);
  await rememberOnlineLobby(identity, created.lobby_id);
  await AsyncStorage.setItem(
    `${LOBBY_SIGNATURE_KEY_PREFIX}${created.lobby_id}`,
    getEncounterSignature(encounter, characters, allies, backgroundId),
  );
  return snapshot;
}

const LOBBY_SIGNATURE_KEY_PREFIX = 'dnd-initiative-tracker.online-lobby-signature.v1.';

function getEncounterSignature(
  encounter: CampaignEncounter,
  characters: CampaignCharacter[],
  allies: NonNullable<CampaignEncounter['allies']>,
  backgroundId: CampaignEncounterBackgroundId | null,
): string {
  const text = JSON.stringify({
    name: encounter.name,
    enemies: encounter.enemies,
    allies,
    backgroundId,
    characters: characters
      .filter((character) => (character.status ?? 'active') === 'active')
      .map((character) => [
        character.id,
        character.name,
        character.initiative,
        character.armorClass,
        character.portraitPresetId,
        character.portraitUri,
      ]),
  });
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0;
  }
  return `${text.length}:${hash}`;
}

// A lobby built before the encounter was edited no longer matches it.
export async function isLobbyCurrentForEncounter(
  lobbyId: string,
  encounter: CampaignEncounter,
  characters: CampaignCharacter[],
  allies: NonNullable<CampaignEncounter['allies']> = [],
  backgroundId: CampaignEncounterBackgroundId | null = null,
): Promise<boolean> {
  const stored = await AsyncStorage.getItem(`${LOBBY_SIGNATURE_KEY_PREFIX}${lobbyId}`);
  return stored === getEncounterSignature(encounter, characters, allies, backgroundId);
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

export async function leaveOnlineCombatLobby(
  identity: SupabaseIdentity,
  lobbyId: string,
): Promise<void> {
  requireIdentity(identity);
  const { error } = await getSupabaseClient().rpc('leave_combat_lobby', {
    p_lobby_id: lobbyId,
  });
  if (error) {
    const migrationMissing =
      error.code === 'PGRST202' ||
      /could not find the function|schema cache/i.test(error.message);
    throw new Error(
      migrationMissing
        ? 'Leaving a shared lobby is not enabled on this Supabase project. Run supabase/migrations/20261016040000_player_leave_lobby.sql in the Supabase SQL Editor.'
        : `Lobby could not be left: ${error.message}`,
    );
  }

  const lastLobbyKey = `${LAST_LOBBY_KEY_PREFIX}${identity.userId}`;
  if ((await AsyncStorage.getItem(lastLobbyKey)) === lobbyId) {
    await AsyncStorage.removeItem(lastLobbyKey);
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
  if (error) {
    const migrationMissing =
      error.code === 'PGRST202' ||
      /could not find the function|schema cache/i.test(error.message);
    const initiativeAliasMigrationMissing =
      /missing from-clause entry for table "m"/i.test(error.message);
    throw new Error(
      migrationMissing
        ? 'Party initiative is not enabled on this Supabase project. Run supabase/migrations/20261016010000_shared_initiative.sql in the Supabase SQL Editor, then reopen the lobby.'
        : initiativeAliasMigrationMissing
          ? 'Player initiative needs a database fix. Run supabase/migrations/20261016050000_fix_player_initiative_member_alias.sql in the Supabase SQL Editor, then try again.'
        : `Initiative could not be submitted: ${error.message}`,
    );
  }
}

export async function rollPlayerInitiative(
  identity: SupabaseIdentity,
  lobbyId: string,
): Promise<void> {
  await submitPlayerInitiative(identity, lobbyId, null);
}

export async function submitDmPartyInitiative(
  identity: SupabaseIdentity,
  lobbyId: string,
  characterId: string,
  rawRoll: number,
): Promise<void> {
  requireIdentity(identity);
  if (!Number.isInteger(rawRoll) || rawRoll < 1 || rawRoll > 20) {
    throw new Error('A d20 result must be a whole number from 1 through 20.');
  }
  const { error } = await getSupabaseClient().rpc('submit_dm_party_combat_initiative', {
    p_lobby_id: lobbyId,
    p_character_id: characterId,
    p_raw_roll: rawRoll,
  });
  if (error) {
    const migrationMissing =
      error.code === 'PGRST202' ||
      /could not find the function|schema cache/i.test(error.message);
    throw new Error(
      migrationMissing
        ? 'DM party initiative entry needs a database update. Run supabase/migrations/20261016123000_dm_party_manual_initiative.sql in the Supabase SQL Editor, then reopen the lobby.'
        : `Party initiative could not be saved: ${error.message}`,
    );
  }
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

export async function startOnlineCombat(
  identity: SupabaseIdentity,
  lobbyId: string,
): Promise<void> {
  requireIdentity(identity);
  const { error } = await getSupabaseClient().rpc('start_combat_lobby', {
    p_lobby_id: lobbyId,
  });
  if (error) {
    const migrationMissing =
      error.code === 'PGRST202' ||
      /could not find the function|schema cache/i.test(error.message);
    throw new Error(
      migrationMissing
        ? 'Shared combat start is not enabled on this Supabase project. Run supabase/migrations/20261016020000_start_shared_combat.sql and supabase/migrations/20261016130000_fix_dm_party_roll_combat_start.sql in the Supabase SQL Editor.'
        : `Combat could not be started: ${error.message}`,
    );
  }
}

export async function setOnlineParticipantHp(
  identity: SupabaseIdentity,
  lobbyId: string,
  participantId: string,
  currentHp: number,
): Promise<void> {
  requireIdentity(identity);
  const { error } = await getSupabaseClient().rpc('set_combat_participant_hp', {
    p_lobby_id: lobbyId,
    p_participant_id: participantId,
    p_current_hp: Math.max(0, Math.round(currentHp)),
  });
  if (error) {
    const migrationMissing =
      error.code === 'PGRST202' ||
      /could not find the function|schema cache/i.test(error.message);
    throw new Error(
      migrationMissing
        ? 'Enemy hit points are not enabled on this Supabase project. Run supabase/migrations/20261016190000_enemy_hit_points.sql in the Supabase SQL Editor.'
        : `Hit points could not be saved: ${error.message}`,
    );
  }
}

export async function reviveOnlineParticipant(
  identity: SupabaseIdentity,
  lobbyId: string,
  participantId: string,
  hp: number,
): Promise<void> {
  requireIdentity(identity);
  const { error } = await getSupabaseClient().rpc('revive_combat_participant', {
    p_lobby_id: lobbyId,
    p_participant_id: participantId,
    p_hp: hp,
  });
  if (error) {
    const migrationMissing =
      error.code === 'PGRST202' ||
      /could not find the function|schema cache/i.test(error.message);
    throw new Error(
      migrationMissing
        ? 'Reviving is not enabled on this Supabase project. Run supabase/migrations/20261016210000_defeated_in_initiative.sql in the Supabase SQL Editor.'
        : `Combatant could not be revived: ${error.message}`,
    );
  }
}

export async function activateOnlineCombatReinforcement(
  identity: SupabaseIdentity,
  lobbyId: string,
  initiativeKey: string,
): Promise<void> {
  requireIdentity(identity);
  const { error } = await getSupabaseClient().rpc(
    'activate_combat_lobby_reinforcement',
    {
      p_lobby_id: lobbyId,
      p_initiative_key: initiativeKey,
    },
  );
  if (error) {
    const migrationMissing =
      error.code === 'PGRST202' ||
      /could not find the function|schema cache/i.test(error.message);
    throw new Error(
      migrationMissing
        ? 'Reinforcement activation is not enabled on this Supabase project. Run supabase/migrations/20261016140000_combat_reinforcements.sql in the Supabase SQL Editor.'
        : `Reinforcement could not be activated: ${error.message}`,
    );
  }
}

export async function advanceOnlineCombatTurn(
  identity: SupabaseIdentity,
  lobbyId: string,
): Promise<void> {
  requireIdentity(identity);
  const { error } = await getSupabaseClient().rpc('advance_combat_lobby_turn', {
    p_lobby_id: lobbyId,
  });
  if (error) {
    const migrationMissing =
      error.code === 'PGRST202' ||
      /could not find the function|schema cache/i.test(error.message);
    throw new Error(
      migrationMissing
        ? 'Turn-by-turn online combat is not enabled on this Supabase project. Run supabase/migrations/20261016170000_combat_turns.sql in the Supabase SQL Editor.'
        : `Combat turn could not be advanced: ${error.message}`,
    );
  }
}

export async function joinOnlineCombatLobby(
  identity: SupabaseIdentity,
  joinCode: string,
  displayName: string,
  options: { remember?: boolean } = {},
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
  if (options.remember !== false) await rememberOnlineLobby(identity, data);
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
  const snapshot = parseSnapshot(data);
  if (!snapshot.combat_started) {
    return { ...snapshot, visible_combatants: [] };
  }
  const { data: visibleData, error: visibleError } = await getSupabaseClient().rpc(
    'get_visible_combat_lobby_participants',
    { p_lobby_id: lobbyId },
  );
  if (visibleError) {
    const migrationMissing =
      visibleError.code === 'PGRST202' ||
      /could not find the function|schema cache/i.test(visibleError.message);
    throw new Error(
      migrationMissing
        ? 'Shared combat visibility is not enabled on this Supabase project. Run supabase/migrations/20261016020000_start_shared_combat.sql in the Supabase SQL Editor.'
        : `Visible combat participants could not be loaded: ${visibleError.message}`,
    );
  }
  if (!Array.isArray(visibleData)) {
    throw new Error('Supabase returned an invalid visible combatant list.');
  }
  return parseSnapshot({ ...snapshot, visible_combatants: visibleData });
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
