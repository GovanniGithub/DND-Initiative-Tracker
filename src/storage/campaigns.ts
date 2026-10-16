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
  combat?: CampaignCombat | null;
  combatHistory?: CampaignCombatHistory[];
};

export type CampaignCharacter = {
  id: string;
  name: string;
  className: string;
  initiative: number;
  portraitUri?: string | null;
  status?: 'active' | 'stored' | 'dead';
};

export type CampaignCombat = {
  startedAt: string;
  round: number;
  currentCharacterId: string;
  participantIds?: string[];
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
    (campaign.combat === undefined ||
      campaign.combat === null ||
      isCampaignCombat(campaign.combat)) &&
    (campaign.combatHistory === undefined ||
      (Array.isArray(campaign.combatHistory) &&
        campaign.combatHistory.every(isCampaignCombatHistory)))
  );
}

function isCampaignCharacter(value: unknown): value is CampaignCharacter {
  if (typeof value !== 'object' || value === null) return false;
  const character = value as Record<string, unknown>;
  return (
    typeof character.id === 'string' &&
    typeof character.name === 'string' &&
    typeof character.className === 'string' &&
    typeof character.initiative === 'number' &&
    Number.isFinite(character.initiative) &&
    (character.portraitUri === undefined ||
      character.portraitUri === null ||
      typeof character.portraitUri === 'string') &&
    (character.status === undefined ||
      character.status === 'active' ||
      character.status === 'stored' ||
      character.status === 'dead')
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
        combat.participantIds.every((participantId) => typeof participantId === 'string')))
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
    const eligibleCharacters = getActiveCharacters(updatedCharacters);
    const previousOrder = getActiveCharacters(existingCharacters);
    const previousIndex = previousOrder.findIndex((character) => character.id === characterId);
    const nextCharacter =
      eligibleCharacters.find(
        (character) =>
          previousOrder.findIndex((previous) => previous.id === character.id) > previousIndex,
      ) ?? eligibleCharacters[0];
    combat = nextCharacter ? { ...combat, currentCharacterId: nextCharacter.id } : null;
  } else if (combat && !getActiveCharacters(updatedCharacters).length) {
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
    const nextCharacter = getActiveCharacters(updatedCharacters)[0];
    combat = nextCharacter ? { ...combat, currentCharacterId: nextCharacter.id } : null;
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

export async function startCampaignCombat(campaignId: string): Promise<Campaign> {
  const campaigns = await loadCampaigns();
  const campaign = campaigns.find((item) => item.id === campaignId);
  if (!campaign) throw new Error('That campaign could not be found.');

  const initiativeOrder = getActiveCharacters(campaign.characters ?? []);
  if (initiativeOrder.length === 0) {
    throw new Error('Restore at least one character to the party before starting combat.');
  }

  const updatedCampaign: Campaign = {
    ...campaign,
    combat: {
      startedAt: new Date().toISOString(),
      round: 1,
      currentCharacterId: initiativeOrder[0].id,
      participantIds: initiativeOrder.map((character) => character.id),
    },
  };
  await saveCampaigns(
    campaigns.map((item) => (item.id === campaignId ? updatedCampaign : item)),
  );
  return updatedCampaign;
}

export async function advanceCampaignCombat(campaignId: string): Promise<Campaign> {
  const campaigns = await loadCampaigns();
  const campaign = campaigns.find((item) => item.id === campaignId);
  if (!campaign) throw new Error('That campaign could not be found.');
  if (!campaign.combat) throw new Error('There is no combat in progress.');

  const initiativeOrder = getActiveCharacters(campaign.characters ?? []);
  if (initiativeOrder.length === 0) {
    throw new Error('Restore at least one character to the party before advancing combat.');
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

export async function endCampaignCombat(campaignId: string): Promise<Campaign> {
  const campaigns = await loadCampaigns();
  const campaign = campaigns.find((item) => item.id === campaignId);
  if (!campaign) throw new Error('That campaign could not be found.');

  const historyEntry: CampaignCombatHistory | null = campaign.combat
    ? {
        startedAt: campaign.combat.startedAt,
        endedAt: new Date().toISOString(),
        rounds: campaign.combat.round,
        participants: campaign.combat.participantIds
          ? campaign.combat.participantIds.flatMap((participantId) => {
              const character = (campaign.characters ?? []).find(
                (item) => item.id === participantId,
              );
              return character ? [character.name] : [];
            })
          : getActiveCharacters(campaign.characters ?? []).map((character) => character.name),
      }
    : null;
  const updatedCampaign: Campaign = {
    ...campaign,
    combat: null,
    combatHistory: historyEntry
      ? [...(campaign.combatHistory ?? []), historyEntry]
      : (campaign.combatHistory ?? []),
  };
  await saveCampaigns(
    campaigns.map((item) => (item.id === campaignId ? updatedCampaign : item)),
  );
  return updatedCampaign;
}
