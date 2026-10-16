import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

export type Campaign = {
  id: string;
  name: string;
  createdAt: string;
  favorite: boolean;
  coverId?: string | null;
  coverUri?: string | null;
  characters?: CampaignCharacter[];
  encounters?: CampaignEncounter[];
  customEnemyPresets?: CampaignCustomEnemyPreset[];
  combat?: CampaignCombat | null;
  combatHistory?: CampaignCombatHistory[];
};

export type CampaignCustomEnemyPreset = {
  id: string;
  name: string;
  initiative: number;
  imageUri: string;
};

export type CampaignCharacter = {
  id: string;
  name: string;
  className: string;
  race?: string;
  initiative: number;
  portraitUri?: string | null;
  portraitPresetId?: string;
  status?: 'active' | 'stored' | 'dead';
};

export type CampaignCombat = {
  startedAt: string;
  round: number;
  currentCharacterId: string;
  participantIds?: string[];
  encounterId?: string;
  characters?: CampaignCombatCharacter[];
  enemies?: CampaignCombatEnemy[];
  allies?: CampaignCombatAlly[];
};

export type CampaignInitiativeResult = {
  rawRoll: number;
  bonus: number;
  total: number;
};

export type CampaignCombatCharacter = {
  id: string;
  name: string;
  initiative: number;
  initiativeRoll: number;
  initiativeBonus: number;
  initiativeTotal: number;
};

export type CampaignCombatAlly = {
  id: string;
  name: string;
  className: string;
  race?: string;
  initiative: number;
  portraitUri?: string | null;
  portraitPresetId?: string;
  maxHp?: number;
  currentHp?: number;
  initiativeRoll?: number;
  initiativeBonus?: number;
  initiativeTotal?: number;
};

export type CampaignCombatEnemy = {
  id: string;
  name: string;
  initiative: number;
  imageId?: string;
  quantity?: number;
  initiativeMode?: 'individual' | 'horde';
  isHidden?: boolean;
  arrivalRound?: number;
  status?: 'waiting' | 'active' | 'scheduled' | 'defeated' | 'inactive';
  maxHp?: number;
  currentHp?: number;
  initiativeRoll?: number;
  initiativeBonus?: number;
  initiativeTotal?: number;
};

type CampaignCombatant = CampaignCombatEnemy | CampaignCombatAlly;

export function calculateCampaignInitiative(
  rawRoll: number,
  bonus: number,
): CampaignInitiativeResult {
  if (!Number.isInteger(rawRoll) || rawRoll < 1 || rawRoll > 20) {
    throw new Error('A d20 result must be a whole number from 1 through 20.');
  }
  if (!Number.isInteger(bonus)) {
    throw new Error('Initiative bonus must be a whole number.');
  }
  return { rawRoll, bonus, total: rawRoll + bonus };
}

export function getCampaignInitiativeKey(
  participantType: 'character' | 'ally' | 'enemy',
  participantId: string,
  memberIndex?: number,
  horde = false,
): string {
  if (participantType === 'enemy') {
    return horde
      ? `enemy:${participantId}:horde`
      : `enemy:${participantId}:${memberIndex ?? 0}`;
  }
  return `${participantType}:${participantId}`;
}

export type CampaignEncounterEnemyInput = {
  name: string;
  initiative: number;
  imageId: string;
  imageUri?: string;
  quantity: number;
  initiativeMode: 'individual' | 'horde';
  isHidden?: boolean;
  arrivalRound?: number;
  status?: 'waiting' | 'active' | 'scheduled' | 'defeated' | 'inactive';
  maxHp: number;
};

export type CampaignEncounter = {
  id: string;
  name: string;
  enemies: CampaignCombatEnemy[];
  allies?: CampaignCombatAlly[];
  initiativeResults?: Record<string, CampaignInitiativeResult>;
  status: 'draft' | 'ready' | 'in-progress';
};

export type CampaignCombatHistory = {
  startedAt: string;
  endedAt: string;
  rounds: number;
  participants: string[];
};

const CAMPAIGNS_STORAGE_KEY = 'dnd-initiative-tracker.campaigns.v1';

function isCampaign(value: unknown): value is Campaign {
  if (typeof value !== 'object' || value === null) return false;
  const campaign = value as Record<string, unknown>;
  return (
    typeof campaign.id === 'string' &&
    typeof campaign.name === 'string' &&
    typeof campaign.createdAt === 'string' &&
    (campaign.favorite === undefined || typeof campaign.favorite === 'boolean') &&
    (campaign.coverId === undefined ||
      campaign.coverId === null ||
      typeof campaign.coverId === 'string') &&
    (campaign.coverUri === undefined ||
      campaign.coverUri === null ||
      typeof campaign.coverUri === 'string') &&
    (campaign.characters === undefined ||
      (Array.isArray(campaign.characters) && campaign.characters.every(isCampaignCharacter))) &&
    (campaign.encounters === undefined ||
      (Array.isArray(campaign.encounters) &&
        campaign.encounters.every(isCampaignEncounter))) &&
    (campaign.customEnemyPresets === undefined ||
      (Array.isArray(campaign.customEnemyPresets) &&
        campaign.customEnemyPresets.every(isCampaignCustomEnemyPreset))) &&
    (campaign.combat === undefined ||
      campaign.combat === null ||
      isCampaignCombat(campaign.combat)) &&
    (campaign.combatHistory === undefined ||
      (Array.isArray(campaign.combatHistory) &&
        campaign.combatHistory.every(isCampaignCombatHistory)))
  );
}

function isCampaignCustomEnemyPreset(value: unknown): value is CampaignCustomEnemyPreset {
  if (typeof value !== 'object' || value === null) return false;
  const preset = value as Record<string, unknown>;
  return (
    typeof preset.id === 'string' &&
    preset.id.startsWith('custom-') &&
    typeof preset.name === 'string' &&
    preset.name.trim().length > 0 &&
    typeof preset.imageUri === 'string' &&
    preset.imageUri.length > 0 &&
    typeof preset.initiative === 'number' &&
    Number.isInteger(preset.initiative) &&
    preset.initiative >= -20 &&
    preset.initiative <= 30
  );
}

