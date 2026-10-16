import {
  createCampaign,
  deleteCampaign,
  loadCampaigns,
  setCampaignFavorite,
  type Campaign,
} from '@/storage/campaigns';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import type { ImageSourcePropType } from 'react-native';

const CAMPAIGN_COVERS: { id: string; name: string; source: ImageSourcePropType }[] = [
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

function getCampaignCover(campaign: Campaign): ImageSourcePropType | null {
  if (campaign.coverUri) return { uri: campaign.coverUri };
  return CAMPAIGN_COVERS.find((cover) => cover.id === campaign.coverId)?.source ?? null;
}

export default function CampaignsScreen() {
  const { height, width } = useWindowDimensions();
  const artworkAspectRatio = 941 / 1672;
  const artworkWidth = Math.min(width, height * artworkAspectRatio);
  const artworkHeight = artworkWidth / artworkAspectRatio;
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignName, setCampaignName] = useState('');
  const [selectedCoverId, setSelectedCoverId] = useState<string | null>('sunlit-bay');
  const [selectedPhotoUri, setSelectedPhotoUri] = useState<string | null>(null);
  const [isPickingImage, setIsPickingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [isDeleteConfirmVisible, setIsDeleteConfirmVisible] = useState(false);
  const [isUpdatingCampaign, setIsUpdatingCampaign] = useState(false);
  const isSavingRef = useRef(false);

  async function handlePickCampaignImage() {
    setIsPickingImage(true);
    setImageError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [3, 2],
        quality: 0.75,
        base64: Platform.OS === 'web',
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (Platform.OS === 'web') {
        if (!asset.base64) {
          throw new Error('The selected photo could not be read. Please choose it again.');
        }
        setSelectedPhotoUri(`data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`);
      } else {
        setSelectedPhotoUri(asset.uri);
      }
      setSelectedCoverId(null);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : 'Photo could not be selected.');
    } finally {
      setIsPickingImage(false);
    }
  }

  useEffect(() => {
    let isActive = true;

    async function loadSavedCampaigns() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const savedCampaigns = await loadCampaigns();
        if (isActive) setCampaigns(savedCampaigns);
      } catch (error) {
        if (isActive) {
          setLoadError(
            error instanceof Error ? error.message : 'Campaigns could not be loaded.',
          );
        }
      } finally {
        if (isActive) setIsLoading(false);
      }
    }

    void loadSavedCampaigns();
    return () => {
      isActive = false;
    };
  }, [loadAttempt]);

  async function handleCreateCampaign() {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);
    setSaveError(null);
    try {
      const campaign = await createCampaign(campaignName, {
        coverId: selectedCoverId,
        imageUri: selectedPhotoUri,
      });
      setCampaigns((currentCampaigns) => [...currentCampaigns, campaign]);
      setCampaignName('');
      setSelectedPhotoUri(null);
      setSelectedCoverId('sunlit-bay');
      setIsCreateModalVisible(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Campaign could not be saved.');
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }

  async function handleToggleFavorite() {
    if (!activeCampaign || isUpdatingCampaign) return;
    setIsUpdatingCampaign(true);
    setActionError(null);
    try {
      const updatedCampaigns = await setCampaignFavorite(
        activeCampaign.id,
        !activeCampaign.favorite,
      );
      setCampaigns(updatedCampaigns);
      setActiveCampaign(null);
      setIsMenuVisible(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Favorite could not be updated.');
    } finally {
      setIsUpdatingCampaign(false);
    }
  }

  async function handleDeleteCampaign() {
    if (!activeCampaign || isUpdatingCampaign) return;
    setIsUpdatingCampaign(true);
    setActionError(null);
    try {
      const remainingCampaigns = await deleteCampaign(activeCampaign.id);
      setCampaigns(remainingCampaigns);
      setActiveCampaign(null);
      setIsDeleteConfirmVisible(false);
      setIsMenuVisible(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Campaign could not be deleted.');
    } finally {
      setIsUpdatingCampaign(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ImageBackground
        source={require('../../assets/images/campaigns-list-background.png')}
        resizeMode="stretch"
        style={{ width: artworkWidth, height: artworkHeight }}
      >
        {!isLoading && !loadError && campaigns.length === 0 && (
          <View pointerEvents="none" style={styles.emptyStateArtwork}>
            <Image
              resizeMode="stretch"
              source={require('../../assets/images/Empty Campaigns Screen with D20 Emblem.png')}
              style={styles.fillArtwork}
            />
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.replace('/')}
          style={styles.backButton}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create campaign"
          onPress={() => {
            setSaveError(null);
            setImageError(null);
            setIsCreateModalVisible(true);
          }}
          style={styles.createButton}
        />

        {(isLoading || loadError || campaigns.length > 0) && (
          <View style={styles.campaignListRegion}>
            {isLoading ? (
              <ActivityIndicator color="#E8B95F" />
            ) : loadError ? (
              <View style={styles.statusContent}>
                <Text style={styles.statusText}>{loadError}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setLoadAttempt((attempt) => attempt + 1)}
                  style={styles.retryButton}
                >
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              </View>
            ) : (
              <ScrollView
                contentContainerStyle={styles.campaignList}
                showsVerticalScrollIndicator={false}
              >
                {[...campaigns]
                  .sort((left, right) => Number(right.favorite) - Number(left.favorite))
                  .map((campaign) => {
                    const coverSource = getCampaignCover(campaign);
                    return (
                      <View key={campaign.id} style={styles.campaignCard}>
                        {coverSource ? (
                          <Image
                            accessibilityLabel={`${campaign.name} cover`}
                            resizeMode="cover"
                            source={coverSource}
                            style={styles.campaignCover}
                          />
                        ) : (
                          <View style={[styles.campaignCover, styles.emptyCampaignCover]}>
                            <Text style={styles.emptyCoverText}>D20</Text>
                          </View>
                        )}
                        <View style={styles.campaignDetails}>
                          <Text style={styles.campaignName}>
                            {campaign.name}
                          </Text>
                          <Text style={styles.characterCount}>
                            {campaign.favorite ? '★  ' : ''}0 characters
                          </Text>
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`More options for ${campaign.name}`}
                          hitSlop={8}
                          onPress={() => {
                            setActiveCampaign(campaign);
                            setActionError(null);
                            setIsMenuVisible(true);
                          }}
                          style={styles.campaignMenuButton}
                        >
                          <Text accessibilityElementsHidden style={styles.campaignMenuDots}>
                            ⋯
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
              </ScrollView>
            )}
          </View>
        )}
      </ImageBackground>

      <Modal
        animationType="fade"
        onRequestClose={() => setIsCreateModalVisible(false)}
        transparent
        visible={isCreateModalVisible}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView
              contentContainerStyle={styles.createModalContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.modalTitle}>Create Campaign</Text>
              <Text style={styles.modalDescription}>Give your next adventure a name.</Text>
              <TextInput
                accessibilityLabel="Campaign name"
                autoCapitalize="words"
                autoFocus
                maxLength={15}
                onChangeText={setCampaignName}
                onSubmitEditing={() => {
                  if (campaignName.trim() && !isSaving) void handleCreateCampaign();
                }}
                placeholder="Campaign name"
                placeholderTextColor="#A8987D"
                returnKeyType="done"
                style={styles.nameInput}
                value={campaignName}
              />
              <Text style={styles.coverHeading}>Campaign Cover</Text>
              <Pressable
                accessibilityRole="button"
                disabled={isPickingImage || isSaving}
                onPress={() => void handlePickCampaignImage()}
                style={styles.photoPickerButton}
              >
                <Text style={styles.photoPickerText}>
                  {isPickingImage ? 'Opening Photos...' : 'Choose from Photos'}
                </Text>
              </Pressable>
              <Text style={styles.selectedCoverLabel}>
                {selectedPhotoUri
                  ? 'Selected: Your photo'
                  : `Selected: ${CAMPAIGN_COVERS.find((cover) => cover.id === selectedCoverId)?.name ?? 'None'}`}
              </Text>
              {selectedPhotoUri && (
                <Image
                  accessibilityLabel="Selected campaign cover photo"
                  source={{ uri: selectedPhotoUri }}
                  resizeMode="cover"
                  style={styles.selectedPhotoPreview}
                />
              )}
              <View style={styles.coverGallery}>
                {CAMPAIGN_COVERS.map((cover) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Choose ${cover.name} cover`}
                    accessibilityState={{ selected: selectedCoverId === cover.id }}
                    disabled={isSaving || isPickingImage}
                    key={cover.id}
                    onPress={() => {
                      setSelectedCoverId(cover.id);
                      setSelectedPhotoUri(null);
                      setImageError(null);
                    }}
                    style={[
                      styles.coverOption,
                      selectedCoverId === cover.id && styles.selectedCoverOption,
                    ]}
                  >
                    <Image
                      accessibilityLabel={`${cover.name} cover preview`}
                      source={cover.source}
                      resizeMode="cover"
                      style={styles.coverOptionImage}
                    />
                    <Text numberOfLines={1} style={styles.coverOptionName}>
                      {cover.name}
                    </Text>
                    {selectedCoverId === cover.id && !selectedPhotoUri && (
                      <View style={styles.coverSelectedBadge}>
                        <Text style={styles.coverSelectedCheck}>✓</Text>
                      </View>
                    )}
                  </Pressable>
                ))}
              </View>
              {imageError && <Text style={styles.errorText}>{imageError}</Text>}
              {saveError && <Text style={styles.errorText}>{saveError}</Text>}
              <View style={styles.modalActions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={isSaving || isPickingImage}
                  onPress={() => setIsCreateModalVisible(false)}
                  style={styles.cancelButton}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={!campaignName.trim() || isSaving || isPickingImage}
                  onPress={() => void handleCreateCampaign()}
                  style={[
                    styles.saveButton,
                    (!campaignName.trim() || isSaving || isPickingImage) &&
                      styles.disabledSaveButton,
                  ]}
                >
                  <Text style={styles.saveText}>{isSaving ? 'Saving...' : 'Create'}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => {
          setIsMenuVisible(false);
          setIsDeleteConfirmVisible(false);
          setActionError(null);
        }}
        transparent
        visible={isMenuVisible}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close campaign options"
            onPress={() => {
              setIsMenuVisible(false);
              setActionError(null);
            }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.actionMenu}>
            {isDeleteConfirmVisible ? (
              <>
                <Text style={styles.actionMenuTitle}>Delete Campaign?</Text>
                <Text style={styles.modalDescription}>
                  Delete {activeCampaign?.name}? This cannot be undone.
                </Text>
                <View style={styles.modalActions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isUpdatingCampaign}
                    onPress={() => setIsDeleteConfirmVisible(false)}
                    style={styles.cancelButton}
                  >
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isUpdatingCampaign}
                    onPress={() => void handleDeleteCampaign()}
                    style={styles.deleteButton}
                  >
                    <Text style={styles.saveText}>
                      {isUpdatingCampaign ? 'Deleting...' : 'Delete'}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.actionMenuTitle}>
                  {activeCampaign?.name}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={isUpdatingCampaign}
                  onPress={() => void handleToggleFavorite()}
                  style={styles.menuAction}
                >
                  <Text style={styles.menuActionText}>
                    {activeCampaign?.favorite ? 'Remove from Favorites' : 'Favorite Campaign'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={isUpdatingCampaign}
                  onPress={() => {
                    setActionError(null);
                    setIsDeleteConfirmVisible(true);
                  }}
                  style={styles.menuAction}
                >
                  <Text style={styles.deleteActionText}>Delete Campaign</Text>
                </Pressable>
              </>
            )}
            {actionError && <Text style={styles.errorText}>{actionError}</Text>}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#030A12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    position: 'absolute',
    left: '6%',
    top: '3.8%',
    width: '24%',
    height: '5.2%',
  },
  createButton: {
    position: 'absolute',
    left: '6%',
    right: '6%',
    top: '20.8%',
    height: '8.2%',
  },
  emptyStateArtwork: {
    ...StyleSheet.absoluteFill,
  },
  fillArtwork: {
    width: '100%',
    height: '100%',
  },
  campaignListRegion: {
    position: 'absolute',
    left: '5%',
    right: '5%',
    top: '30%',
    bottom: '3.5%',
    overflow: 'hidden',
  },
  campaignList: {
    flexGrow: 1,
    paddingHorizontal: 8,
    paddingBottom: 12,
  },
  campaignCard: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 8,
    paddingRight: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(196, 151, 76, 0.55)',
  },
  campaignCover: {
    width: 92,
    height: 62,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(196, 151, 76, 0.65)',
  },
  emptyCampaignCover: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(7, 17, 27, 0.8)',
  },
  emptyCoverText: {
    color: '#D9A64D',
    fontFamily: 'serif',
    fontSize: 17,
  },
  campaignDetails: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  campaignMenuButton: {
    width: 40,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  campaignMenuDots: {
    color: '#D9A64D',
    fontSize: 28,
    lineHeight: 30,
  },
  campaignName: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 22,
  },
  characterCount: {
    color: '#BDA476',
    fontFamily: 'serif',
    fontSize: 14,
    letterSpacing: 2,
    marginTop: 4,
  },
  statusContent: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  statusText: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 15,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#B78A43',
    borderRadius: 6,
  },
  retryText: {
    color: '#F4DDAE',
    fontFamily: 'serif',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0, 5, 11, 0.82)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '88%',
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#C69A50',
    borderRadius: 12,
    backgroundColor: '#07111B',
  },
  createModalContent: {
    padding: 24,
  },
  actionMenu: {
    width: '100%',
    maxWidth: 340,
    alignSelf: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#C69A50',
    borderRadius: 10,
    backgroundColor: '#07111B',
  },
  actionMenuTitle: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  menuAction: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(196, 151, 76, 0.4)',
  },
  menuActionText: {
    color: '#F4DDAE',
    fontSize: 16,
  },
  deleteActionText: {
    color: '#F0A59B',
    fontSize: 16,
  },
  deleteButton: {
    minWidth: 92,
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 6,
    backgroundColor: '#873D32',
  },
  modalTitle: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 26,
    textAlign: 'center',
  },
  modalDescription: {
    color: '#BDA476',
    fontFamily: 'serif',
    fontSize: 15,
    marginTop: 8,
    textAlign: 'center',
  },
  nameInput: {
    marginTop: 22,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#8E703F',
    borderRadius: 6,
    color: '#F4DDAE',
    fontSize: 16,
  },
  coverHeading: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 17,
    marginTop: 20,
  },
  photoPickerButton: {
    alignItems: 'center',
    marginTop: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#8E703F',
    borderRadius: 6,
    backgroundColor: 'rgba(167, 122, 49, 0.14)',
  },
  photoPickerText: {
    color: '#F4DDAE',
    fontSize: 15,
    fontWeight: '600',
  },
  selectedCoverLabel: {
    color: '#BDA476',
    fontSize: 13,
    marginTop: 10,
  },
  selectedPhotoPreview: {
    width: 104,
    height: 68,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E8B95F',
    borderRadius: 5,
  },
  coverGallery: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  coverOption: {
    width: '48%',
    padding: 3,
    position: 'relative',
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 7,
  },
  selectedCoverOption: {
    borderColor: '#E8B95F',
    backgroundColor: 'rgba(167, 122, 49, 0.18)',
  },
  coverOptionImage: {
    width: '100%',
    height: 94,
    borderRadius: 5,
  },
  coverOptionName: {
    color: '#D0BE9C',
    fontSize: 12,
    marginTop: 5,
    textAlign: 'center',
  },
  coverSelectedBadge: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: '#A77A31',
  },
  coverSelectedCheck: {
    color: '#FFF3D5',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  errorText: {
    color: '#F0A59B',
    marginTop: 10,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 22,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  cancelText: {
    color: '#D0BE9C',
    fontSize: 16,
  },
  saveButton: {
    minWidth: 92,
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 6,
    backgroundColor: '#A77A31',
  },
  disabledSaveButton: {
    opacity: 0.45,
  },
  saveText: {
    color: '#FFF3D5',
    fontSize: 16,
    fontWeight: '600',
  },
});
