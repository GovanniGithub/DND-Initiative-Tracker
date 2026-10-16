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
      typeof campaign.coverUri === 'string')
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
  }));
}

async function persistCampaignImage(uri: string, campaignId: string): Promise<string> {
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

  const directory = new Directory(Paths.document, 'campaign-covers');
  directory.create({ intermediates: true, idempotent: true });
  const savedImage = new File(directory, `${campaignId}.jpg`);
  await new File(uri).copy(savedImage);
  return savedImage.uri;
}

export async function createCampaign(
  name: string,
  cover: { coverId?: string | null; imageUri?: string | null } = {},
): Promise<Campaign> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Enter a campaign name.');

  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const coverUri = cover.imageUri ? await persistCampaignImage(cover.imageUri, id) : null;
  const campaign: Campaign = {
    id,
    name: trimmedName,
    createdAt: new Date().toISOString(),
    favorite: false,
    coverId: coverUri ? null : cover.coverId ?? null,
    coverUri,
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