function isCampaignCharacter(value: unknown): value is CampaignCharacter {
  if (typeof value !== 'object' || value === null) return false;
  const character = value as Record<string, unknown>;
  return (
    typeof character.id === 'string' &&
    typeof character.name === 'string' &&
    typeof character.className === 'string' &&
    (character.race === undefined || typeof character.race === 'string') &&
    typeof character.initiative === 'number' &&
    Number.isFinite(character.initiative) &&
    (character.portraitUri === undefined ||
      character.portraitUri === null ||
      typeof character.portraitUri === 'string') &&
    (character.portraitPresetId === undefined ||
      typeof character.portraitPresetId === 'string') &&
    (character.status === undefined ||
      character.status === 'active' ||
      character.status === 'stored' ||
      character.status === 'dead')
  );
}

function isCampaignEncounter(value: unknown): value is CampaignEncounter {
  if (typeof value !== 'object' || value === null) return false;
  const encounter = value as Record<string, unknown>;
  return (
    typeof encounter.id === 'string' &&
    typeof encounter.name === 'string' &&
    Array.isArray(encounter.enemies) &&
    encounter.enemies.every(isCampaignCombatEnemy) &&
    (encounter.allies === undefined ||
      (Array.isArray(encounter.allies) && encounter.allies.every(isCampaignCombatAlly))) &&
    (encounter.initiativeResults === undefined ||
      (typeof encounter.initiativeResults === 'object' &&
        encounter.initiativeResults !== null &&
        Object.values(encounter.initiativeResults).every(isCampaignInitiativeResult))) &&
    (encounter.status === 'draft' ||
      encounter.status === 'ready' ||
      encounter.status === 'in-progress')
  );
}

function isCampaignInitiativeResult(value: unknown): value is CampaignInitiativeResult {
  if (typeof value !== 'object' || value === null) return false;
  const result = value as Record<string, unknown>;
  return (
    typeof result.rawRoll === 'number' &&
    Number.isInteger(result.rawRoll) &&
    result.rawRoll >= 1 &&
    result.rawRoll <= 20 &&
    typeof result.bonus === 'number' &&
    Number.isInteger(result.bonus) &&
    typeof result.total === 'number' &&
    Number.isInteger(result.total) &&
    result.total === result.rawRoll + result.bonus
  );
}

function isCampaignCombatEnemy(value: unknown): value is CampaignCombatEnemy {
  if (typeof value !== 'object' || value === null) return false;
  const enemy = value as Record<string, unknown>;
  return (
    typeof enemy.id === 'string' &&
    typeof enemy.name === 'string' &&
    typeof enemy.initiative === 'number' &&
    Number.isFinite(enemy.initiative) &&
    (enemy.imageId === undefined || typeof enemy.imageId === 'string') &&
    (enemy.quantity === undefined ||
      (typeof enemy.quantity === 'number' &&
        Number.isInteger(enemy.quantity) &&
        enemy.quantity >= 1 &&
        enemy.quantity <= 99)) &&
    (enemy.initiativeMode === undefined ||
      enemy.initiativeMode === 'individual' ||
      enemy.initiativeMode === 'horde') &&
    (enemy.isHidden === undefined || typeof enemy.isHidden === 'boolean') &&
    (enemy.arrivalRound === undefined ||
      (typeof enemy.arrivalRound === 'number' &&
        Number.isInteger(enemy.arrivalRound) &&
        enemy.arrivalRound >= 1)) &&
    (enemy.status === undefined ||
      enemy.status === 'waiting' ||
      enemy.status === 'active' ||
      enemy.status === 'scheduled' ||
      enemy.status === 'defeated' ||
      enemy.status === 'inactive') &&
    (enemy.maxHp === undefined ||
      (typeof enemy.maxHp === 'number' &&
        Number.isInteger(enemy.maxHp) &&
        enemy.maxHp >= 1 &&
      enemy.maxHp <= 9999 * 99)) &&
    (enemy.currentHp === undefined ||
      (typeof enemy.currentHp === 'number' &&
        Number.isInteger(enemy.currentHp) &&
        enemy.currentHp >= 0 &&
        (enemy.maxHp === undefined || enemy.currentHp <= enemy.maxHp))) &&
    (enemy.initiativeRoll === undefined ||
      (typeof enemy.initiativeRoll === 'number' &&
        Number.isInteger(enemy.initiativeRoll) &&
        enemy.initiativeRoll >= 1 &&
        enemy.initiativeRoll <= 20)) &&
    (enemy.initiativeBonus === undefined ||
      (typeof enemy.initiativeBonus === 'number' && Number.isInteger(enemy.initiativeBonus))) &&
    (enemy.initiativeTotal === undefined ||
      (typeof enemy.initiativeTotal === 'number' &&
        Number.isInteger(enemy.initiativeTotal) &&
        (enemy.initiativeRoll === undefined ||
          enemy.initiativeBonus === undefined ||
          enemy.initiativeTotal === enemy.initiativeRoll + enemy.initiativeBonus)))
  );
}

function isCampaignCombat(value: unknown): value is CampaignCombat {
  if (typeof value !== 'object' || value === null) return false;
  const combat = value as Record<string, unknown>;
  return (
    typeof combat.startedAt === 'string' &&
    typeof combat.round === 'number' &&
    Number.isInteger(combat.round) &&
    combat.round > 0 &&
    typeof combat.currentCharacterId === 'string' &&
    (combat.participantIds === undefined ||
      (Array.isArray(combat.participantIds) &&
        combat.participantIds.every((participantId) => typeof participantId === 'string'))) &&
    (combat.encounterId === undefined || typeof combat.encounterId === 'string') &&
    (combat.enemies === undefined ||
      (Array.isArray(combat.enemies) && combat.enemies.every(isCampaignCombatEnemy))) &&
    (combat.characters === undefined ||
      (Array.isArray(combat.characters) && combat.characters.every(isCampaignCombatCharacter))) &&
    (combat.allies === undefined ||
      (Array.isArray(combat.allies) && combat.allies.every(isCampaignCombatAlly)))
  );
}

