import type { ImageSourcePropType } from 'react-native';

export const CAMPAIGN_COVERS: { id: string; name: string; source: ImageSourcePropType }[] = [
  {
    id: 'sunlit-bay',
    name: 'Sunlit Bay',
    source: require('../../assets/images/campaign-cover-sunlit-bay.jpg'),
  },
  {
    id: 'desert-ruins',
    name: 'Desert Ruins',
    source: require('../../assets/images/campaign-cover-desert-ruins.jpg'),
  },
  {
    id: 'rosecourt',
    name: 'Rosecourt',
    source: require('../../assets/images/campaign-cover-rosecourt.jpg'),
  },
  {
    id: 'moonlit-forest',
    name: 'Moonlit Forest',
    source: require('../../assets/images/campaign-cover-moonlit-forest.jpg'),
  },
  {
    id: 'haunted-city',
    name: 'Haunted City',
    source: require('../../assets/images/campaign-cover-haunted-city.jpg'),
  },
  {
    id: 'frozen-fortress',
    name: 'Frozen Fortress',
    source: require('../../assets/images/campaign-cover-frozen-fortress.jpg'),
  },
];

export function getCampaignCoverSource(
  coverId?: string | null,
  coverUri?: string | null,
): ImageSourcePropType | null {
  if (coverUri) return { uri: coverUri };
  return CAMPAIGN_COVERS.find((cover) => cover.id === coverId)?.source ?? null;
}
