import { getCampaignCoverSource } from '@/constants/campaign-covers';
import {
  addCampaignCharacter,
  advanceCampaignCombat,
  deleteCampaignCharacter,
  endCampaignCombat,
  loadCampaigns,
  setCampaignCharacterStatus,
  startCampaignCombat,
  updateCampaignCharacterInitiative,
  type Campaign,
  type CampaignCharacter,
} from '@/storage/campaigns';
import Slider from '@react-native-community/slider';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
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

type CampaignTab = 'Party' | 'Encounters' | 'Graveyard' | 'History';
const CAMPAIGN_TABS: CampaignTab[] = ['Party', 'Encounters', 'Graveyard', 'History'];
const CHARACTER_CLASSES = [
  'Artificer',
  'Barbarian',
  'Bard',
  'Cleric',
  'Druid',
  'Fighter',
  'Monk',
  'Paladin',
  'Ranger',
  'Rogue',
  'Sorcerer',
  'Warlock',
  'Wizard',
];

function getInitiativeOrder(characters: CampaignCharacter[]): CampaignCharacter[] {
  return [...characters].sort((left, right) => right.initiative - left.initiative);
}

export default function CampaignDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { height, width } = useWindowDimensions();
  const artworkAspectRatio = 941 / 1672;
  const artworkWidth = Math.min(width, height * artworkAspectRatio);
  const artworkHeight = artworkWidth / artworkAspectRatio;
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [activeTab, setActiveTab] = useState<CampaignTab>('Party');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isCharacterModalVisible, setIsCharacterModalVisible] = useState(false);
  const [characterName, setCharacterName] = useState('');
  const [characterClass, setCharacterClass] = useState('');
  const [characterInitiative, setCharacterInitiative] = useState(0);
  const [initiativeSliderKey, setInitiativeSliderKey] = useState(0);
  const [characterPortraitUri, setCharacterPortraitUri] = useState<string | null>(null);
  const [isPickingPortrait, setIsPickingPortrait] = useState(false);
  const [isSavingCharacter, setIsSavingCharacter] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<CampaignCharacter | null>(null);
  const [isCharacterMenuVisible, setIsCharacterMenuVisible] = useState(false);
  const [isEditingInitiative, setIsEditingInitiative] = useState(false);
  const [editedInitiative, setEditedInitiative] = useState(0);
  const [isCharacterDeleteConfirmVisible, setIsCharacterDeleteConfirmVisible] = useState(false);
  const [isUpdatingCharacter, setIsUpdatingCharacter] = useState(false);
  const [isCombatModalVisible, setIsCombatModalVisible] = useState(false);
  const [isUpdatingCombat, setIsUpdatingCombat] = useState(false);

  async function handlePickCharacterPortrait() {
    setIsPickingPortrait(true);
    setActionError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.75,
        base64: Platform.OS === 'web',
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (Platform.OS === 'web') {
        if (!asset.base64) {
          throw new Error('The selected portrait could not be read. Please choose it again.');
        }
        setCharacterPortraitUri(
          `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`,
        );
      } else {
        setCharacterPortraitUri(asset.uri);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Portrait could not be selected.');
    } finally {
      setIsPickingPortrait(false);
    }
  }

  useEffect(() => {
    let isActive = true;

    async function loadCampaign() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const campaigns = await loadCampaigns();
        const savedCampaign = campaigns.find((item) => item.id === id);
        if (!savedCampaign) {
          throw new Error('This campaign could not be found.');
        }
        if (isActive) setCampaign(savedCampaign);
      } catch (error) {
        if (isActive) {
          setLoadError(
            error instanceof Error ? error.message : 'Campaign details could not be loaded.',
          );
        }
      } finally {
        if (isActive) setIsLoading(false);
      }
    }

    void loadCampaign();
    return () => {
      isActive = false;
    };
  }, [id, loadAttempt]);

  async function handleAddCharacter() {
    if (!campaign || isSavingCharacter) return;
    setIsSavingCharacter(true);
    setActionError(null);
    try {
      const updatedCampaign = await addCampaignCharacter(campaign.id, {
        name: characterName,
        className: characterClass,
        initiative: characterInitiative,
        portraitUri: characterPortraitUri,
      });
      setCampaign(updatedCampaign);
      setCharacterName('');
      setCharacterClass('');
      setCharacterInitiative(0);
      setInitiativeSliderKey((key) => key + 1);
      setCharacterPortraitUri(null);
      setIsCharacterModalVisible(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Character could not be saved.');
    } finally {
      setIsSavingCharacter(false);
    }
  }

  async function handleSetCharacterStatus(status: 'active' | 'stored' | 'dead') {
    if (!campaign || !selectedCharacter || isUpdatingCharacter) return;
    setIsUpdatingCharacter(true);
    setActionError(null);
    try {
      const updatedCampaign = await setCampaignCharacterStatus(
        campaign.id,
        selectedCharacter.id,
        status,
      );
      setCampaign(updatedCampaign);
      setSelectedCharacter(null);
      setIsCharacterMenuVisible(false);
      if (!updatedCampaign.combat) setIsCombatModalVisible(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Character status could not be updated.');
    } finally {
      setIsUpdatingCharacter(false);
    }
  }

  async function handleDeleteCharacter() {
    if (!campaign || !selectedCharacter || isUpdatingCharacter) return;
    setIsUpdatingCharacter(true);
    setActionError(null);
    try {
      const updatedCampaign = await deleteCampaignCharacter(
        campaign.id,
        selectedCharacter.id,
      );
      setCampaign(updatedCampaign);
      setSelectedCharacter(null);
      setIsCharacterMenuVisible(false);
      setIsCharacterDeleteConfirmVisible(false);
      if (!updatedCampaign.combat) setIsCombatModalVisible(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Character could not be deleted.');
    } finally {
      setIsUpdatingCharacter(false);
    }
  }

  async function handleSaveInitiative() {
    if (!campaign || !selectedCharacter || isUpdatingCharacter) return;
    setIsUpdatingCharacter(true);
    setActionError(null);
    try {
      const updatedCampaign = await updateCampaignCharacterInitiative(
        campaign.id,
        selectedCharacter.id,
        editedInitiative,
      );
      const updatedCharacter = (updatedCampaign.characters ?? []).find(
        (character) => character.id === selectedCharacter.id,
      );
      setCampaign(updatedCampaign);
      if (updatedCharacter) setSelectedCharacter(updatedCharacter);
      setIsEditingInitiative(false);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Initiative could not be updated.',
      );
    } finally {
      setIsUpdatingCharacter(false);
    }
  }

  async function handleStartCombat() {
    if (!campaign || isUpdatingCombat) return;
    setIsUpdatingCombat(true);
    setActionError(null);
    try {
      const updatedCampaign = await startCampaignCombat(campaign.id);
      setCampaign(updatedCampaign);
      setIsCombatModalVisible(true);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Combat could not be started.');
    } finally {
      setIsUpdatingCombat(false);
    }
  }

  async function handleAdvanceCombat() {
    if (!campaign || isUpdatingCombat) return;
    setIsUpdatingCombat(true);
    setActionError(null);
    try {
      setCampaign(await advanceCampaignCombat(campaign.id));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Combat turn could not be advanced.');
    } finally {
      setIsUpdatingCombat(false);
    }
  }

  async function handleEndCombat() {
    if (!campaign || isUpdatingCombat) return;
    setIsUpdatingCombat(true);
    setActionError(null);
    try {
      setCampaign(await endCampaignCombat(campaign.id));
      setIsCombatModalVisible(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Combat could not be ended.');
    } finally {
      setIsUpdatingCombat(false);
    }
  }

  const characters = campaign?.characters ?? [];
  const activeCharacters = characters.filter((character) => (character.status ?? 'active') === 'active');
  const storedCharacters = characters.filter((character) => character.status === 'stored');
  const deadCharacters = characters.filter((character) => character.status === 'dead');
  const initiativeOrder = getInitiativeOrder(activeCharacters);
  const currentCharacter = initiativeOrder.find(
    (character) => character.id === campaign?.combat?.currentCharacterId,
  );
  const coverSource = campaign
    ? getCampaignCoverSource(campaign.coverId, campaign.coverUri)
    : null;
  const renderCharacterCard = (character: CampaignCharacter) => (
    <View key={character.id} style={styles.characterCard}>
      <View style={styles.characterPortrait}>
        {character.portraitUri ? (
          <Image
            accessibilityLabel={`${character.name} portrait`}
            resizeMode="cover"
            source={{ uri: character.portraitUri }}
            style={styles.characterPortraitImage}
          />
        ) : (
          <Text style={styles.characterInitial}>{character.name.charAt(0).toUpperCase()}</Text>
        )}
      </View>
      <View style={styles.characterInfo}>
        <Text numberOfLines={1} style={styles.characterName}>
          {character.name}
        </Text>
        <Text numberOfLines={1} style={styles.characterClass}>
          {character.className}
        </Text>
        <View style={styles.characterDivider} />
        <Text style={styles.characterStats}>
          Initiative {character.initiative >= 0 ? '+' : ''}
          {character.initiative}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Character options for ${character.name}`}
        disabled={isUpdatingCharacter}
        hitSlop={8}
        onPress={() => {
          setActionError(null);
          setSelectedCharacter(character);
          setEditedInitiative(character.initiative);
          setIsEditingInitiative(false);
          setIsCharacterDeleteConfirmVisible(false);
          setIsCharacterMenuVisible(true);
        }}
        style={styles.characterMenuButton}
      >
        <Text accessibilityElementsHidden style={styles.characterMenuDots}>
          ⋯
        </Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.screen}>
      <ImageBackground
        source={require('../../../assets/images/campaigns-list-background.png')}
        resizeMode="stretch"
        style={{ width: artworkWidth, height: artworkHeight }}
      >
        <View style={styles.page}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/campaigns')}
            style={styles.backButton}
          >
            <Text style={styles.backArrow}>‹</Text>
            <Text style={styles.backLabel}>Campaigns</Text>
          </Pressable>

          {isLoading ? (
            <View style={styles.statusContent}>
              <ActivityIndicator color="#E8B95F" />
            </View>
          ) : loadError || !campaign ? (
            <View style={styles.statusContent}>
              <Text style={styles.statusText}>
                {loadError ?? 'This campaign could not be found.'}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setLoadAttempt((attempt) => attempt + 1)}
                style={styles.retryButton}
              >
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace('/campaigns')}
              >
                <Text style={styles.backToCampaigns}>Back to campaigns</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
              >
                <ImageBackground
                  imageStyle={styles.heroImage}
                  resizeMode="cover"
                  source={
                    coverSource ??
                    require('../../../assets/images/campaign-cover-sunlit-bay.jpg')
                  }
                  style={styles.hero}
                >
                  <View style={styles.heroShade} />
                  <Text numberOfLines={2} style={styles.heroTitle}>
                    {campaign.name}
                  </Text>
                </ImageBackground>

                <View style={styles.combatBanner}>
                  <View style={styles.combatBannerLabel}>
                    <Text style={styles.combatIcon}>⚔</Text>
                    <Text style={styles.combatBannerText}>
                      {campaign.combat ? 'Combat in progress' : 'Ready for combat'}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isUpdatingCombat}
                    onPress={() => {
                      if (campaign.combat) {
                        setIsCombatModalVisible(true);
                      } else {
                        void handleStartCombat();
                      }
                    }}
                    style={styles.combatAction}
                  >
                    <Text style={styles.combatActionText}>
                      {isUpdatingCombat
                        ? 'Please wait...'
                        : campaign.combat
                          ? 'Resume Combat  ›'
                          : 'Start Combat  ›'}
                    </Text>
                  </Pressable>
                </View>
                {actionError && <Text style={styles.errorText}>{actionError}</Text>}

                <View accessibilityRole="tablist" style={styles.tabs}>
                  {CAMPAIGN_TABS.map((tab) => (
                    <Pressable
                      accessibilityRole="tab"
                      accessibilityState={{ selected: activeTab === tab }}
                      key={tab}
                      onPress={() => setActiveTab(tab)}
                      style={[styles.tab, activeTab === tab && styles.activeTab]}
                    >
                      <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                        {tab}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {activeTab === 'Party' ? (
                  <>
                    <View style={styles.sectionHeading}>
                      <Text style={styles.sectionTitle}>Your Party</Text>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          setActionError(null);
                          setCharacterPortraitUri(null);
                          setIsCharacterModalVisible(true);
                        }}
                        style={styles.addCharacterButton}
                      >
                        <Text style={styles.addCharacterText}>＋  Add Character</Text>
                      </Pressable>
                    </View>
                    {activeCharacters.length === 0 && storedCharacters.length === 0 ? (
                      <View style={styles.emptyPanel}>
                        <Text style={styles.emptyTitle}>Your party awaits</Text>
                        <Text style={styles.emptyDescription}>
                          Add characters to prepare your party and start combat.
                        </Text>
                      </View>
                    ) : (
                      <>
                        {activeCharacters.length > 0 ? (
                          activeCharacters.map(renderCharacterCard)
                        ) : (
                          <Text style={styles.rosterNote}>
                            No active characters. Restore a stored character or add someone new.
                          </Text>
                        )}
                        {storedCharacters.length > 0 && (
                          <>
                            <Text style={styles.rosterSubheading}>Stored Characters</Text>
                            {storedCharacters.map(renderCharacterCard)}
                          </>
                        )}
                      </>
                    )}
                  </>
                ) : activeTab === 'Graveyard' && deadCharacters.length > 0 ? (
                  deadCharacters.map(renderCharacterCard)
                ) : activeTab === 'History' && (campaign.combatHistory?.length ?? 0) > 0 ? (
                  [...(campaign.combatHistory ?? [])]
                    .reverse()
                    .map((entry, index) => (
                      <View
                        key={`${entry.startedAt}-${index}`}
                        style={styles.historyCard}
                      >
                        <Text style={styles.historyTitle}>
                          Combat · {entry.rounds} {entry.rounds === 1 ? 'round' : 'rounds'}
                        </Text>
                        <Text style={styles.historyDetails}>
                          {entry.participants.join(', ')}
                        </Text>
                        <Text style={styles.historyDate}>
                          {new Date(entry.endedAt).toLocaleDateString()}
                        </Text>
                      </View>
                    ))
                ) : (
                  <View style={styles.emptyPanel}>
                    <Text style={styles.emptyTitle}>
                      {activeTab === 'Graveyard' ? 'The Graveyard is empty' : activeTab}
                    </Text>
                    <Text style={styles.emptyDescription}>
                      {activeTab === 'Encounters'
                        ? 'Encounters for this campaign will appear here.'
                        : activeTab === 'Graveyard'
                          ? 'Fallen characters will be remembered here.'
                          : 'Completed combat records will appear here.'}
                    </Text>
                  </View>
                )}
              </ScrollView>
            </>
          )}
        </View>
      </ImageBackground>

      <Modal
        animationType="fade"
        onRequestClose={() => setIsCharacterModalVisible(false)}
        transparent
        visible={isCharacterModalVisible}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Add Character</Text>
              <Text style={styles.modalDescription}>Add a hero to this campaign&apos;s party.</Text>
              <TextInput
                accessibilityLabel="Character name"
                autoCapitalize="words"
                maxLength={40}
                onChangeText={setCharacterName}
                placeholder="Character name"
                placeholderTextColor="#A8987D"
                returnKeyType="next"
                style={styles.modalInput}
                value={characterName}
              />
              <Text style={styles.fieldLabel}>Class</Text>
              <View style={styles.classOptions}>
                {CHARACTER_CLASSES.map((className) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: characterClass === className }}
                    key={className}
                    onPress={() => setCharacterClass(className)}
                    style={[
                      styles.classOption,
                      characterClass === className && styles.selectedClassOption,
                    ]}
                  >
                    <Text
                      style={[
                        styles.classOptionText,
                        characterClass === className && styles.selectedClassOptionText,
                      ]}
                    >
                      {className}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={isPickingPortrait || isSavingCharacter}
                onPress={() => void handlePickCharacterPortrait()}
                style={styles.portraitPickerButton}
              >
                <Text style={styles.portraitPickerText}>
                  {isPickingPortrait
                    ? 'Opening Photos...'
                    : characterPortraitUri
                      ? 'Change Character Image'
                      : 'Add Character Image'}
                </Text>
              </Pressable>
              {characterPortraitUri && (
                <View style={styles.portraitPreviewRow}>
                  <Image
                    accessibilityLabel="Character portrait preview"
                    resizeMode="cover"
                    source={{ uri: characterPortraitUri }}
                    style={styles.portraitPreview}
                  />
                  <Pressable
                    accessibilityRole="button"
                    disabled={isSavingCharacter || isPickingPortrait}
                    onPress={() => setCharacterPortraitUri(null)}
                    style={styles.removePortraitButton}
                  >
                    <Text style={styles.removePortraitText}>Remove image</Text>
                  </Pressable>
                </View>
              )}
              <View style={styles.initiativeHeader}>
                <Text style={styles.fieldLabel}>Initiative Modifier</Text>
                <Text accessibilityLiveRegion="polite" style={styles.initiativeValue}>
                  {characterInitiative >= 0 ? '+' : ''}
                  {characterInitiative}
                </Text>
              </View>
              <Slider
                accessibilityLabel="Initiative modifier"
                accessibilityValue={{
                  min: -4,
                  max: 10,
                  now: characterInitiative,
                  text: `${characterInitiative >= 0 ? '+' : ''}${characterInitiative}`,
                }}
                key={initiativeSliderKey}
                maximumTrackTintColor="#5B513F"
                maximumValue={10}
                minimumTrackTintColor="#D9A64D"
                minimumValue={-4}
                onValueChange={(value) => setCharacterInitiative(Math.round(value))}
                step={1}
                style={styles.initiativeSlider}
                thumbTintColor="#F4DDAE"
                value={characterInitiative}
              />
              <View style={styles.sliderLimits}>
                <Text style={styles.sliderLimitText}>−4</Text>
                <Text style={styles.sliderLimitText}>+10</Text>
              </View>
              {actionError && <Text style={styles.errorText}>{actionError}</Text>}
              <View style={styles.modalActions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={isSavingCharacter || isPickingPortrait}
                  onPress={() => setIsCharacterModalVisible(false)}
                  style={styles.cancelButton}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={
                    !characterName.trim() ||
                    !characterClass.trim() ||
                    isSavingCharacter ||
                    isPickingPortrait
                  }
                  onPress={() => void handleAddCharacter()}
                  style={[
                    styles.saveButton,
                    (!characterName.trim() ||
                      !characterClass.trim() ||
                      isSavingCharacter ||
                      isPickingPortrait) &&
                      styles.disabledSaveButton,
                  ]}
                >
                  <Text style={styles.saveText}>
                    {isSavingCharacter ? 'Saving...' : 'Add to Party'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => {
          setIsCharacterMenuVisible(false);
          setIsEditingInitiative(false);
          setIsCharacterDeleteConfirmVisible(false);
        }}
        transparent
        visible={isCharacterMenuVisible && Boolean(selectedCharacter)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.characterActionsModal}>
            <Text style={styles.modalTitle}>
              {isCharacterDeleteConfirmVisible
                ? 'Delete Character?'
                : isEditingInitiative
                  ? 'Change Initiative'
                : selectedCharacter?.name ?? 'Character'}
            </Text>
            <Text style={styles.modalDescription}>
              {isCharacterDeleteConfirmVisible
                ? 'This permanently removes the character from this campaign.'
                : isEditingInitiative
                  ? 'Set the initiative modifier from −4 to +10.'
                : selectedCharacter?.status === 'dead'
                  ? 'This character is in the Graveyard.'
                  : selectedCharacter?.status === 'stored'
                    ? 'Stored characters are not included in combat.'
                    : 'Manage this character in your campaign.'}
            </Text>
            {isEditingInitiative && !isCharacterDeleteConfirmVisible ? (
              <>
                <View style={styles.initiativeHeader}>
                  <Text style={styles.fieldLabel}>Initiative Modifier</Text>
                  <Text accessibilityLiveRegion="polite" style={styles.initiativeValue}>
                    {editedInitiative >= 0 ? '+' : ''}
                    {editedInitiative}
                  </Text>
                </View>
                <Slider
                  accessibilityLabel="Initiative modifier"
                  accessibilityValue={{
                    min: -4,
                    max: 10,
                    now: editedInitiative,
                    text: `${editedInitiative >= 0 ? '+' : ''}${editedInitiative}`,
                  }}
                  maximumTrackTintColor="#5B513F"
                  maximumValue={10}
                  minimumTrackTintColor="#D9A64D"
                  minimumValue={-4}
                  onValueChange={(value) => setEditedInitiative(Math.round(value))}
                  step={1}
                  style={styles.initiativeSlider}
                  thumbTintColor="#F4DDAE"
                  value={editedInitiative}
                />
                <View style={styles.sliderLimits}>
                  <Text style={styles.sliderLimitText}>−4</Text>
                  <Text style={styles.sliderLimitText}>+10</Text>
                </View>
                <View style={styles.modalActions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isUpdatingCharacter}
                    onPress={() => setIsEditingInitiative(false)}
                    style={styles.cancelButton}
                  >
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isUpdatingCharacter}
                    onPress={() => void handleSaveInitiative()}
                    style={styles.saveButton}
                  >
                    <Text style={styles.saveText}>
                      {isUpdatingCharacter ? 'Saving...' : 'Save Initiative'}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : isCharacterDeleteConfirmVisible ? (
              <View style={styles.characterActionList}>
                <Pressable
                  accessibilityRole="button"
                  disabled={isUpdatingCharacter}
                  onPress={() => void handleDeleteCharacter()}
                  style={styles.deleteCharacterAction}
                >
                  <Text style={styles.deleteCharacterActionText}>
                    {isUpdatingCharacter ? 'Deleting...' : 'Delete Permanently'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={isUpdatingCharacter}
                  onPress={() => setIsCharacterDeleteConfirmVisible(false)}
                  style={styles.characterAction}
                >
                  <Text style={styles.characterActionText}>Cancel</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.characterActionList}>
                <Pressable
                  accessibilityRole="button"
                  disabled={isUpdatingCharacter}
                  onPress={() => {
                    setEditedInitiative(selectedCharacter?.initiative ?? 0);
                    setIsEditingInitiative(true);
                    setActionError(null);
                  }}
                  style={styles.characterAction}
                >
                  <Text style={styles.characterActionText}>Change Initiative</Text>
                </Pressable>
                {selectedCharacter?.status === 'active' && (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      disabled={isUpdatingCharacter}
                      onPress={() => void handleSetCharacterStatus('stored')}
                      style={styles.characterAction}
                    >
                      <Text style={styles.characterActionText}>Store Character</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={isUpdatingCharacter}
                      onPress={() => void handleSetCharacterStatus('dead')}
                      style={styles.deleteCharacterAction}
                    >
                      <Text style={styles.deleteCharacterActionText}>Kill Character</Text>
                    </Pressable>
                  </>
                )}
                {selectedCharacter?.status === 'stored' && (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      disabled={isUpdatingCharacter}
                      onPress={() => void handleSetCharacterStatus('active')}
                      style={styles.characterAction}
                    >
                      <Text style={styles.characterActionText}>Return to Party</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={isUpdatingCharacter}
                      onPress={() => void handleSetCharacterStatus('dead')}
                      style={styles.deleteCharacterAction}
                    >
                      <Text style={styles.deleteCharacterActionText}>Kill Character</Text>
                    </Pressable>
                  </>
                )}
                {selectedCharacter?.status === 'dead' && (
                  <Pressable
                    accessibilityRole="button"
                    disabled={isUpdatingCharacter}
                    onPress={() => void handleSetCharacterStatus('active')}
                    style={styles.characterAction}
                  >
                    <Text style={styles.characterActionText}>Revive to Party</Text>
                  </Pressable>
                )}
                <Pressable
                  accessibilityRole="button"
                  disabled={isUpdatingCharacter}
                  onPress={() => setIsCharacterDeleteConfirmVisible(true)}
                  style={styles.deleteCharacterAction}
                >
                  <Text style={styles.deleteCharacterActionText}>Delete Character</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={isUpdatingCharacter}
                  onPress={() => {
                    setIsCharacterMenuVisible(false);
                    setSelectedCharacter(null);
                  }}
                  style={styles.characterAction}
                >
                  <Text style={styles.characterActionText}>Cancel</Text>
                </Pressable>
              </View>
            )}
            {actionError && <Text style={styles.errorText}>{actionError}</Text>}
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setIsCombatModalVisible(false)}
        transparent
        visible={isCombatModalVisible && Boolean(campaign?.combat)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.combatModal}>
            <Text style={styles.modalTitle}>Combat</Text>
            <Text style={styles.combatRound}>Round {campaign?.combat?.round ?? 1}</Text>
            {currentCharacter && (
              <Text style={styles.currentTurn}>
                Current turn: {currentCharacter.name}
              </Text>
            )}
            <ScrollView style={styles.initiativeList}>
              {initiativeOrder.map((character, index) => (
                <View
                  key={character.id}
                  style={[
                    styles.initiativeRow,
                    character.id === campaign?.combat?.currentCharacterId &&
                      styles.currentInitiativeRow,
                  ]}
                >
                  <Text style={styles.initiativeRank}>{index + 1}</Text>
                  <Text numberOfLines={1} style={styles.initiativeName}>
                    {character.name}
                  </Text>
                  <Text style={styles.initiativeScore}>
                    {character.initiative >= 0 ? '+' : ''}
                    {character.initiative}
                  </Text>
                </View>
              ))}
            </ScrollView>
            {actionError && <Text style={styles.errorText}>{actionError}</Text>}
            <View style={styles.combatModalActions}>
              <Pressable
                accessibilityRole="button"
                disabled={isUpdatingCombat}
                onPress={() => void handleEndCombat()}
                style={styles.endCombatButton}
              >
                <Text style={styles.endCombatText}>End Combat</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isUpdatingCombat}
                onPress={() => void handleAdvanceCombat()}
                style={styles.saveButton}
              >
                <Text style={styles.saveText}>{isUpdatingCombat ? '...' : 'Next Turn  ›'}</Text>
              </Pressable>
            </View>
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
  page: {
    flex: 1,
    paddingHorizontal: '4.5%',
    paddingTop: '4%',
    paddingBottom: '3%',
  },
  backButton: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 10,
  },
  backArrow: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 42,
    lineHeight: 44,
  },
  backLabel: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 19,
  },
  content: {
    paddingBottom: 20,
  },
  hero: {
    height: 148,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#C69A50',
    borderRadius: 9,
    backgroundColor: '#07111B',
  },
  heroImage: {
    borderRadius: 8,
  },
  heroShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 6, 12, 0.35)',
  },
  heroTitle: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 36,
    fontWeight: '700',
    paddingHorizontal: 18,
    paddingBottom: 16,
    textShadowColor: '#000',
    textShadowRadius: 8,
  },
  combatBanner: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#C69A50',
    borderRadius: 8,
    backgroundColor: 'rgba(5, 14, 22, 0.94)',
  },
  combatBannerLabel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  combatIcon: {
    color: '#E8B95F',
    fontSize: 24,
  },
  combatBannerText: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 15,
  },
  combatAction: {
    paddingVertical: 12,
    paddingLeft: 8,
  },
  combatActionText: {
    color: '#E8B95F',
    fontFamily: 'serif',
    fontSize: 15,
    fontWeight: '600',
  },
  tabs: {
    flexDirection: 'row',
    marginTop: 14,
    borderBottomWidth: 1,
    borderColor: 'rgba(196, 151, 76, 0.6)',
  },
  tab: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#E8B95F',
  },
  tabText: {
    color: '#A8987D',
    fontFamily: 'serif',
    fontSize: 13,
  },
  activeTabText: {
    color: '#F4DDAE',
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 18,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 27,
    fontWeight: '700',
  },
  addCharacterButton: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#C69A50',
    borderRadius: 7,
    backgroundColor: 'rgba(5, 14, 22, 0.78)',
  },
  addCharacterText: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 14,
  },
  emptyPanel: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 26,
    borderWidth: 1,
    borderColor: 'rgba(196, 151, 76, 0.58)',
    borderRadius: 8,
    backgroundColor: 'rgba(5, 14, 22, 0.78)',
  },
  emptyTitle: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyDescription: {
    color: '#BDA476',
    fontFamily: 'serif',
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
  },
  characterCard: {
    height: 108,
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#C69A50',
    borderRadius: 8,
    backgroundColor: 'rgba(5, 14, 22, 0.88)',
  },
  characterPortrait: {
    width: 78,
    height: '100%',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#10202B',
    borderRightWidth: 1,
    borderRightColor: 'rgba(196, 151, 76, 0.45)',
  },
  characterPortraitImage: {
    width: 78,
    height: 106,
    flexShrink: 0,
  },
  characterInitial: {
    color: '#E8B95F',
    fontFamily: 'serif',
    fontSize: 34,
    fontWeight: '700',
  },
  characterInfo: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  characterMenuButton: {
    width: 42,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(196, 151, 76, 0.28)',
  },
  characterMenuDots: {
    color: '#F4DDAE',
    fontSize: 25,
    fontWeight: '700',
    lineHeight: 30,
  },
  rosterSubheading: {
    color: '#D9A64D',
    fontFamily: 'serif',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 10,
  },
  rosterNote: {
    color: '#BDA476',
    fontFamily: 'serif',
    fontSize: 14,
    marginBottom: 12,
  },
  characterName: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 21,
    fontWeight: '600',
  },
  characterClass: {
    color: '#BDA476',
    fontFamily: 'serif',
    fontSize: 14,
    marginTop: 1,
  },
  characterDivider: {
    height: 1,
    marginTop: 8,
    marginBottom: 7,
    backgroundColor: 'rgba(196, 151, 76, 0.42)',
  },
  characterStats: {
    color: '#C8B99D',
    fontFamily: 'serif',
    fontSize: 12,
  },
  historyCard: {
    marginBottom: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(196, 151, 76, 0.58)',
    borderRadius: 8,
    backgroundColor: 'rgba(5, 14, 22, 0.86)',
  },
  historyTitle: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 18,
    fontWeight: '600',
  },
  historyDetails: {
    color: '#BDA476',
    fontFamily: 'serif',
    fontSize: 14,
    marginTop: 4,
  },
  historyDate: {
    color: '#8D806B',
    fontFamily: 'serif',
    fontSize: 12,
    marginTop: 8,
  },
  statusContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  statusText: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 16,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#B78A43',
    borderRadius: 6,
  },
  retryText: {
    color: '#F4DDAE',
    fontFamily: 'serif',
  },
  backToCampaigns: {
    color: '#E8B95F',
    fontFamily: 'serif',
    marginTop: 14,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0, 5, 11, 0.84)',
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    padding: 22,
    borderWidth: 1,
    borderColor: '#C69A50',
    borderRadius: 12,
    backgroundColor: '#07111B',
  },
  combatModal: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '82%',
    alignSelf: 'center',
    padding: 22,
    borderWidth: 1,
    borderColor: '#C69A50',
    borderRadius: 12,
    backgroundColor: '#07111B',
  },
  characterActionsModal: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    padding: 22,
    borderWidth: 1,
    borderColor: '#C69A50',
    borderRadius: 12,
    backgroundColor: '#07111B',
  },
  characterActionList: {
    gap: 8,
    marginTop: 18,
  },
  characterAction: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#8E703F',
    borderRadius: 6,
    backgroundColor: 'rgba(167, 122, 49, 0.14)',
  },
  characterActionText: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 15,
  },
  deleteCharacterAction: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#9B5147',
    borderRadius: 6,
    backgroundColor: 'rgba(155, 81, 71, 0.16)',
  },
  deleteCharacterActionText: {
    color: '#F0A59B',
    fontFamily: 'serif',
    fontSize: 15,
  },
  modalTitle: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 25,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalDescription: {
    color: '#BDA476',
    fontFamily: 'serif',
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
  },
  modalInput: {
    minWidth: 0,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#8E703F',
    borderRadius: 6,
    color: '#F4DDAE',
    fontSize: 16,
  },
  portraitPickerButton: {
    alignItems: 'center',
    marginTop: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#8E703F',
    borderRadius: 6,
    backgroundColor: 'rgba(167, 122, 49, 0.14)',
  },
  portraitPickerText: {
    color: '#F4DDAE',
    fontSize: 15,
    fontWeight: '600',
  },
  portraitPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  portraitPreview: {
    width: 64,
    height: 64,
    flexShrink: 0,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E8B95F',
    borderRadius: 6,
  },
  removePortraitButton: {
    paddingVertical: 10,
  },
  removePortraitText: {
    color: '#F0A59B',
    fontSize: 14,
  },
  fieldLabel: {
    color: '#D0BE9C',
    fontFamily: 'serif',
    fontSize: 13,
  },
  classOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  classOption: {
    width: '47%',
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#8E703F',
    borderRadius: 6,
    backgroundColor: 'rgba(5, 14, 22, 0.8)',
  },
  selectedClassOption: {
    borderColor: '#E8B95F',
    backgroundColor: 'rgba(167, 122, 49, 0.24)',
  },
  classOptionText: {
    color: '#D0BE9C',
    fontFamily: 'serif',
    fontSize: 14,
  },
  selectedClassOptionText: {
    color: '#FFF3D5',
    fontWeight: '600',
  },
  initiativeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  initiativeValue: {
    color: '#E8B95F',
    fontFamily: 'serif',
    fontSize: 20,
    fontWeight: '700',
  },
  initiativeSlider: {
    width: '100%',
    height: 40,
    marginTop: 4,
  },
  sliderLimits: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  sliderLimitText: {
    color: '#8D806B',
    fontFamily: 'serif',
    fontSize: 12,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
  },
  cancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  cancelText: {
    color: '#D0BE9C',
    fontSize: 15,
  },
  saveButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 6,
    backgroundColor: '#A77A31',
  },
  disabledSaveButton: {
    opacity: 0.45,
  },
  saveText: {
    color: '#FFF3D5',
    fontSize: 15,
    fontWeight: '600',
  },
  errorText: {
    color: '#F0A59B',
    marginTop: 8,
  },
  combatRound: {
    color: '#E8B95F',
    fontFamily: 'serif',
    fontSize: 18,
    marginTop: 8,
    textAlign: 'center',
  },
  currentTurn: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 15,
    marginTop: 6,
    textAlign: 'center',
  },
  initiativeList: {
    marginTop: 14,
  },
  initiativeRow: {
    minHeight: 45,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(196, 151, 76, 0.35)',
  },
  currentInitiativeRow: {
    borderRadius: 5,
    backgroundColor: 'rgba(167, 122, 49, 0.24)',
  },
  initiativeRank: {
    width: 20,
    color: '#BDA476',
    fontFamily: 'serif',
    fontSize: 15,
  },
  initiativeName: {
    flex: 1,
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 16,
  },
  initiativeScore: {
    color: '#E8B95F',
    fontFamily: 'serif',
    fontSize: 15,
  },
  combatModalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 18,
  },
  endCombatButton: {
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  endCombatText: {
    color: '#F0A59B',
    fontSize: 14,
  },
});