function isCampaignCombatCharacter(value: unknown): value is CampaignCombatCharacter {
  if (typeof value !== 'object' || value === null) return false;
  const character = value as Record<string, unknown>;
  return (
    typeof character.id === 'string' &&
    typeof character.name === 'string' &&
    typeof character.initiative === 'number' &&
    Number.isInteger(character.initiative) &&
    typeof character.initiativeRoll === 'number' &&
    Number.isInteger(character.initiativeRoll) &&
    character.initiativeRoll >= 1 &&
    character.initiativeRoll <= 20 &&
    typeof character.initiativeBonus === 'number' &&
    Number.isInteger(character.initiativeBonus) &&
    typeof character.initiativeTotal === 'number' &&
    Number.isInteger(character.initiativeTotal) &&
    character.initiativeRoll === character.initiativeTotal - character.initiativeBonus &&
    character.initiative === character.initiativeTotal
  );
}

function isCampaignCombatAlly(value: unknown): value is CampaignCombatAlly {
  if (typeof value !== 'object' || value === null) return false;
  const ally = value as Record<string, unknown>;
  return (
    typeof ally.id === 'string' &&
    ally.id.startsWith('combat-ally-') &&
    typeof ally.name === 'string' &&
    ally.name.trim().length > 0 &&
    typeof ally.className === 'string' &&
    ally.className.trim().length > 0 &&
    (ally.race === undefined || typeof ally.race === 'string') &&
    typeof ally.initiative === 'number' &&
    Number.isInteger(ally.initiative) &&
    (ally.initiativeTotal === undefined
      ? ally.initiative >= -4 && ally.initiative <= 10
      : ally.initiative === ally.initiativeTotal &&
        typeof ally.initiativeBonus === 'number' &&
        ally.initiativeBonus >= -4 &&
        ally.initiativeBonus <= 10) &&
    (ally.portraitUri === undefined ||
      ally.portraitUri === null ||
      typeof ally.portraitUri === 'string') &&
    (ally.portraitPresetId === undefined ||
      typeof ally.portraitPresetId === 'string') &&
    (ally.maxHp === undefined ||
      (typeof ally.maxHp === 'number' &&
        Number.isInteger(ally.maxHp) &&
        ally.maxHp >= 1 &&
        ally.maxHp <= 9999)) &&
    (ally.currentHp === undefined ||
      (typeof ally.currentHp === 'number' &&
        Number.isInteger(ally.currentHp) &&
        ally.currentHp >= 0 &&
        (ally.maxHp === undefined || ally.currentHp <= ally.maxHp))) &&
    (ally.initiativeRoll === undefined ||
      (typeof ally.initiativeRoll === 'number' &&
        Number.isInteger(ally.initiativeRoll) &&
        ally.initiativeRoll >= 1 &&
        ally.initiativeRoll <= 20)) &&
    (ally.initiativeBonus === undefined ||
      (typeof ally.initiativeBonus === 'number' && Number.isInteger(ally.initiativeBonus))) &&
    (ally.initiativeTotal === undefined ||
      (typeof ally.initiativeTotal === 'number' &&
        Number.isInteger(ally.initiativeTotal) &&
        (ally.initiativeRoll === undefined ||
          ally.initiativeBonus === undefined ||
          ally.initiativeTotal === ally.initiativeRoll + ally.initiativeBonus)))
  );
}

function isCampaignCombatHistory(value: unknown): value is CampaignCombatHistory {
  if (typeof value !== 'object' || value === null) return false;
  const history = value as Record<string, unknown>;
  return (
    typeof history.startedAt === 'string' &&
    typeof history.endedAt === 'string' &&
    typeof history.rounds === 'number' &&
    Number.isInteger(history.rounds) &&
    history.rounds > 0 &&
    Array.isArray(history.participants) &&
    history.participants.every((participant) => typeof participant === 'string')
  );
}

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function getActiveCharacters(characters: CampaignCharacter[]): CampaignCharacter[] {
  return [...characters]
    .filter((character) => (character.status ?? 'active') === 'active')
    .sort((left, right) => right.initiative - left.initiative);
}

function getCombatOrder(campaign: Campaign): CampaignCombatant[] {
  const combat = campaign.combat;
  if (!combat) return [];
  const participantIds = combat.participantIds
    ? new Set(combat.participantIds)
    : null;
  const combatCharacters = new Map(
    (combat.characters ?? []).map((character) => [character.id, character]),
  );
  const characters = (campaign.characters ?? [])
    .filter(
      (character) =>
        (character.status ?? 'active') === 'active' &&
        (!participantIds || participantIds.has(character.id)),
    )
    .map((character) => combatCharacters.get(character.id) ?? {
      id: character.id,
      name: character.name,
      initiative: character.initiative,
    });
  return [...characters, ...(combat.allies ?? []), ...(combat.enemies ?? [])].sort(
    (left, right) => right.initiative - left.initiative,
  );
}

async function saveCampaigns(campaigns: Campaign[]) {
  await AsyncStorage.setItem(CAMPAIGNS_STORAGE_KEY, JSON.stringify(campaigns));
}

export async function loadCampaigns(): Promise<Campaign[]> {
  const savedCampaigns = await AsyncStorage.getItem(CAMPAIGNS_STORAGE_KEY);
  if (savedCampaigns === null) return [];

  let parsedCampaigns: unknown;
  try {
    parsedCampaigns = JSON.parse(savedCampaigns);
  } catch {
    throw new Error('Saved campaigns could not be read. Your stored data was not changed.');
  }

  if (!Array.isArray(parsedCampaigns) || !parsedCampaigns.every(isCampaign)) {
    throw new Error('Saved campaigns have an invalid format. Your stored data was not changed.');
  }

  return parsedCampaigns.map((campaign) => ({
    ...campaign,
    favorite: campaign.favorite ?? false,
    characters: campaign.characters ?? [],
    encounters: campaign.encounters ?? [],
    customEnemyPresets: campaign.customEnemyPresets ?? [],
    combat: campaign.combat ?? null,
    combatHistory: campaign.combatHistory ?? [],
  }));
}

async function persistImage(uri: string, directoryName: string, fileName: string): Promise<string> {
  if (Platform.OS === 'web') {
    if (!uri.startsWith('data:image/')) {
      throw new Error('The selected photo could not be saved. Please choose it again.');
    }
    if (uri.length > 2_000_000) {
      throw new Error(
        'That photo is too large to save in browser storage. Please choose a smaller photo or a built-in cover.',
      );
    }
    return uri;
  }

  const directory = new Directory(Paths.document, directoryName);
  directory.create({ intermediates: true, idempotent: true });
  const savedImage = new File(directory, fileName);
  await new File(uri).copy(savedImage);
  return savedImage.uri;
}

export async function createCampaign(
  name: string,
  cover: { coverId?: string | null; imageUri?: string | null } = {},
): Promise<Campaign> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Enter a campaign name.');

  const id = createId();
  const coverUri = cover.imageUri
    ? await persistImage(cover.imageUri, 'campaign-covers', `${id}.jpg`)
    : null;
  const campaign: Campaign = {
    id,
    name: trimmedName,
    createdAt: new Date().toISOString(),
    favorite: false,
    coverId: coverUri ? null : cover.coverId ?? null,
    coverUri,
    characters: [],
    encounters: [],
    customEnemyPresets: [],
    combat: null,
    combatHistory: [],
  };
  const campaigns = await loadCampaigns();
  try {
    await saveCampaigns([...campaigns, campaign]);
  } catch (error) {
    if (coverUri && Platform.OS !== 'web') {
      new File(coverUri).delete();
    }
    throw error;
  }

  return campaign;
}

export async function setCampaignFavorite(id: string, favorite: boolean): Promise<Campaign[]> {
  const campaigns = await loadCampaigns();
  if (!campaigns.some((campaign) => campaign.id === id)) {
    throw new Error('That campaign could not be found.');
  }

  const updatedCampaigns = campaigns.map((campaign) =>
    campaign.id === id ? { ...campaign, favorite } : campaign,
  );
  await saveCampaigns(updatedCampaigns);
  return updatedCampaigns;
}

export async function deleteCampaign(id: string): Promise<Campaign[]> {
  const campaigns = await loadCampaigns();
  if (!campaigns.some((campaign) => campaign.id === id)) {
    throw new Error('That campaign could not be found.');
  }

  const remainingCampaigns = campaigns.filter((campaign) => campaign.id !== id);
  await saveCampaigns(remainingCampaigns);
  return remainingCampaigns;
}

export async function deleteCampaignEncounter(
  campaignId: string,
  encounterId: string,
): Promise<Campaign> {
  const campaigns = await loadCampaigns();
  const campaign = campaigns.find((item) => item.id === campaignId);
  if (!campaign) throw new Error('That campaign could not be found.');
  const encounter = (campaign.encounters ?? []).find((item) => item.id === encounterId);
  if (!encounter) throw new Error('That encounter could not be found.');
  if (campaign.combat?.encounterId === encounterId) {
    throw new Error('End this combat before deleting its encounter.');
  }

  const updatedCampaign: Campaign = {
    ...campaign,
    encounters: (campaign.encounters ?? []).filter((item) => item.id !== encounterId),
  };
  await saveCampaigns(
    campaigns.map((item) => (item.id === campaignId ? updatedCampaign : item)),
  );

  if (Platform.OS !== 'web') {
    for (const ally of encounter.allies ?? []) {
      if (ally.portraitUri) new File(ally.portraitUri).delete();
    }
  }
  return updatedCampaign;
}

export async function addCampaignCharacter(
  campaignId: string,
  details: Omit<CampaignCharacter, 'id' | 'portraitUri'> & { portraitUri?: string | null },
): Promise<Campaign> {
  const name = details.name.trim();
  const className = details.className.trim();
  if (!name) throw new Error('Enter a character name.');
  if (!className) throw new Error('Enter a class or role.');
  if (!Number.isFinite(details.initiative)) {
    throw new Error('Initiative must be a valid number.');
  }

  const campaigns = await loadCampaigns();
  const campaign = campaigns.find((item) => item.id === campaignId);
  if (!campaign) throw new Error('That campaign could not be found.');

  const id = createId();
  const portraitUri = details.portraitUri
    ? await persistImage(
        details.portraitUri,
        'campaign-character-portraits',
        `${campaignId}-${id}.jpg`,
      )
    : null;
  const updatedCampaign: Campaign = {
    ...campaign,
    characters: [
      ...(campaign.characters ?? []),
      {
        ...details,
        id,
        name,
        className,
        portraitUri,
        status: 'active',
      },
    ],
  };
  try {
    await saveCampaigns(
      campaigns.map((item) => (item.id === campaignId ? updatedCampaign : item)),
    );
  } catch (error) {
    if (portraitUri && Platform.OS !== 'web') {
      new File(portraitUri).delete();
    }
    throw error;
  }
  return updatedCampaign;
}

export async function saveCampaignEncounter(
  campaignId: string,
  encounterId: string | null,
  name: string,
  enemyInputs: CampaignEncounterEnemyInput[],
  status: 'draft' | 'ready',
  allyInputs: CampaignCombatAlly[] = [],
): Promise<Campaign> {
  const trimmedName = name.trim();
  const enemies = enemyInputs
    .map((enemy) => ({ ...enemy, name: enemy.name.trim() }))
    .filter((enemy) => enemy.name);
  if (!trimmedName) throw new Error('Enter an encounter name.');
  if (
    enemies.some(
      (enemy) =>
        !Number.isInteger(enemy.quantity) ||
        enemy.quantity < 1 ||
        enemy.quantity > 99 ||
        !Number.isInteger(enemy.initiative) ||
        enemy.initiative < -20 ||
        enemy.initiative > 30 ||
        (enemy.initiativeMode !== 'individual' && enemy.initiativeMode !== 'horde') ||
        !Number.isInteger(enemy.maxHp) ||
        enemy.maxHp < 1 ||
        enemy.maxHp > 9999 ||
        !enemy.imageId,
    )
  ) {
    throw new Error('Check each enemy’s image, quantity, initiative bonus, and HP.');
  }
  if (
    allyInputs.some(
      (ally) =>
        !ally.id.startsWith('combat-ally-') ||
        !ally.name.trim() ||
        !ally.className.trim() ||
        !Number.isInteger(ally.initiative) ||
        ally.initiative < -4 ||
        ally.initiative > 10 ||
        !Number.isInteger(ally.maxHp) ||
        (ally.maxHp ?? 0) < 1 ||
        (ally.maxHp ?? 0) > 9999,
    )
  ) {
    throw new Error('Check each ally’s name, class, initiative modifier, and HP.');
  }

  const campaigns = await loadCampaigns();
  const campaign = campaigns.find((item) => item.id === campaignId);
  if (!campaign) throw new Error('That campaign could not be found.');
  if (
    status === 'ready' &&
    enemies.length === 0 &&
    allyInputs.length === 0 &&
    !(campaign.characters ?? []).some((character) => (character.status ?? 'active') === 'active')
  ) {
    throw new Error('Add an active party member, enemy, or temporary ally before marking the encounter ready.');
  }
  const encounters = campaign.encounters ?? [];
  const existing = encounterId
    ? encounters.find((encounter) => encounter.id === encounterId)
    : undefined;
  if (encounterId && !existing) throw new Error('That encounter could not be found.');
  if (campaign.combat?.encounterId === encounterId && encounterId) {
    throw new Error('End this encounter combat before editing it.');
  }

  const id = existing?.id ?? createId();
  const savedEnemies = enemies.map((enemy, index) => ({
    id: existing?.enemies[index]?.id ?? createId(),
    name: enemy.name,
    initiative: enemy.initiative,
    imageId: enemy.imageId,
    quantity: enemy.quantity,
    initiativeMode: enemy.initiativeMode,
    maxHp: enemy.maxHp,
  }));
  const existingAllies = existing?.allies ?? [];
  const newlyPersistedPortraits: string[] = [];
  const savedAllies = await Promise.all(
    allyInputs.map(async (ally) => {
      const oldAlly = existingAllies.find((item) => item.id === ally.id);
      const portraitUri =
        !ally.portraitUri || oldAlly?.portraitUri === ally.portraitUri
          ? ally.portraitUri ?? null
          : await persistImage(
              ally.portraitUri,
              'campaign-combat-allies',
              `${campaignId}-${ally.id}-${createId()}.jpg`,
            );
      if (portraitUri && portraitUri !== ally.portraitUri) {
        newlyPersistedPortraits.push(portraitUri);
      }
      return {
        ...ally,
        name: ally.name.trim(),
        className: ally.className.trim(),
        ...(ally.race?.trim() ? { race: ally.race.trim() } : { race: undefined }),
        portraitUri,
        maxHp: ally.maxHp,
        currentHp: undefined,
      };
    }),
  );
  const initiativeBonuses: Record<string, number> = {};
  for (const character of campaign.characters ?? []) {
    if ((character.status ?? 'active') === 'active') {
      initiativeBonuses[getCampaignInitiativeKey('character', character.id)] =
        character.initiative;
    }
  }
  for (const ally of savedAllies) {
    initiativeBonuses[getCampaignInitiativeKey('ally', ally.id)] = ally.initiative;
  }
  for (const enemy of savedEnemies) {
    if (enemy.initiativeMode === 'horde' && (enemy.quantity ?? 1) > 1) {
      initiativeBonuses[getCampaignInitiativeKey('enemy', enemy.id, undefined, true)] =
        enemy.initiative;
    } else {
      for (let index = 0; index < (enemy.quantity ?? 1); index += 1) {
        initiativeBonuses[getCampaignInitiativeKey('enemy', enemy.id, index)] =
          enemy.initiative;
      }
    }
  }
  const initiativeResults = Object.fromEntries(
    Object.entries(existing?.initiativeResults ?? {}).filter(
      ([participantId, result]) => initiativeBonuses[participantId] === result.bonus,
    ),
  );
  const updatedEncounter: CampaignEncounter = {
    id,
    name: trimmedName,
    enemies: savedEnemies,
    allies: savedAllies,
    initiativeResults,
    status,
  };
  const updatedEncounters = existing
    ? encounters.map((encounter) => (encounter.id === id ? updatedEncounter : encounter))
    : [...encounters, updatedEncounter];
  const updatedCampaign = { ...campaign, encounters: updatedEncounters };
  try {
    await saveCampaigns(
      campaigns.map((item) => (item.id === campaignId ? updatedCampaign : item)),
    );
  } catch (error) {
    if (Platform.OS !== 'web') {
      for (const portraitUri of newlyPersistedPortraits) new File(portraitUri).delete();
    }
    throw error;
  }
  if (Platform.OS !== 'web') {
    const retainedPortraits = new Set(
      savedAllies.flatMap((ally) => (ally.portraitUri ? [ally.portraitUri] : [])),
    );
    for (const ally of existingAllies) {
      if (ally.portraitUri && !retainedPortraits.has(ally.portraitUri)) {
        new File(ally.portraitUri).delete();
      }
    }
  }
  return updatedCampaign;
}

async function updateCampaignEncounterInitiative(
  campaignId: string,
  encounterId: string,
  participantId: string,
  rawRoll: number | null,
): Promise<Campaign> {
  if (pendingInitiativeCampaigns.has(campaignId)) {
    throw new Error('Another initiative update is still being saved. Please try again.');
  }
  pendingInitiativeCampaigns.add(campaignId);
  try {
    return await persistCampaignEncounterInitiative(
      campaignId,
      encounterId,
      participantId,
      rawRoll,
    );
  } finally {
    pendingInitiativeCampaigns.delete(campaignId);
  }
}

const pendingInitiativeCampaigns = new Set<string>();

async function persistCampaignEncounterInitiative(
  campaignId: string,
  encounterId: string,
  participantId: string,
  rawRoll: number | null,
): Promise<Campaign> {
  const campaigns = await loadCampaigns();
  const campaign = campaigns.find((item) => item.id === campaignId);
  if (!campaign) throw new Error('That campaign could not be found.');
  const encounter = (campaign.encounters ?? []).find((item) => item.id === encounterId);
  if (!encounter) throw new Error('That encounter could not be found.');
  if (encounter.status === 'in-progress') {
    throw new Error('Initiative cannot be changed after combat starts.');
  }

  const bonuses: Record<string, number> = {};
  for (const character of campaign.characters ?? []) {
    if ((character.status ?? 'active') === 'active') {
      bonuses[getCampaignInitiativeKey('character', character.id)] = character.initiative;
    }
  }
  for (const ally of encounter.allies ?? []) {
    bonuses[getCampaignInitiativeKey('ally', ally.id)] = ally.initiative;
  }
  for (const enemy of encounter.enemies) {
    if (enemy.initiativeMode === 'horde' && (enemy.quantity ?? 1) > 1) {
      bonuses[getCampaignInitiativeKey('enemy', enemy.id, undefined, true)] = enemy.initiative;
    } else {
      for (let index = 0; index < (enemy.quantity ?? 1); index += 1) {
        bonuses[getCampaignInitiativeKey('enemy', enemy.id, index)] = enemy.initiative;
      }
    }
  }
  if (!(participantId in bonuses)) {
    throw new Error('That participant is not part of this encounter.');
  }

  const initiativeResults = { ...(encounter.initiativeResults ?? {}) };
  if (rawRoll === null) {
    if (!(participantId in initiativeResults)) {
      throw new Error('That initiative result has already been reset.');
    }
    delete initiativeResults[participantId];
  } else {
    if (participantId in initiativeResults) {
      throw new Error('This participant is already ready. Reset their result before rolling again.');
    }
    initiativeResults[participantId] = calculateCampaignInitiative(
      rawRoll,
      bonuses[participantId],
    );
  }

  const updatedEncounter = { ...encounter, initiativeResults };
  const updatedCampaign: Campaign = {
    ...campaign,
    encounters: (campaign.encounters ?? []).map((item) =>
      item.id === encounterId ? updatedEncounter : item,
    ),
  };
  await saveCampaigns(
    campaigns.map((item) => (item.id === campaignId ? updatedCampaign : item)),
  );
  return updatedCampaign;
}

export function saveCampaignEncounterInitiative(
  campaignId: string,
  encounterId: string,
  participantId: string,
  rawRoll: number,
): Promise<Campaign> {
  return updateCampaignEncounterInitiative(campaignId, encounterId, participantId, rawRoll);
}

export function resetCampaignEncounterInitiative(
  campaignId: string,
  encounterId: string,
  participantId: string,
): Promise<Campaign> {
  return updateCampaignEncounterInitiative(campaignId, encounterId, participantId, null);
}

export async function saveCampaignCustomEnemyPreset(
  campaignId: string,
  presetId: string | null,
  name: string,
  initiative: number,
  imageUri: string,
): Promise<{ campaign: Campaign; preset: CampaignCustomEnemyPreset }> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Enter an enemy name.');
  if (!Number.isInteger(initiative) || initiative < -20 || initiative > 30) {
    throw new Error('Initiative bonus must be a whole number from -20 to +30.');
  }
  if (!imageUri) throw new Error('Choose a photo for the custom enemy.');

  const campaigns = await loadCampaigns();
  const campaign = campaigns.find((item) => item.id === campaignId);
  if (!campaign) throw new Error('That campaign could not be found.');
  const presets = campaign.customEnemyPresets ?? [];
  const existing = presetId
    ? presets.find((preset) => preset.id === presetId)
    : undefined;
  if (presetId && !existing) throw new Error('That custom enemy preset could not be found.');

  const id = existing?.id ?? `custom-${createId()}`;
  const persistedImageUri =
    existing?.imageUri === imageUri
      ? imageUri
      : await persistImage(imageUri, 'campaign-enemy-presets', `${campaignId}-${id}.jpg`);
  const preset: CampaignCustomEnemyPreset = {
    id,
    name: trimmedName,
    initiative,
    imageUri: persistedImageUri,
  };
  const customEnemyPresets = existing
    ? presets.map((item) => (item.id === id ? preset : item))
    : [...presets, preset];
  const updatedCampaign = { ...campaign, customEnemyPresets };

  try {
    await saveCampaigns(
      campaigns.map((item) => (item.id === campaignId ? updatedCampaign : item)),
    );
  } catch (error) {
    if (persistedImageUri !== imageUri && Platform.OS !== 'web') {
      new File(persistedImageUri).delete();
    }
    throw error;
  }

  return { campaign: updatedCampaign, preset };
}

export async function setCampaignCharacterStatus(
  campaignId: string,
  characterId: string,
  status: CampaignCharacter['status'],
): Promise<Campaign> {
  if (!status) throw new Error('Choose a valid character status.');
  const campaigns = await loadCampaigns();
  const campaign = campaigns.find((item) => item.id === campaignId);
  if (!campaign) throw new Error('That campaign could not be found.');
  if (!(campaign.characters ?? []).some((character) => character.id === characterId)) {
    throw new Error('That character could not be found.');
  }

  const existingCharacters = campaign.characters ?? [];
  const updatedCharacters = existingCharacters.map((character) =>
    character.id === characterId ? { ...character, status } : character,
  );
  let combat = campaign.combat ?? null;
  if (combat && combat.currentCharacterId === characterId && status !== 'active') {
    const interimCampaign = { ...campaign, characters: updatedCharacters, combat };
    const previousIndex = getCombatOrder(campaign).findIndex((entry) => entry.id === characterId);
    const eligible = getCombatOrder(interimCampaign);
    const next = eligible.find(
      (entry) => getCombatOrder(campaign).findIndex((old) => old.id === entry.id) > previousIndex,
    ) ?? eligible[0];
    combat = next ? { ...combat, currentCharacterId: next.id } : null;
  } else if (combat && !getCombatOrder({ ...campaign, characters: updatedCharacters }).length) {
    combat = null;
  }

  const updatedCampaign: Campaign = {
    ...campaign,
    characters: updatedCharacters,
    combat,
  };
  await saveCampaigns(
    campaigns.map((item) => (item.id === campaignId ? updatedCampaign : item)),
  );
  return updatedCampaign;
}

export async function updateCampaignCharacterInitiative(
  campaignId: string,
  characterId: string,
  initiative: number,
): Promise<Campaign> {
  if (!Number.isInteger(initiative) || initiative < -4 || initiative > 10) {
    throw new Error('Initiative must be a whole number from -4 to +10.');
  }
  const campaigns = await loadCampaigns();
  const campaign = campaigns.find((item) => item.id === campaignId);
  if (!campaign) throw new Error('That campaign could not be found.');
  if (!(campaign.characters ?? []).some((character) => character.id === characterId)) {
    throw new Error('That character could not be found.');
  }

  const updatedCampaign: Campaign = {
    ...campaign,
    characters: (campaign.characters ?? []).map((character) =>
      character.id === characterId ? { ...character, initiative } : character,
    ),
  };
  await saveCampaigns(
    campaigns.map((item) => (item.id === campaignId ? updatedCampaign : item)),
  );
  return updatedCampaign;
}

export async function deleteCampaignCharacter(
  campaignId: string,
  characterId: string,
): Promise<Campaign> {
  const campaigns = await loadCampaigns();
  const campaign = campaigns.find((item) => item.id === campaignId);
  if (!campaign) throw new Error('That campaign could not be found.');
  const character = (campaign.characters ?? []).find((item) => item.id === characterId);
  if (!character) throw new Error('That character could not be found.');

  const updatedCharacters = (campaign.characters ?? []).filter(
    (item) => item.id !== characterId,
  );
  let combat = campaign.combat ?? null;
  if (combat?.currentCharacterId === characterId) {
    const eligible = getCombatOrder({ ...campaign, characters: updatedCharacters });
    const next = eligible[0];
    combat = next ? { ...combat, currentCharacterId: next.id } : null;
  }
  const updatedCampaign: Campaign = {
    ...campaign,
    characters: updatedCharacters,
    combat,
  };
  await saveCampaigns(
    campaigns.map((item) => (item.id === campaignId ? updatedCampaign : item)),
  );
  if (character.portraitUri && Platform.OS !== 'web') {
    new File(character.portraitUri).delete();
  }
  return updatedCampaign;
}

const pendingCombatMutations = new Set<string>();

async function withCombatMutationLock(
  campaignId: string,
  operation: string,
  callback: () => Promise<Campaign>,
): Promise<Campaign> {
  if (pendingCombatMutations.has(campaignId)) {
    throw new Error(`A combat ${operation} is already being saved. Please wait.`);
  }
  pendingCombatMutations.add(campaignId);
  try {
    return await callback();
  } finally {
    pendingCombatMutations.delete(campaignId);
  }
}

export function startCampaignCombat(
  campaignId: string,
  encounterId?: string,
): Promise<Campaign> {
  return withCombatMutationLock(campaignId, 'start', () =>
    startCampaignCombatUnlocked(campaignId, encounterId),
  );
}

async function startCampaignCombatUnlocked(
  campaignId: string,
  encounterId?: string,
): Promise<Campaign> {
  if (!encounterId) {
    throw new Error('Prepare and save an encounter before starting combat so initiative can be recorded.');
  }
  const campaigns = await loadCampaigns();
  const campaign = campaigns.find((item) => item.id === campaignId);
  if (!campaign) throw new Error('That campaign could not be found.');
  if (campaign.combat) throw new Error('Combat is already in progress.');

  const initiativeOrder = getActiveCharacters(campaign.characters ?? []);
  const encounter = encounterId
    ? (campaign.encounters ?? []).find((item) => item.id === encounterId)
    : undefined;
  if (!encounter) throw new Error('That encounter could not be found.');
  if (encounter && encounter.status !== 'ready') {
    throw new Error('Mark this encounter ready before starting combat.');
  }
  if (initiativeOrder.length === 0 && (encounter?.allies?.length ?? 0) === 0) {
    throw new Error('Restore a party member or add a temporary ally before starting combat.');
  }
  const initiativeResults = encounter?.initiativeResults ?? {};
  const requiredInitiativeResults: [string, number][] = [
    ...initiativeOrder.map((character) => [
      getCampaignInitiativeKey('character', character.id),
      character.initiative,
    ] as [string, number]),
    ...(encounter?.allies ?? []).map((ally) => [
      getCampaignInitiativeKey('ally', ally.id),
      ally.initiative,
    ] as [string, number]),
    ...(encounter?.enemies ?? []).flatMap((enemy) => {
      const quantity = enemy.quantity ?? 1;
      return enemy.initiativeMode === 'horde' && quantity > 1
        ? [[
            getCampaignInitiativeKey('enemy', enemy.id, undefined, true),
            enemy.initiative,
          ] as [string, number]]
        : Array.from({ length: quantity }, (_, index) => [
            getCampaignInitiativeKey('enemy', enemy.id, index),
            enemy.initiative,
          ] as [string, number]);
    }),
  ];
  const missingParticipants = requiredInitiativeResults
    .filter(([key, bonus]) => initiativeResults[key]?.bonus !== bonus)
    .map(([key]) => key);
  if (encounter && missingParticipants.length > 0) {
    throw new Error('Record or reset initiative for every active party member, ally, and enemy before starting.');
  }
  const characters = encounter
    ? initiativeOrder.map((character) => {
        const result = initiativeResults[getCampaignInitiativeKey('character', character.id)];
        if (!result) throw new Error(`${character.name} is still waiting on initiative.`);
        return {
          id: character.id,
          name: character.name,
          initiative: result.total,
          initiativeRoll: result.rawRoll,
          initiativeBonus: result.bonus,
          initiativeTotal: result.total,
        };
      })
    : undefined;
  const allies = (encounter?.allies ?? []).map((ally) => {
    const result = initiativeResults[getCampaignInitiativeKey('ally', ally.id)];
    if (!result) throw new Error(`${ally.name} is still waiting on initiative.`);
    return {
      ...ally,
      initiative: result.total,
      initiativeRoll: result.rawRoll,
      initiativeBonus: result.bonus,
      initiativeTotal: result.total,
      maxHp: ally.maxHp ?? 10,
      currentHp: ally.maxHp ?? 10,
    };
  });
  const enemies = (encounter?.enemies ?? []).flatMap((enemy) => {
    const quantity = enemy.quantity ?? 1;
    if (enemy.initiativeMode === 'horde' && quantity > 1) {
      const result = initiativeResults[
        getCampaignInitiativeKey('enemy', enemy.id, undefined, true)
      ];
      if (!result) throw new Error(`${enemy.name} horde is still waiting on initiative.`);
      const maxHp = (enemy.maxHp ?? 10) * quantity;
      return [{
        ...enemy,
        name: `${enemy.name} Horde (${quantity})`,
        initiative: result.total,
        initiativeRoll: result.rawRoll,
        initiativeBonus: result.bonus,
        initiativeTotal: result.total,
        maxHp,
        currentHp: maxHp,
      }];
    }
    return Array.from({ length: quantity }, (_, index) => {
      const result = initiativeResults[
        getCampaignInitiativeKey('enemy', enemy.id, index)
      ];
      if (!result) throw new Error(`${enemy.name} ${index + 1} is still waiting on initiative.`);
      return {
        ...enemy,
        id: quantity === 1 ? enemy.id : `${enemy.id}-${index + 1}`,
        name: quantity === 1 ? enemy.name : `${enemy.name} ${index + 1}`,
        initiative: result.total,
        initiativeRoll: result.rawRoll,
        initiativeBonus: result.bonus,
        initiativeTotal: result.total,
        quantity: 1,
        initiativeMode: 'individual' as const,
        maxHp: enemy.maxHp ?? 10,
        currentHp: enemy.maxHp ?? 10,
      };
    });
  });
  const combatants = [
    ...(characters ?? initiativeOrder.map((character) => ({
      id: character.id,
      name: character.name,
      initiative: character.initiative,
    }))),
    ...allies,
    ...enemies,
  ].sort((left, right) => right.initiative - left.initiative);
  const updatedCampaign: Campaign = {
    ...campaign,
    combat: {
      startedAt: new Date().toISOString(),
      round: 1,
      currentCharacterId: combatants[0].id,
      participantIds: initiativeOrder.map((character) => character.id),
      ...(characters ? { characters } : {}),
      ...(encounter
        ? { encounterId: encounter.id, enemies, allies }
        : {}),
    },
    encounters: encounter
      ? (campaign.encounters ?? []).map((item) =>
          item.id === encounter.id ? { ...item, status: 'in-progress' } : item,
        )
      : (campaign.encounters ?? []),
  };
  await saveCampaigns(
    campaigns.map((item) => (item.id === campaignId ? updatedCampaign : item)),
  );
  return updatedCampaign;
}

export function updateCampaignCombatantHp(
  campaignId: string,
  combatantId: string,
  currentHp: number,
): Promise<Campaign> {
  return withCombatMutationLock(campaignId, 'update', () =>
    updateCampaignCombatantHpUnlocked(campaignId, combatantId, currentHp),
  );
}

async function updateCampaignCombatantHpUnlocked(
  campaignId: string,
  combatantId: string,
  currentHp: number,
): Promise<Campaign> {
  if (!Number.isInteger(currentHp) || currentHp < 0) {
    throw new Error('Current HP must be a whole number of 0 or more.');
  }
  const campaigns = await loadCampaigns();
  const campaign = campaigns.find((item) => item.id === campaignId);
  if (!campaign) throw new Error('That campaign could not be found.');
  if (!campaign.combat) throw new Error('There is no combat in progress.');

  const ally = campaign.combat.allies?.find((item) => item.id === combatantId);
  const enemy = campaign.combat.enemies?.find((item) => item.id === combatantId);
  const target = ally ?? enemy;
  if (!target) throw new Error('That combatant could not be found.');
  if (target.maxHp === undefined || currentHp > target.maxHp) {
    throw new Error(`Current HP must be between 0 and ${target.maxHp ?? 0}.`);
  }

  const combat = {
    ...campaign.combat,
    ...(ally
      ? {
          allies: campaign.combat.allies?.map((item) =>
            item.id === combatantId ? { ...item, currentHp } : item,
          ),
        }
      : {
          enemies: campaign.combat.enemies?.map((item) =>
            item.id === combatantId ? { ...item, currentHp } : item,
          ),
        }),
  };
  const updatedCampaign: Campaign = { ...campaign, combat };
  await saveCampaigns(
    campaigns.map((item) => (item.id === campaignId ? updatedCampaign : item)),
  );
  return updatedCampaign;
}

export function advanceCampaignCombat(campaignId: string): Promise<Campaign> {
  return withCombatMutationLock(campaignId, 'turn advance', () =>
    advanceCampaignCombatUnlocked(campaignId),
  );
}

async function advanceCampaignCombatUnlocked(campaignId: string): Promise<Campaign> {
  const campaigns = await loadCampaigns();
  const campaign = campaigns.find((item) => item.id === campaignId);
  if (!campaign) throw new Error('That campaign could not be found.');
  if (!campaign.combat) throw new Error('There is no combat in progress.');

  const initiativeOrder = getCombatOrder(campaign);
  if (initiativeOrder.length === 0) {
    throw new Error('There are no combatants left in this encounter.');
  }

  const currentIndex = initiativeOrder.findIndex(
    (character) => character.id === campaign.combat?.currentCharacterId,
  );
  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % initiativeOrder.length;
  const updatedCampaign: Campaign = {
    ...campaign,
    combat: {
      ...campaign.combat,
      round: campaign.combat.round + (nextIndex === 0 ? 1 : 0),
      currentCharacterId: initiativeOrder[nextIndex].id,
    },
  };
  await saveCampaigns(
    campaigns.map((item) => (item.id === campaignId ? updatedCampaign : item)),
  );
  return updatedCampaign;
}

export function endCampaignCombat(campaignId: string): Promise<Campaign> {
  return withCombatMutationLock(campaignId, 'end', () => endCampaignCombatUnlocked(campaignId));
}

async function endCampaignCombatUnlocked(campaignId: string): Promise<Campaign> {
  const campaigns = await loadCampaigns();
  const campaign = campaigns.find((item) => item.id === campaignId);
  if (!campaign) throw new Error('That campaign could not be found.');

  const historyEntry: CampaignCombatHistory | null = campaign.combat
    ? {
        startedAt: campaign.combat.startedAt,
        endedAt: new Date().toISOString(),
        rounds: campaign.combat.round,
        participants: getCombatOrder(campaign).map((combatant) => combatant.name),
      }
    : null;
  const updatedCampaign: Campaign = {
    ...campaign,
    combat: null,
    encounters: campaign.combat?.encounterId
      ? (campaign.encounters ?? []).map((encounter) =>
          encounter.id === campaign.combat?.encounterId
            ? { ...encounter, status: 'ready' }
            : encounter,
        )
      : (campaign.encounters ?? []),
    combatHistory: historyEntry
      ? [...(campaign.combatHistory ?? []), historyEntry]
      : (campaign.combatHistory ?? []),
  };
  await saveCampaigns(
    campaigns.map((item) => (item.id === campaignId ? updatedCampaign : item)),
  );
  return updatedCampaign;
}
