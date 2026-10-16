import { getCampaignCoverSource } from '@/constants/campaign-covers';
import {
  addCampaignCharacter,
  advanceCampaignCombat,
  deleteCampaignCharacter,
  deleteCampaignEncounter,
  endCampaignCombat,
  loadCampaigns,
  saveCampaignCustomEnemyPreset,
  saveCampaignEncounter,
  setCampaignCharacterStatus,
  sortCampaignCombatants,
  updateCampaignCombatantHp,
  updateCampaignCharacterArmorClass,
  updateCampaignCharacterInitiative,
  type Campaign,
  type CampaignCharacter,
  type CampaignCombatAlly,
  type CampaignCustomEnemyPreset,
  type CampaignEncounterBackgroundId,
  type CampaignEncounterEnemyInput,
  type CampaignEncounter,
} from '@/storage/campaigns';
import {
  claimOnlineLobbyCharacter,
  closeOnlineCombatLobby,
  createOnlineCombatLobby,
  isLobbyCurrentForEncounter,
  loadOnlineLobbySnapshot,
  resetDmInitiative,
  restoreLastOnlineLobby,
  startOnlineCombat,
  submitDmInitiative,
  subscribeToOnlineCombatLobby,
  type OnlineLobbySnapshot,
} from '@/storage/online-lobbies';

import {
  ensureSupabaseIdentity,
  isSupabaseConfigured,
  type SupabaseIdentity,
} from '@/lib/supabase';
import Slider from '@react-native-community/slider';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { SymbolView } from 'expo-symbols';
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
  type ImageSourcePropType,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ACTIVE_TURN_FRAME = require('../../../assets/images/active-turn-frame-wide.png');



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
type CharacterPreset = {
  id: string;
  name: string;
  race: string;
  className: string;
  source: ImageSourcePropType;
};
const CHARACTER_PRESETS: CharacterPreset[] = [
  {
    id: 'dragonborn-wizard',
    name: 'Dragonborn Mage',
    race: 'Dragonborn',
    className: 'Wizard',
    source: require('../../../assets/images/character-presets/dragonborn-wizard.jpg'),
  },
  {
    id: 'tiefling-bard',
    name: 'Tiefling Bard',
    race: 'Tiefling',
    className: 'Bard',
    source: require('../../../assets/images/character-presets/tiefling-bard.jpg'),
  },
  {
    id: 'halfling-rogue',
    name: 'Halfling Rogue',
    race: 'Halfling',
    className: 'Rogue',
    source: require('../../../assets/images/character-presets/halfling-rogue.jpg'),
  },
  {
    id: 'dwarf-cleric',
    name: 'Dwarf Cleric',
    race: 'Dwarf',
    className: 'Cleric',
    source: require('../../../assets/images/character-presets/dwarf-cleric.jpg'),
  },
  {
    id: 'elf-ranger',
    name: 'Elf Ranger',
    race: 'Elf',
    className: 'Ranger',
    source: require('../../../assets/images/character-presets/elf-ranger.jpg'),
  },
  {
    id: 'human-fighter',
    name: 'Human Knight',
    race: 'Human',
    className: 'Fighter',
    source: require('../../../assets/images/character-presets/human-fighter.jpg'),
  },
];
const ENCOUNTER_ARTWORK = [
  require('../../../assets/images/campaign-cover-haunted-city.jpg'),
  require('../../../assets/images/campaign-cover-desert-ruins.jpg'),
  require('../../../assets/images/campaign-cover-sunlit-bay.jpg'),
];
const COMBAT_BACKGROUND_PRESETS: {
  id: CampaignEncounterBackgroundId;
  name: string;
  source: ImageSourcePropType;
}[] = [
  {
    id: 'haunted-city',
    name: 'Haunted City',
    source: require('../../../assets/images/Haunted city under violet moonlight-6.png'),
  },
  {
    id: 'moonlit-forest',
    name: 'Moonlit Forest',
    source: require('../../../assets/images/Moonlit Enchanted Forest-3.png'),
  },
  {
    id: 'frozen-fortress',
    name: 'Frozen Fortress',
    source: require('../../../assets/images/Fortress Beneath the Frozen Peaks-4.png'),
  },
  {
    id: 'desert-ruins',
    name: 'Desert Ruins',
    source: require('../../../assets/images/Turquoise Light in Desert Ruins-5.png'),
  },
  {
    id: 'rose-castle',
    name: 'Rosecourt Castle',
    source: require('../../../assets/images/Rosecourt Castle at Sunset-2.png'),
  },
  {
    id: 'sunlit-harbor',
    name: 'Sunlit Harbor',
    source: require('../../../assets/images/Turquoise Bay and Sunlit Harbor-1.png'),
  },
];
const ENEMY_PRESETS = [
  {
    id: 'owlbear',
    name: 'Owlbear',
    initiative: 1,
    source: require('../../../assets/images/encounter-enemies/owlbear.png'),
  },
  {
    id: 'zombie',
    name: 'Zombie',
    initiative: -2,
    source: require('../../../assets/images/encounter-enemies/zombie.png'),
  },
  {
    id: 'lich',
    name: 'Lich',
    initiative: 2,
    source: require('../../../assets/images/encounter-enemies/lich.jpg'),
  },
  {
    id: 'dragon',
    name: 'Dragon',
    initiative: 2,
    source: require('../../../assets/images/encounter-enemies/dragon.jpg'),
  },
  {
    id: 'cultist',
    name: 'Cultist',
    initiative: 1,
    source: require('../../../assets/images/encounter-enemies/cultist.jpg'),
  },
  {
    id: 'knight',
    name: 'Knight',
    initiative: 0,
    source: require('../../../assets/images/encounter-enemies/knight.jpg'),
  },
  {
    id: 'necromancer',
    name: 'Necromancer',
    initiative: 2,
    source: require('../../../assets/images/encounter-enemies/necromancer.jpg'),
  },
  {
    id: 'bandit',
    name: 'Bandit',
    initiative: 2,
    source: require('../../../assets/images/encounter-enemies/bandit.jpg'),
  },
  {
    id: 'vampire',
    name: 'Vampire',
    initiative: 3,
    source: require('../../../assets/images/encounter-enemies/vampire.jpg'),
  },
  {
    id: 'ogre',
    name: 'Ogre',
    initiative: -1,
    source: require('../../../assets/images/encounter-enemies/ogre.jpg'),
  },
  {
    id: 'spider',
    name: 'Spider',
    initiative: 3,
    source: require('../../../assets/images/encounter-enemies/spider.jpg'),
  },
  {
    id: 'wolf',
    name: 'Wolf',
    initiative: 2,
    source: require('../../../assets/images/encounter-enemies/wolf.jpg'),
  },
  {
    id: 'goblin',
    name: 'Goblin',
    initiative: 2,
    source: require('../../../assets/images/encounter-enemies/goblin.png'),
  },
  {
    id: 'skeleton',
    name: 'Skeleton',
    initiative: 2,
    source: require('../../../assets/images/encounter-enemies/skeleton.png'),
  },
  {
    id: 'mimic',
    name: 'Mimic',
    initiative: 0,
    source: require('../../../assets/images/encounter-enemies/mimic.png'),
  },
];

type EnemyForm = {
  name: string;
  imageId: string;
  imageUri?: string;
  armorClass: string;
  quantity: string;
  initiative: string;
  initiativeMode: 'individual' | 'horde';
  arrivalMode: 'round' | 'dm';
  arrivalRound: string;
  arrivalNote: string;
  maxHp: string;
};

function getEnemyImage(imageId?: string, customPresets: CampaignCustomEnemyPreset[] = []) {
  const customPreset = customPresets.find((preset) => preset.id === imageId);
  if (customPreset) return { uri: customPreset.imageUri };
  return ENEMY_PRESETS.find((preset) => preset.id === imageId)?.source ??
    ENEMY_PRESETS[4].source;
}

type InitiativeEntry = {
  id: string;
  name: string;
  initiative: number;
  initiativeRoll?: number;
  initiativeBonus?: number;
  initiativeTotal?: number;
  className?: string;
  race?: string;
  portraitUri?: string | null;
  portraitPresetId?: string;
  imageId?: string;
  armorClass?: number;
  maxHp?: number;
  currentHp?: number;
};

function CombatIcon({
  name,
  size = 18,
  color = '#E8B95F',
}: {
  name: 'arrow.left' | 'arrow.right' | 'checkmark' | 'ellipsis' | 'minus' | 'plus';
  size?: number;
  color?: string;
}) {
  const androidNames = {
    'arrow.left': 'arrow_back',
    'arrow.right': 'arrow_forward',
    checkmark: 'check',
    ellipsis: 'more_horiz',
    minus: 'remove',
    plus: 'add',
  } as const;
  return (
    <SymbolView
      name={{ ios: name, android: androidNames[name], web: androidNames[name] }}
      size={size}
      tintColor={color}
      weight="medium"
    />
  );
}

function getCharacterPortraitSource(
  portraitPresetId?: string,
  portraitUri?: string | null,
): ImageSourcePropType | undefined {
  const preset = CHARACTER_PRESETS.find((item) => item.id === portraitPresetId);
  if (preset) return preset.source;
  return portraitUri ? { uri: portraitUri } : undefined;
}

function CharacterPresetPicker({
  selectedPresetId,
  onSelect,
}: {
  selectedPresetId: string | null;
  onSelect: (preset: CharacterPreset) => void;
}) {
  return (
    <View style={styles.characterPresetSection}>
      <Text style={styles.fieldLabel}>Character presets</Text>
      <Text style={styles.characterPresetHint}>
        Choose a portrait preset or enter a custom character below.
      </Text>
      <View style={styles.characterPresetGrid}>
        {CHARACTER_PRESETS.map((preset) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: selectedPresetId === preset.id }}
            key={preset.id}
            onPress={() => onSelect(preset)}
            style={[
              styles.characterPresetCard,
              selectedPresetId === preset.id && styles.characterPresetCardSelected,
            ]}
          >
            <Image
              accessibilityLabel={`${preset.name} preset portrait`}
              resizeMode="cover"
              source={preset.source}
              style={styles.characterPresetImage}
            />
            <Text numberOfLines={1} style={styles.characterPresetName}>
              {preset.name}
            </Text>
            <Text numberOfLines={1} style={styles.characterPresetClass}>
              {preset.race} · {preset.className}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function CampaignDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [activeTab, setActiveTab] = useState<CampaignTab>('Party');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isCharacterModalVisible, setIsCharacterModalVisible] = useState(false);
  const [characterName, setCharacterName] = useState('');
  const [characterRace, setCharacterRace] = useState('');
  const [characterClass, setCharacterClass] = useState('');
  const [characterArmorClass, setCharacterArmorClass] = useState('10');
  const [characterInitiative, setCharacterInitiative] = useState(0);
  const [initiativeSliderKey, setInitiativeSliderKey] = useState(0);
  const [characterPortraitUri, setCharacterPortraitUri] = useState<string | null>(null);
  const [characterPortraitPresetId, setCharacterPortraitPresetId] = useState<string | null>(null);
  const [isPickingPortrait, setIsPickingPortrait] = useState(false);
  const [isSavingCharacter, setIsSavingCharacter] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<CampaignCharacter | null>(null);
  const [isCharacterMenuVisible, setIsCharacterMenuVisible] = useState(false);
  const [isEditingInitiative, setIsEditingInitiative] = useState(false);
  const [editedInitiative, setEditedInitiative] = useState(0);
  const [isEditingArmorClass, setIsEditingArmorClass] = useState(false);
  const [editedArmorClass, setEditedArmorClass] = useState('10');
  const [isCharacterDeleteConfirmVisible, setIsCharacterDeleteConfirmVisible] = useState(false);
  const [isUpdatingCharacter, setIsUpdatingCharacter] = useState(false);
  const [isCombatModalVisible, setIsCombatModalVisible] = useState(false);
  const [isUpdatingCombat, setIsUpdatingCombat] = useState(false);
  const [isEncounterEditorVisible, setIsEncounterEditorVisible] = useState(false);
  const [editingEncounterId, setEditingEncounterId] = useState<string | null>(null);
  const [encounterName, setEncounterName] = useState('');
  const [encounterBackgroundId, setEncounterBackgroundId] =
    useState<CampaignEncounterBackgroundId | null>(null);
  const [encounterEditorTab, setEncounterEditorTab] =
    useState<'prepare' | 'reinforcements'>('prepare');
  const [encounterEnemies, setEncounterEnemies] = useState<CampaignEncounterEnemyInput[]>([]);
  const [encounterAllies, setEncounterAllies] = useState<CampaignCombatAlly[]>([]);
  const [isSavingEncounter, setIsSavingEncounter] = useState(false);
  const [isDeletingEncounter, setIsDeletingEncounter] = useState(false);
  const [isDeleteEncounterConfirmVisible, setIsDeleteEncounterConfirmVisible] = useState(false);
  const [onlineIdentity, setOnlineIdentity] = useState<SupabaseIdentity | null>(null);
  const [onlineLobby, setOnlineLobby] = useState<OnlineLobbySnapshot | null>(null);
  const [isOnlineLobbyVisible, setIsOnlineLobbyVisible] = useState(false);
  const [isOnlineLobbyBusy, setIsOnlineLobbyBusy] = useState(false);
  const [onlineLobbyError, setOnlineLobbyError] = useState<string | null>(null);
  const [selectedOnlineInitiativeKeys, setSelectedOnlineInitiativeKeys] = useState<string[]>([]);
  const [onlineInitiativeInputs, setOnlineInitiativeInputs] = useState<Record<string, string>>({});
  const [isEnemyPickerVisible, setIsEnemyPickerVisible] = useState(false);
  const [enemySearch, setEnemySearch] = useState('');
  const [enemyForm, setEnemyForm] = useState<EnemyForm | null>(null);
  const [editingEnemyIndex, setEditingEnemyIndex] = useState<number | null>(null);
  const [enemyFormError, setEnemyFormError] = useState<string | null>(null);
  const [isPickingEnemyImage, setIsPickingEnemyImage] = useState(false);
  const [isSavingEnemyPreset, setIsSavingEnemyPreset] = useState(false);
  const [selectedEncounter, setSelectedEncounter] = useState<CampaignEncounter | null>(null);
  const [isAddingCombatAlly, setIsAddingCombatAlly] = useState(false);
  const [combatAllyName, setCombatAllyName] = useState('');
  const [combatAllyRace, setCombatAllyRace] = useState('');
  const [combatAllyClass, setCombatAllyClass] = useState('');
  const [combatAllyArmorClass, setCombatAllyArmorClass] = useState('10');
  const [combatAllyInitiative, setCombatAllyInitiative] = useState(0);
  const [combatAllyMaxHp, setCombatAllyMaxHp] = useState('10');
  const [combatAllyPortraitUri, setCombatAllyPortraitUri] = useState<string | null>(null);
  const [combatAllyPortraitPresetId, setCombatAllyPortraitPresetId] = useState<string | null>(null);
  const [isPickingCombatAllyPortrait, setIsPickingCombatAllyPortrait] = useState(false);
  const [isSavingCombatAlly, setIsSavingCombatAlly] = useState(false);
  const [combatAllyError, setCombatAllyError] = useState<string | null>(null);

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
      setCharacterPortraitPresetId(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Portrait could not be selected.');
    } finally {
      setIsPickingPortrait(false);
    }
  }

  function openCombatAllyForm() {
    setCombatAllyName('');
    setCombatAllyRace('');
    setCombatAllyClass('');
    setCombatAllyArmorClass('10');
    setCombatAllyInitiative(0);
    setCombatAllyMaxHp('10');
    setCombatAllyPortraitUri(null);
    setCombatAllyPortraitPresetId(null);
    setCombatAllyError(null);
    setIsAddingCombatAlly(true);
  }

  function chooseCharacterPreset(preset: CharacterPreset) {
    setCharacterName(preset.name);
    setCharacterRace(preset.race);
    setCharacterClass(preset.className);
    setCharacterPortraitUri(null);
    setCharacterPortraitPresetId(preset.id);
  }

  function chooseCombatAllyPreset(preset: CharacterPreset) {
    setCombatAllyName(preset.name);
    setCombatAllyRace(preset.race);
    setCombatAllyClass(preset.className);
    setCombatAllyPortraitUri(null);
    setCombatAllyPortraitPresetId(preset.id);
  }

  async function handlePickCombatAllyPortrait() {
    setIsPickingCombatAllyPortrait(true);
    setCombatAllyError(null);
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
      let sourceUri = asset.uri;
      if (Platform.OS === 'web') {
        if (!asset.base64) {
          throw new Error('The ally photo could not be read. Please choose it again.');
        }
        sourceUri = `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`;
      }
      const cropSize = Math.min(asset.width, asset.height);
      if (cropSize < 1) throw new Error('The selected ally photo has invalid dimensions.');

      const manipulator = ImageManipulator.manipulate(sourceUri);
      manipulator
        .crop({
          originX: Math.floor((asset.width - cropSize) / 2),
          originY: Math.floor((asset.height - cropSize) / 2),
          width: cropSize,
          height: cropSize,
        })
        .resize({ width: 384, height: 384 });
      const renderedImage = await manipulator.renderAsync();
      const resizedImage = await renderedImage.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.72,
        base64: Platform.OS === 'web',
      });
      let portraitUri = resizedImage.uri;
      if (Platform.OS === 'web') {
        if (!resizedImage.base64) {
          throw new Error('The resized ally photo could not be saved. Please choose it again.');
        }
        portraitUri = `data:image/jpeg;base64,${resizedImage.base64}`;
      }
      setCombatAllyPortraitUri(portraitUri);
      setCombatAllyPortraitPresetId(null);
    } catch (error) {
      setCombatAllyError(
        error instanceof Error ? error.message : 'Ally photo could not be selected.',
      );
    } finally {
      setIsPickingCombatAllyPortrait(false);
    }
  }

  async function handleAddCombatAlly() {
    if (isSavingCombatAlly) return;
    if (!combatAllyName.trim()) {
      setCombatAllyError('Enter an ally name.');
      return;
    }
    if (!combatAllyClass) {
      setCombatAllyError('Choose an ally class.');
      return;
    }
    const maxHp = Number(combatAllyMaxHp);
    if (!Number.isInteger(maxHp) || maxHp < 1 || maxHp > 9999) {
      setCombatAllyError('HP must be a whole number from 1 to 9999.');
      return;
    }
    const armorClass = Number(combatAllyArmorClass);
    if (!Number.isInteger(armorClass) || armorClass < 1 || armorClass > 40) {
      setCombatAllyError('AC must be a whole number from 1 to 40.');
      return;
    }

    setIsSavingCombatAlly(true);
    setCombatAllyError(null);
    try {
      const ally: CampaignCombatAlly = {
        id: `combat-ally-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
        name: combatAllyName,
        className: combatAllyClass,
        ...(combatAllyRace.trim() ? { race: combatAllyRace.trim() } : {}),
        initiative: combatAllyInitiative,
        armorClass,
        portraitUri: combatAllyPortraitUri,
        ...(combatAllyPortraitPresetId
          ? { portraitPresetId: combatAllyPortraitPresetId }
          : {}),
        maxHp,
      };
      setEncounterAllies((current) => [...current, ally]);
      setIsAddingCombatAlly(false);
    } catch (error) {
      setCombatAllyError(
        error instanceof Error ? error.message : 'Temporary ally could not be added.',
      );
    } finally {
      setIsSavingCombatAlly(false);
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

  useEffect(() => {
    let isActive = true;
    if (!isSupabaseConfigured()) {
      return () => {
        isActive = false;
      };
    }

    void ensureSupabaseIdentity()
      .then((identity) => {
        if (isActive) setOnlineIdentity(identity);
      })
      .catch((error: unknown) => {
        if (isActive) {
          setOnlineLobbyError(
            error instanceof Error ? error.message : 'Online device identity could not be created.',
          );
        }
      });
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const lobbyId = onlineLobby?.lobby_id;
    if (!onlineIdentity || !lobbyId || !isOnlineLobbyVisible) return;
    let isActive = true;
    let isRefreshing = false;
    let refreshAgain = false;
    const refreshSnapshot = async () => {
      if (isRefreshing) {
        refreshAgain = true;
        return;
      }
      isRefreshing = true;
      do {
        refreshAgain = false;
        try {
          const snapshot = await loadOnlineLobbySnapshot(onlineIdentity, lobbyId);
          if (isActive) setOnlineLobby(snapshot);
        } catch (error) {
          if (isActive) {
            setOnlineLobbyError(
              error instanceof Error ? error.message : 'Online lobby could not be refreshed.',
            );
          }
        }
      } while (isActive && refreshAgain);
      isRefreshing = false;
    };
    const unsubscribe = subscribeToOnlineCombatLobby(
      onlineIdentity,
      lobbyId,
      () => void refreshSnapshot(),
      (message) => {
        if (isActive) setOnlineLobbyError(message);
      },
    );
    void refreshSnapshot();
    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [onlineIdentity, onlineLobby?.lobby_id, isOnlineLobbyVisible]);

  const campaignId = campaign?.id;
  useEffect(() => {
    if (!onlineIdentity || !campaignId) return;
    let isActive = true;
    void restoreLastOnlineLobby(onlineIdentity)
      .then((snapshot) => {
        if (
          isActive &&
          snapshot?.role === 'dm' &&
          snapshot.owner_id === onlineIdentity.userId &&
          snapshot.status === 'open'
        ) {
          setOnlineLobby(snapshot);
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setOnlineLobbyError(
            error instanceof Error ? error.message : 'Saved online lobby could not be restored.',
          );
        }
      });
    return () => {
      isActive = false;
    };
  }, [campaignId, onlineIdentity]);

  async function handleAddCharacter() {
    if (!campaign || isSavingCharacter) return;
    const armorClass = Number(characterArmorClass);
    if (!Number.isInteger(armorClass) || armorClass < 1 || armorClass > 40) {
      setActionError('AC must be a whole number from 1 to 40.');
      return;
    }
    setIsSavingCharacter(true);
    setActionError(null);
    try {
      const updatedCampaign = await addCampaignCharacter(campaign.id, {
        name: characterName,
        race: characterRace.trim(),
        className: characterClass,
        initiative: characterInitiative,
        armorClass,
        portraitUri: characterPortraitUri,
        ...(characterPortraitPresetId
          ? { portraitPresetId: characterPortraitPresetId }
          : {}),
      });
      setCampaign(updatedCampaign);
      setCharacterName('');
      setCharacterRace('');
      setCharacterClass('');
      setCharacterArmorClass('10');
      setCharacterInitiative(0);
      setInitiativeSliderKey((key) => key + 1);
      setCharacterPortraitUri(null);
      setCharacterPortraitPresetId(null);
      setIsCharacterModalVisible(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Character could not be saved.');
    } finally {
      setIsSavingCharacter(false);
    }
  }

  async function handleSetCharacterStatus(
    status: 'active' | 'stored' | 'dead',
    character = selectedCharacter,
  ) {
    if (!campaign || !character || isUpdatingCharacter) return;
    setIsUpdatingCharacter(true);
    setActionError(null);
    try {
      const updatedCampaign = await setCampaignCharacterStatus(
        campaign.id,
        character.id,
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

  async function handleSaveArmorClass() {
    if (!campaign || !selectedCharacter || isUpdatingCharacter) return;
    const armorClass = Number(editedArmorClass);
    if (!Number.isInteger(armorClass) || armorClass < 1 || armorClass > 40) {
      setActionError('AC must be a whole number from 1 to 40.');
      return;
    }
    setIsUpdatingCharacter(true);
    setActionError(null);
    try {
      const updatedCampaign = await updateCampaignCharacterArmorClass(
        campaign.id,
        selectedCharacter.id,
        armorClass,
      );
      const updatedCharacter = (updatedCampaign.characters ?? []).find(
        (character) => character.id === selectedCharacter.id,
      );
      setCampaign(updatedCampaign);
      if (updatedCharacter) setSelectedCharacter(updatedCharacter);
      setIsEditingArmorClass(false);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'AC could not be updated.',
      );
    } finally {
      setIsUpdatingCharacter(false);
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

  async function handleAdjustCombatantHp(
    combatantId: string,
    currentHp: number,
    maxHp: number,
    delta: number,
  ) {
    if (!campaign || isUpdatingCombat) return;
    const nextHp = Math.max(0, Math.min(maxHp, currentHp + delta));
    if (nextHp === currentHp) return;
    setIsUpdatingCombat(true);
    setActionError(null);
    try {
      setCampaign(await updateCampaignCombatantHp(campaign.id, combatantId, nextHp));
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Combatant HP could not be updated.',
      );
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

  function openEncounterEditor(encounter?: CampaignEncounter) {
    setActionError(null);
    setEditingEncounterId(encounter?.id ?? null);
    setEncounterName(encounter?.name ?? '');
    setEncounterBackgroundId(encounter?.backgroundId ?? null);
    setEncounterEditorTab('prepare');
    setEncounterEnemies(
      encounter?.enemies.map((enemy) => ({
        name: enemy.name,
        imageId: enemy.imageId ?? 'skeleton',
        imageUri: campaign?.customEnemyPresets?.find((preset) => preset.id === enemy.imageId)
          ?.imageUri,
        armorClass: enemy.armorClass ?? 10,
        quantity: enemy.quantity ?? 1,
        initiative: enemy.initiative,
        initiativeMode: enemy.initiativeMode ?? 'individual',
        arrivalMode: enemy.arrivalMode ??
          (enemy.status === 'scheduled' && (enemy.arrivalRound ?? 1) === 1 ? 'dm' : 'round'),
        arrivalRound: enemy.arrivalRound ?? 1,
        arrivalNote: enemy.arrivalNote ?? '',
        maxHp: enemy.maxHp ?? 10,
      })) ?? [],
    );
    setEncounterAllies(
      (encounter?.allies ?? []).map((ally) => ({
        ...ally,
        maxHp: ally.maxHp ?? 10,
        currentHp: undefined,
      })),
    );
    setIsEnemyPickerVisible(false);
    setEnemyForm(null);
    setEnemySearch('');
    setIsEncounterEditorVisible(true);
  }

  async function handleSaveEncounter(status: 'draft' | 'ready') {
    if (!campaign || isSavingEncounter) return;
    setIsSavingEncounter(true);
    setActionError(null);
    try {
      const updatedCampaign = await saveCampaignEncounter(
        campaign.id,
        editingEncounterId,
        encounterName,
        encounterEnemies,
        status,
        encounterAllies,
        encounterBackgroundId ?? undefined,
      );
      setCampaign(updatedCampaign);
      setIsEncounterEditorVisible(false);
      setEditingEncounterId(null);
      setEncounterName('');
      setEncounterEnemies([]);
      setEncounterAllies([]);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Encounter could not be saved.');
    } finally {
      setIsSavingEncounter(false);
    }
  }

  async function handleSaveEncounterAndOpenLobby() {
    if (!campaign || isSavingEncounter) return;
    setIsSavingEncounter(true);
    setActionError(null);
    try {
      const updatedCampaign = await saveCampaignEncounter(
        campaign.id,
        editingEncounterId,
        encounterName,
        encounterEnemies,
        'ready',
        encounterAllies,
        encounterBackgroundId ?? undefined,
      );
      const encounter =
        updatedCampaign.encounters?.find((item) => item.id === editingEncounterId) ??
        updatedCampaign.encounters?.[updatedCampaign.encounters.length - 1];
      if (!encounter) throw new Error('The encounter could not be loaded after saving.');
      setCampaign(updatedCampaign);
      await openOnlineLobbyForEncounter(updatedCampaign, encounter);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'The encounter was saved, but its online lobby could not be opened.',
      );
    } finally {
      setIsSavingEncounter(false);
    }
  }

  function openEnemyPicker(enemy?: CampaignEncounterEnemyInput, index?: number) {
    setEnemyFormError(null);
    setEnemySearch('');
    setEditingEnemyIndex(index ?? null);
    setEnemyForm(
      enemy
        ? {
            name: enemy.name,
            imageId: enemy.imageId,
            imageUri: enemy.imageUri ??
              campaign?.customEnemyPresets?.find((preset) => preset.id === enemy.imageId)
                ?.imageUri,
            armorClass: String(enemy.armorClass ?? 10),
            quantity: String(enemy.quantity),
            initiative: String(enemy.initiative),
            initiativeMode: enemy.initiativeMode,
            arrivalMode: enemy.arrivalMode ?? 'round',
            arrivalRound: String(enemy.arrivalRound ?? 1),
            arrivalNote: enemy.arrivalNote ?? '',
            maxHp: String(enemy.maxHp ?? 10),
          }
        : null,
    );
    setIsEnemyPickerVisible(true);
  }

  function chooseEnemyPreset(presetId: string) {
    const preset = ENEMY_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setEnemyForm((current) => {
      const presetChanged = current?.imageId !== preset.id;
      return {
        name: !current || presetChanged ? preset.name : current.name,
        imageId: preset.id,
        armorClass: current?.armorClass ?? '10',
        quantity: current?.quantity ?? '1',
        initiative: !current || presetChanged
          ? String(preset.initiative)
          : current.initiative,
        initiativeMode: current?.initiativeMode ?? 'individual',
        arrivalMode: current?.arrivalMode ?? 'round',
        arrivalRound: current?.arrivalRound ?? '1',
        arrivalNote: current?.arrivalNote ?? '',
        maxHp: current?.maxHp ?? '10',
      };
    });
    setEnemyFormError(null);
  }

  function chooseCustomEnemyPreset(preset: CampaignCustomEnemyPreset) {
    setEnemyForm((current) => {
      const presetChanged = current?.imageId !== preset.id;
      return {
        name: !current || presetChanged ? preset.name : current.name,
        imageId: preset.id,
        imageUri: preset.imageUri,
        armorClass: current?.armorClass ?? '10',
        quantity: current?.quantity ?? '1',
        initiative: !current || presetChanged
          ? String(preset.initiative)
          : current.initiative,
        initiativeMode: current?.initiativeMode ?? 'individual',
        arrivalMode: current?.arrivalMode ?? 'round',
        arrivalRound: current?.arrivalRound ?? '1',
        arrivalNote: current?.arrivalNote ?? '',
        maxHp: current?.maxHp ?? '10',
      };
    });
    setEnemyFormError(null);
  }

  async function handlePickCustomEnemyImage() {
    setIsPickingEnemyImage(true);
    setEnemyFormError(null);
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
      let sourceUri = asset.uri;
      if (Platform.OS === 'web') {
        if (!asset.base64) {
          throw new Error('The selected enemy photo could not be read. Please choose it again.');
        }
        sourceUri = `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`;
      }

      const cropSize = Math.min(asset.width, asset.height);
      if (cropSize < 1) throw new Error('The selected enemy photo has invalid dimensions.');
      const manipulator = ImageManipulator.manipulate(sourceUri);
      manipulator
        .crop({
          originX: Math.floor((asset.width - cropSize) / 2),
          originY: Math.floor((asset.height - cropSize) / 2),
          width: cropSize,
          height: cropSize,
        })
        .resize({ width: 384, height: 384 });
      const renderedImage = await manipulator.renderAsync();
      const resizedImage = await renderedImage.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.72,
        base64: Platform.OS === 'web',
      });
      let imageUri = resizedImage.uri;
      if (Platform.OS === 'web') {
        if (!resizedImage.base64) {
          throw new Error('The resized enemy photo could not be saved. Please choose it again.');
        }
        imageUri = `data:image/jpeg;base64,${resizedImage.base64}`;
      }

      setEnemyForm((current) => ({
        name: current?.name ?? 'Custom Enemy',
        imageId: '',
        imageUri,
        armorClass: current?.armorClass ?? '10',
        quantity: current?.quantity ?? '1',
        initiative: current?.initiative ?? '0',
        initiativeMode: current?.initiativeMode ?? 'individual',
        arrivalMode: current?.arrivalMode ?? 'round',
        arrivalRound: current?.arrivalRound ?? '1',
        arrivalNote: current?.arrivalNote ?? '',
        maxHp: current?.maxHp ?? '10',
      }));
    } catch (error) {
      setEnemyFormError(
        error instanceof Error ? error.message : 'Enemy photo could not be selected.',
      );
    } finally {
      setIsPickingEnemyImage(false);
    }
  }

  async function handleAddEnemyToEncounter() {
    if (!enemyForm) {
      setEnemyFormError('Choose a creature image first.');
      return;
    }
    const quantity = Number(enemyForm.quantity);
    const initiative = Number(enemyForm.initiative);
    const armorClass = Number(enemyForm.armorClass);
    const maxHp = Number(enemyForm.maxHp);
    const arrivalRound = Number(enemyForm.arrivalRound);
    if (!enemyForm.name.trim()) {
      setEnemyFormError('Enter an enemy name.');
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      setEnemyFormError('Quantity must be a whole number from 1 to 99.');
      return;
    }
    if (!Number.isInteger(initiative) || initiative < -20 || initiative > 30) {
      setEnemyFormError('Initiative bonus must be a whole number from -20 to +30.');
      return;
    }
    if (!Number.isInteger(maxHp) || maxHp < 1 || maxHp > 9999) {
      setEnemyFormError('HP per enemy must be a whole number from 1 to 9999.');
      return;
    }
    if (!Number.isInteger(armorClass) || armorClass < 1 || armorClass > 40) {
      setEnemyFormError('AC must be a whole number from 1 to 40.');
      return;
    }
    if (
      enemyForm.arrivalMode === 'round' &&
      (!Number.isInteger(arrivalRound) || arrivalRound < 1 || arrivalRound > 999)
    ) {
      setEnemyFormError('Arrival round must be a whole number from 1 to 999.');
      return;
    }
    if (!enemyForm.imageId && !enemyForm.imageUri) {
      setEnemyFormError('Choose a creature image first.');
      return;
    }

    setIsSavingEnemyPreset(true);
    setEnemyFormError(null);
    try {
      let imageId = enemyForm.imageId;
      let imageUri = enemyForm.imageUri;
      if (imageUri) {
        if (!campaign) throw new Error('The campaign could not be loaded.');
        const saved = await saveCampaignCustomEnemyPreset(
          campaign.id,
          imageId.startsWith('custom-') ? imageId : null,
          enemyForm.name,
          initiative,
          imageUri,
        );
        setCampaign(saved.campaign);
        imageId = saved.preset.id;
        imageUri = saved.preset.imageUri;
      }

      const enemy: CampaignEncounterEnemyInput = {
        name: enemyForm.name.trim(),
        imageId,
        imageUri,
        armorClass,
        quantity,
        initiative,
        initiativeMode: enemyForm.initiativeMode,
        arrivalMode: enemyForm.arrivalMode,
        arrivalRound: enemyForm.arrivalMode === 'dm' ? 1 : arrivalRound,
        arrivalNote: enemyForm.arrivalMode === 'dm' ? enemyForm.arrivalNote.trim() : undefined,
        status:
          enemyForm.arrivalMode === 'dm' || arrivalRound > 1
            ? 'scheduled'
            : 'waiting',
        maxHp,
      };
      setEncounterEnemies((current) => {
        if (editingEnemyIndex === null) return [...current, enemy];
        return current.map((item, index) => (index === editingEnemyIndex ? enemy : item));
      });
      setIsEnemyPickerVisible(false);
      setEnemyForm(null);
      setEditingEnemyIndex(null);
      setEnemyFormError(null);
    } catch (error) {
      setEnemyFormError(
        error instanceof Error ? error.message : 'Custom enemy could not be saved.',
      );
    } finally {
      setIsSavingEnemyPreset(false);
    }
  }

  async function handleDeleteEncounter() {
    if (!campaign || !selectedEncounter || isDeletingEncounter) return;
    setIsDeletingEncounter(true);
    setActionError(null);
    try {
      const updatedCampaign = await deleteCampaignEncounter(
        campaign.id,
        selectedEncounter.id,
      );
      setCampaign(updatedCampaign);
      setSelectedEncounter(null);
      setIsDeleteEncounterConfirmVisible(false);
      setIsEncounterEditorVisible(false);
      setEditingEncounterId(null);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Combat encounter could not be deleted.',
      );
    } finally {
      setIsDeletingEncounter(false);
    }
  }

  async function openOnlineLobbyForEncounter(
    lobbyCampaign: Campaign,
    encounter: CampaignEncounter,
  ) {
    if (isOnlineLobbyBusy) return;
    setIsOnlineLobbyBusy(true);
    setActionError(null);
    try {
      const identity = onlineIdentity ?? await ensureSupabaseIdentity();
      if (!onlineIdentity) setOnlineIdentity(identity);
      const previousLobby = await restoreLastOnlineLobby(identity);
      const canReuseLobby = previousLobby?.role === 'dm' &&
        previousLobby.owner_id === identity.userId &&
        previousLobby.encounter_id === encounter.id &&
        previousLobby.status === 'open' &&
        previousLobby.initiative_schema_version === 1 &&
        await isLobbyCurrentForEncounter(
          previousLobby.lobby_id,
          encounter,
          activeCharacters,
          encounter.allies ?? [],
          encounter.backgroundId ?? null,
        );
      const snapshot = canReuseLobby && previousLobby
        ? previousLobby
        : await createOnlineCombatLobby(
            identity,
            lobbyCampaign.id,
            encounter,
            activeCharacters,
            encounter.allies ?? [],
            encounter.backgroundId ?? null,
          );
      setOnlineLobby(snapshot);
      setSelectedOnlineInitiativeKeys([]);
      setOnlineInitiativeInputs({});
      setIsEncounterEditorVisible(false);
      setSelectedEncounter(encounter);
      setEditingEncounterId(null);
      router.push('/lobby');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Online lobby could not be opened.');
    } finally {
      setIsOnlineLobbyBusy(false);
    }
  }

  async function handleClaimOnlineCharacter(characterId: string | null) {
    if (!onlineIdentity || !onlineLobby || isOnlineLobbyBusy) return;
    setIsOnlineLobbyBusy(true);
    setOnlineLobbyError(null);
    try {
      await claimOnlineLobbyCharacter(onlineIdentity, onlineLobby.lobby_id, characterId);
      setOnlineLobby(await loadOnlineLobbySnapshot(onlineIdentity, onlineLobby.lobby_id));
    } catch (error) {
      setOnlineLobbyError(
        error instanceof Error ? error.message : 'Character claim could not be saved.',
      );
    } finally {
      setIsOnlineLobbyBusy(false);
    }
  }

  async function handleCloseOnlineLobby() {
    if (!onlineIdentity || !onlineLobby || isOnlineLobbyBusy) return;
    setIsOnlineLobbyBusy(true);
    setOnlineLobbyError(null);
    try {
      await closeOnlineCombatLobby(onlineIdentity, onlineLobby.lobby_id);
      setOnlineLobby(await loadOnlineLobbySnapshot(onlineIdentity, onlineLobby.lobby_id));
    } catch (error) {
      setOnlineLobbyError(
        error instanceof Error ? error.message : 'Online lobby could not be closed.',
      );
    } finally {
      setIsOnlineLobbyBusy(false);
    }
  }

  async function handleSubmitDmInitiative(
    initiativeKeys: string[],
    options: { rawRoll?: number; rollUnrolled?: boolean } = {},
  ) {
    if (!onlineIdentity || !onlineLobby || isOnlineLobbyBusy || onlineLobby.role !== 'dm') {
      return;
    }
    setIsOnlineLobbyBusy(true);
    setOnlineLobbyError(null);
    try {
      await submitDmInitiative(
        onlineIdentity,
        onlineLobby.lobby_id,
        initiativeKeys,
        options,
      );
      setSelectedOnlineInitiativeKeys([]);
      setOnlineLobby(await loadOnlineLobbySnapshot(onlineIdentity, onlineLobby.lobby_id));
    } catch (error) {
      setOnlineLobbyError(
        error instanceof Error ? error.message : 'Initiative could not be saved.',
      );
    } finally {
      setIsOnlineLobbyBusy(false);
    }
  }

  async function handleResetOnlineInitiative(initiativeKey: string) {
    if (!onlineIdentity || !onlineLobby || isOnlineLobbyBusy || onlineLobby.role !== 'dm') {
      return;
    }
    setIsOnlineLobbyBusy(true);
    setOnlineLobbyError(null);
    try {
      await resetDmInitiative(onlineIdentity, onlineLobby.lobby_id, initiativeKey);
      setOnlineLobby(await loadOnlineLobbySnapshot(onlineIdentity, onlineLobby.lobby_id));
    } catch (error) {
      setOnlineLobbyError(
        error instanceof Error ? error.message : 'Initiative could not be reset.',
      );
    } finally {
      setIsOnlineLobbyBusy(false);
    }
  }

  async function handleStartOnlineCombat() {
    if (
      !onlineIdentity ||
      !onlineLobby ||
      isOnlineLobbyBusy ||
      onlineLobby.role !== 'dm' ||
      onlineLobby.combat_started
    ) {
      return;
    }
    setIsOnlineLobbyBusy(true);
    setOnlineLobbyError(null);
    try {
      await startOnlineCombat(onlineIdentity, onlineLobby.lobby_id);
      setOnlineLobby(await loadOnlineLobbySnapshot(onlineIdentity, onlineLobby.lobby_id));
    } catch (error) {
      setOnlineLobbyError(
        error instanceof Error ? error.message : 'Combat could not be started.',
      );
    } finally {
      setIsOnlineLobbyBusy(false);
    }
  }

  function toggleOnlineInitiativeSelection(initiativeKey: string) {
    setSelectedOnlineInitiativeKeys((current) =>
      current.includes(initiativeKey)
        ? current.filter((key) => key !== initiativeKey)
        : [...current, initiativeKey],
    );
  }

  const characters = campaign?.characters ?? [];
  const activeCharacters = characters.filter((character) => (character.status ?? 'active') === 'active');
  const storedCharacters = characters.filter((character) => character.status === 'stored');
  const deadCharacters = characters.filter((character) => character.status === 'dead');
  const matchingEnemyPresets = ENEMY_PRESETS.filter((preset) =>
    preset.name.toLowerCase().includes(enemySearch.trim().toLowerCase()),
  );
  const matchingCustomEnemyPresets = (campaign?.customEnemyPresets ?? []).filter((preset) =>
    preset.name.toLowerCase().includes(enemySearch.trim().toLowerCase()),
  );
  const combatParticipantIds = campaign?.combat?.participantIds
    ? new Set(campaign.combat.participantIds)
    : null;
  const combatCharacterResults = new Map(
    (campaign?.combat?.characters ?? []).map((character) => [character.id, character]),
  );
  const combatPartyCharacters = activeCharacters.filter(
    (character) => !combatParticipantIds || combatParticipantIds.has(character.id),
  );
  const initiativeEntries: InitiativeEntry[] = campaign?.combat
    ? [
        ...combatPartyCharacters.map((character) => {
          const result = combatCharacterResults.get(character.id);
          return {
            id: character.id,
            name: character.name,
            initiative: result?.initiativeTotal ?? character.initiative,
            initiativeRoll: result?.initiativeRoll,
            initiativeBonus: result?.initiativeBonus,
            initiativeTotal: result?.initiativeTotal,
            className: character.className,
            race: character.race,
            portraitUri: character.portraitUri,
            portraitPresetId: character.portraitPresetId,
            armorClass: result?.armorClass ?? character.armorClass,
          };
        }),
        ...(campaign.combat.allies ?? []).map((ally) => ({
          id: ally.id,
          name: ally.name,
          initiative: ally.initiative,
          initiativeRoll: ally.initiativeRoll,
          initiativeBonus: ally.initiativeBonus,
          initiativeTotal: ally.initiativeTotal,
          className: ally.className,
          race: ally.race,
          portraitUri: ally.portraitUri,
          portraitPresetId: ally.portraitPresetId,
          armorClass: ally.armorClass,
          maxHp: ally.maxHp,
          currentHp: ally.currentHp,
        })),
        ...(campaign.combat.enemies ?? []),
      ]
    : activeCharacters;
  const initiativeOrder = sortCampaignCombatants(
    initiativeEntries,
    new Set(combatPartyCharacters.map((character) => character.id)),
  );
  const currentCharacter = initiativeOrder.find(
    (character) => character.id === campaign?.combat?.currentCharacterId,
  );
  const activeCombatEncounter = campaign?.encounters?.find(
    (encounter) => encounter.id === campaign.combat?.encounterId,
  );
  const activeCombatBackground = COMBAT_BACKGROUND_PRESETS.find(
    (preset) => preset.id === activeCombatEncounter?.backgroundId,
  )?.source;
  const currentTurnPortrait = currentCharacter?.imageId
    ? getEnemyImage(currentCharacter.imageId, campaign?.customEnemyPresets)
    : getCharacterPortraitSource(
        currentCharacter?.portraitPresetId,
        currentCharacter?.portraitUri,
      );
  const onlineCombatBackground = COMBAT_BACKGROUND_PRESETS.find(
    (preset) => preset.id === onlineLobby?.background_id,
  )?.source;
  const coverSource = campaign
    ? getCampaignCoverSource(campaign.coverId, campaign.coverUri)
    : null;
  const onlineResultsByKey = new Map(
    (onlineLobby?.initiative_results ?? []).map((result) => [result.initiative_key, result]),
  );
  const onlineDmParticipantsInDisplayOrder = [...(onlineLobby?.dm_participants ?? [])].sort(
    (left, right) => {
      const leftResult = onlineResultsByKey.get(left.initiative_key);
      const rightResult = onlineResultsByKey.get(right.initiative_key);
      if (leftResult && rightResult) {
        return rightResult.total - leftResult.total ||
          left.sort_order - right.sort_order ||
          left.initiative_key.localeCompare(right.initiative_key);
      }
      if (leftResult) return -1;
      if (rightResult) return 1;
      return left.sort_order - right.sort_order ||
        left.initiative_key.localeCompare(right.initiative_key);
    },
  );
  const onlineCharactersInDisplayOrder = [...(onlineLobby?.characters ?? [])].sort(
    (left, right) => {
      const leftResult = onlineResultsByKey.get(`character:${left.character_id}`);
      const rightResult = onlineResultsByKey.get(`character:${right.character_id}`);
      if (leftResult && rightResult) {
        return rightResult.total - leftResult.total ||
          left.name.localeCompare(right.name) ||
          left.character_id.localeCompare(right.character_id);
      }
      if (leftResult) return -1;
      if (rightResult) return 1;
      return left.name.localeCompare(right.name) ||
        left.character_id.localeCompare(right.character_id);
    },
  );
  const onlineInitiativeResultsInOrder = [...(onlineLobby?.initiative_results ?? [])].sort(
    (left, right) =>
      right.total - left.total ||
      left.sort_order - right.sort_order ||
      left.initiative_key.localeCompare(right.initiative_key),
  );
  const unrolledOnlineDmParticipants = (onlineLobby?.dm_participants ?? []).filter(
    (participant) => !onlineResultsByKey.has(participant.initiative_key),
  );
  const renderCharacterCard = (character: CampaignCharacter) => (
    <View key={character.id} style={styles.characterCard}>
      <View style={styles.characterPortrait}>
        {getCharacterPortraitSource(character.portraitPresetId, character.portraitUri) ? (
          <Image
            accessibilityLabel={`${character.name} portrait`}
            resizeMode="cover"
            source={getCharacterPortraitSource(character.portraitPresetId, character.portraitUri)}
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
          {character.race ? `${character.race} · ${character.className}` : character.className}
        </Text>
        <View style={styles.characterDivider} />
        <Text style={styles.characterStats}>
          AC {character.armorClass ?? 10} · Initiative {character.initiative >= 0 ? '+' : ''}
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
          setIsEditingArmorClass(false);
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
        source={require('../../../assets/images/campaign-cover-haunted-city.jpg')}
        imageStyle={styles.backgroundTextureImage}
        resizeMode="cover"
        style={styles.backgroundArtwork}
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
            </View>
          ) : (
            <>
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

              {activeTab !== 'Encounters' && (
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
                        setActiveTab('Encounters');
                        openEncounterEditor();
                        setEncounterName('Quick Combat');
                      }
                    }}
                    style={styles.combatAction}
                  >
                    <Text style={styles.combatActionText}>
                      {isUpdatingCombat
                        ? 'Please wait...'
                        : campaign.combat
                          ? 'Resume Combat  ›'
                          : 'Prepare Combat  ›'}
                    </Text>
                  </Pressable>
                </View>
              )}
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

              <ScrollView
                style={styles.mainContentScroll}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
              >
                {activeTab === 'Party' ? (
                  <>
                    <View style={styles.sectionHeading}>
                      <Text style={styles.sectionTitle}>Your Party</Text>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          setActionError(null);
                          setCharacterName('');
                          setCharacterRace('');
                          setCharacterClass('');
                          setCharacterArmorClass('10');
                          setCharacterPortraitUri(null);
                          setCharacterPortraitPresetId(null);
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
                ) : activeTab === 'Encounters' ? (
                  <View style={styles.encountersSection}>
                    <View style={styles.encountersHeading}>
                      <View style={styles.encountersHeaderRow}>
                        <View style={styles.encountersTitleGroup}>
                          <Text style={styles.encountersTitle}>Encounters</Text>
                          <Text style={styles.encountersDescription}>
                            Prepare fights for your next session
                          </Text>
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => router.push('/lobby')}
                          style={styles.joinLobbyButton}
                        >
                          <Text style={styles.joinLobbyButtonText}>Join Lobby</Text>
                        </Pressable>
                      </View>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Prepare a new combat encounter"
                      onPress={() => openEncounterEditor()}
                      style={({ pressed }) => [
                        styles.prepareCombatButton,
                        pressed && styles.prepareCombatButtonPressed,
                      ]}
                    >
                      <View pointerEvents="none" style={styles.prepareCombatInnerFrame} />
                      <Text accessibilityElementsHidden style={styles.prepareCombatLeftOrnament}>
                        ✦
                      </Text>
                      <View style={styles.prepareCombatContent}>
                        <Text accessibilityElementsHidden style={styles.prepareCombatIcon}>＋</Text>
                        <Text style={styles.prepareCombatText}>Prepare Combat</Text>
                      </View>
                      <Text accessibilityElementsHidden style={styles.prepareCombatRightOrnament}>
                        ✧
                      </Text>
                    </Pressable>
                    {(campaign.encounters ?? []).length === 0 ? (
                      <View style={styles.emptyEncountersPanel}>
                        <Text style={styles.emptyTitle}>No encounters prepared</Text>
                        <Text style={styles.emptyDescription}>
                          Create an encounter to plan enemies and prepare combat.
                        </Text>
                      </View>
                    ) : (
                      (campaign.encounters ?? []).map((encounter, index) => {
                        const isInProgress =
                          Boolean(campaign.combat) &&
                          campaign.combat?.encounterId === encounter.id;
                        const status = isInProgress ? 'in-progress' : encounter.status;
                        const enemyCount = encounter.enemies.reduce(
                          (total, enemy) => total + (enemy.quantity ?? 1),
                          0,
                        );
                        const allyCount = encounter.allies?.length ?? 0;
                        const canOpenLobby =
                          status === 'ready' &&
                          !campaign.combat &&
                          (encounter.enemies.length > 0 || allyCount > 0);
                        return (
                          <View key={encounter.id} style={styles.encounterCard}>
                            <Image
                              accessibilityLabel={`${encounter.name} encounter artwork`}
                              resizeMode="cover"
                              source={ENCOUNTER_ARTWORK[index % ENCOUNTER_ARTWORK.length]}
                              style={styles.encounterArtwork}
                            />
                            <View style={styles.encounterDetails}>
                              <View style={styles.encounterCardHeading}>
                                <Text numberOfLines={1} style={styles.encounterName}>
                                  {encounter.name}
                                </Text>
                                <View
                                  style={[
                                    styles.encounterStatusBadge,
                                    status === 'ready'
                                      ? styles.readyStatusBadge
                                      : status === 'in-progress'
                                        ? styles.progressStatusBadge
                                        : styles.draftStatusBadge,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.encounterStatusText,
                                      status === 'ready'
                                        ? styles.readyStatusText
                                        : status === 'in-progress'
                                          ? styles.progressStatusText
                                          : styles.draftStatusText,
                                    ]}
                                  >
                                    {status === 'ready'
                                      ? '◇  Ready'
                                      : status === 'in-progress'
                                        ? '⌛  In progress'
                                        : '○  Draft'}
                                  </Text>
                                </View>
                              </View>
                              <Text numberOfLines={1} style={styles.encounterSummary}>
                                {status === 'draft'
                                  ? `${enemyCount} enemies · ${allyCount} allies`
                                  : `${activeCharacters.length} party · ${allyCount} allies · ${enemyCount} enemies`}
                              </Text>
                              {status !== 'in-progress' ? (
                                <View style={styles.encounterActions}>
                                  <Pressable
                                    accessibilityRole="button"
                                    onPress={() => openEncounterEditor(encounter)}
                                    style={styles.encounterEditButton}
                                  >
                                    <Text style={styles.encounterEditIcon}>✎</Text>
                                    <Text style={styles.encounterActionText}>Edit</Text>
                                  </Pressable>
                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={`Delete ${encounter.name} combat`}
                                    onPress={() => {
                                      setActionError(null);
                                      setSelectedEncounter(encounter);
                                      setIsDeleteEncounterConfirmVisible(true);
                                    }}
                                    style={styles.encounterDeleteButton}
                                  >
                                    <Text style={styles.encounterDeleteText}>Delete</Text>
                                  </Pressable>
                                  <Pressable
                                    accessibilityRole="button"
                                    disabled={!canOpenLobby || isOnlineLobbyBusy}
                                    onPress={() => {
                                      setActionError(null);
                                      void openOnlineLobbyForEncounter(campaign, encounter);
                                    }}
                                    style={[
                                      styles.encounterLobbyButton,
                                      (!canOpenLobby || isOnlineLobbyBusy) &&
                                        styles.encounterDisabledButton,
                                    ]}
                                  >
                                    <Text style={styles.encounterLobbyIcon}>♟</Text>
                                    <Text
                                      style={[
                                        styles.encounterActionText,
                                        (!canOpenLobby || isOnlineLobbyBusy) &&
                                          styles.encounterDisabledText,
                                      ]}
                                    >
                                      {isOnlineLobbyBusy ? 'Opening…' : 'Open Online Lobby'}
                                    </Text>
                                  </Pressable>
                                </View>
                              ) : (
                                <Pressable
                                  accessibilityRole="button"
                                  onPress={() => setIsCombatModalVisible(true)}
                                  style={styles.encounterResumeButton}
                                >
                                  <Text style={styles.encounterResumeIcon}>▶</Text>
                                  <Text style={styles.encounterResumeText}>Resume Combat</Text>
                                </Pressable>
                              )}
                            </View>
                          </View>
                        );
                      })
                    )}
                  </View>
                ) : activeTab === 'Graveyard' && deadCharacters.length > 0 ? (
                  <View style={styles.graveyardSection}>
                    <View style={styles.graveyardHeading}>
                      <Text style={styles.graveyardTitle}>Fallen Heroes</Text>
                      <View style={styles.graveyardOrnament}>
                        <View style={styles.graveyardRule} />
                        <Text style={styles.graveyardStar}>✧</Text>
                        <View style={styles.graveyardRule} />
                      </View>
                      <Text style={styles.graveyardDescription}>
                        Their stories remain part of this campaign.
                      </Text>
                    </View>
                    {deadCharacters.map((character) => (
                      <View key={character.id} style={styles.graveyardCard}>
                        <View style={styles.graveyardPortrait}>
                          {getCharacterPortraitSource(character.portraitPresetId, character.portraitUri) ? (
                            <Image
                              accessibilityLabel={`${character.name} portrait`}
                              resizeMode="cover"
                              source={getCharacterPortraitSource(
                                character.portraitPresetId,
                                character.portraitUri,
                              )}
                              style={styles.graveyardPortraitImage}
                            />
                          ) : (
                            <Text style={styles.characterInitial}>
                              {character.name.charAt(0).toUpperCase()}
                            </Text>
                          )}
                        </View>
                        <View style={styles.graveyardCharacterInfo}>
                          <View style={styles.graveyardCharacterHeading}>
                            <Text numberOfLines={1} style={styles.characterName}>
                              {character.name}
                            </Text>
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
                                setIsEditingArmorClass(false);
                                setIsCharacterDeleteConfirmVisible(false);
                                setIsCharacterMenuVisible(true);
                              }}
                              style={styles.graveyardMenuButton}
                            >
                              <Text accessibilityElementsHidden style={styles.characterMenuDots}>
                                ⋯
                              </Text>
                            </Pressable>
                          </View>
                          <Text numberOfLines={1} style={styles.characterClass}>
                            {character.race
                              ? `${character.race} · ${character.className}`
                              : character.className}
                          </Text>
                          <View style={styles.characterDivider} />
                          <View style={styles.graveyardActionRow}>
                            <Pressable
                              accessibilityRole="button"
                              disabled={isUpdatingCharacter}
                              onPress={() => void handleSetCharacterStatus('active', character)}
                              style={[
                                styles.restoreCharacterButton,
                                isUpdatingCharacter && styles.disabledSaveButton,
                              ]}
                            >
                              <Text numberOfLines={1} style={styles.restoreCharacterText}>
                                {isUpdatingCharacter ? 'Restoring...' : 'Restore to Party'}
                              </Text>
                            </Pressable>
                            <Image
                              accessible={false}
                              resizeMode="contain"
                              source={require('../../../assets/images/memorial-candle.png')}
                              style={styles.memorialCandle}
                            />
                          </View>
                        </View>
                      </View>
                    ))}
                    <View style={styles.graveyardFooter}>
                      <View style={styles.graveyardOrnament}>
                        <View style={styles.graveyardRule} />
                        <Text style={styles.graveyardStar}>✧</Text>
                        <View style={styles.graveyardRule} />
                      </View>
                      <Text style={styles.graveyardFooterText}>
                        Move characters here from the Party menu.
                      </Text>
                    </View>
                  </View>
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
                      {activeTab === 'Graveyard'
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
              <CharacterPresetPicker
                onSelect={chooseCharacterPreset}
                selectedPresetId={characterPortraitPresetId}
              />
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
              <TextInput
                accessibilityLabel="Character race"
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={30}
                onChangeText={setCharacterRace}
                placeholder="Race (optional)"
                placeholderTextColor="#8D806B"
                style={styles.modalInput}
                value={characterRace}
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
              <View style={styles.armorClassInputRow}>
                <Text style={styles.fieldLabel}>AC (Armor Class)</Text>
                <TextInput
                  accessibilityLabel="Character AC (Armor Class)"
                  keyboardType="number-pad"
                  maxLength={2}
                  onChangeText={setCharacterArmorClass}
                  placeholder="10"
                  placeholderTextColor="#8D806B"
                  style={styles.armorClassInput}
                  value={characterArmorClass}
                />
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
                    : characterPortraitUri || characterPortraitPresetId
                      ? 'Change Character Image'
                      : 'Add Character Image'}
                </Text>
              </Pressable>
              {(characterPortraitUri || characterPortraitPresetId) && (
                <View style={styles.portraitPreviewRow}>
                  <Image
                    accessibilityLabel="Character portrait preview"
                    resizeMode="cover"
                    source={getCharacterPortraitSource(
                      characterPortraitPresetId ?? undefined,
                      characterPortraitUri,
                    )}
                    style={styles.portraitPreview}
                  />
                  <Pressable
                    accessibilityRole="button"
                    disabled={isSavingCharacter || isPickingPortrait}
                    onPress={() => {
                      setCharacterPortraitUri(null);
                      setCharacterPortraitPresetId(null);
                    }}
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
        animationType="slide"
        onRequestClose={() => setIsEncounterEditorVisible(false)}
        backdropColor="#030A12"
        visible={isEncounterEditorVisible}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.encounterEditorScreen}
        >
          <View style={styles.encounterEditorHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to encounters"
              hitSlop={8}
              onPress={() => setIsEncounterEditorVisible(false)}
              style={styles.encounterBackButton}
            >
              <Text style={styles.encounterBackArrow}>‹</Text>
            </Pressable>
            <View style={styles.encounterEditorTitleBlock}>
              <Text style={styles.encounterEditorTitle}>
                {editingEncounterId ? 'Edit Encounter' : 'Prepare Combat'}
              </Text>
              <Text numberOfLines={1} style={styles.encounterEditorCampaignName}>
                {campaign?.name.toUpperCase()}
              </Text>
            </View>
            <View style={styles.encounterHeaderSpacer} />
          </View>
          <View style={styles.encounterEditorTabs}>
            {([
              ['prepare', 'Encounter'],
              ['reinforcements', 'Reinforcements'],
            ] as const).map(([tab, label]) => (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: encounterEditorTab === tab }}
                key={tab}
                onPress={() => setEncounterEditorTab(tab)}
                style={[
                  styles.encounterEditorTab,
                  encounterEditorTab === tab && styles.encounterEditorTabSelected,
                ]}
              >
                <Text
                  style={[
                    styles.encounterEditorTabText,
                    encounterEditorTab === tab && styles.encounterEditorTabTextSelected,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          <ScrollView
            contentContainerStyle={styles.encounterEditorContent}
            keyboardShouldPersistTaps="handled"
          >
            {encounterEditorTab === 'prepare' ? (
              <>
            <Text style={styles.encounterFieldLabel}>Encounter name</Text>
            <TextInput
              accessibilityLabel="Encounter name"
              autoCapitalize="sentences"
              maxLength={60}
              onChangeText={setEncounterName}
              placeholder="Name this encounter"
              placeholderTextColor="#8D806B"
              style={styles.encounterNameInput}
              value={encounterName}
            />

            <View style={styles.combatBackgroundPicker}>
              <Text style={styles.encounterSectionTitle}>Combat Background</Text>
              <Text style={styles.combatBackgroundHint}>
                Choose the scene behind the combat tracker.
              </Text>
              <ScrollView
                horizontal
                contentContainerStyle={styles.combatBackgroundOptions}
                showsHorizontalScrollIndicator={false}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: encounterBackgroundId === null }}
                  onPress={() => setEncounterBackgroundId(null)}
                  style={[
                    styles.combatBackgroundOption,
                    encounterBackgroundId === null && styles.combatBackgroundOptionSelected,
                  ]}
                >
                  <Image
                    accessibilityLabel="Default combat background preview"
                    resizeMode="cover"
                    source={require('../../../assets/images/campaigns-list-background.png')}
                    style={styles.combatBackgroundThumbnail}
                  />
                  <Text numberOfLines={1} style={styles.combatBackgroundName}>Default</Text>
                </Pressable>
                {COMBAT_BACKGROUND_PRESETS.map((preset) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: encounterBackgroundId === preset.id }}
                    key={preset.id}
                    onPress={() => setEncounterBackgroundId(preset.id)}
                    style={[
                      styles.combatBackgroundOption,
                      encounterBackgroundId === preset.id &&
                        styles.combatBackgroundOptionSelected,
                    ]}
                  >
                    <Image
                      accessibilityLabel={`${preset.name} combat background preview`}
                      resizeMode="cover"
                      source={preset.source}
                      style={styles.combatBackgroundThumbnail}
                    />
                    <Text numberOfLines={1} style={styles.combatBackgroundName}>
                      {preset.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View style={styles.encounterPartyHeading}>
              <Text style={styles.encounterSectionTitle}>Party</Text>
              <Text style={styles.encounterSectionCount}>
                · {activeCharacters.length} {activeCharacters.length === 1 ? 'character' : 'characters'}
              </Text>
            </View>
            {activeCharacters.length > 0 ? (
              <ScrollView
                horizontal
                contentContainerStyle={styles.encounterPartyList}
                showsHorizontalScrollIndicator={false}
              >
                {activeCharacters.map((character) => (
                  <View key={character.id} style={styles.encounterPartyMember}>
                    <View style={styles.encounterPartyPortrait}>
                      {getCharacterPortraitSource(character.portraitPresetId, character.portraitUri) ? (
                        <Image
                          accessibilityLabel={`${character.name} portrait`}
                          resizeMode="cover"
                          source={getCharacterPortraitSource(
                            character.portraitPresetId,
                            character.portraitUri,
                          )}
                          style={styles.encounterPartyPortraitImage}
                        />
                      ) : (
                        <Text style={styles.encounterPartyInitial}>
                          {character.name.charAt(0).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <Text numberOfLines={1} style={styles.encounterPartyName}>
                      {character.name}
                    </Text>
                    <Text numberOfLines={1} style={styles.encounterPartyClass}>
                      {character.className}
                    </Text>
                    <Text style={styles.encounterPartyClass}>
                      AC {character.armorClass ?? 10}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.encounterPartyEmpty}>
                Add or restore a party member before opening this encounter&apos;s lobby.
              </Text>
            )}

            <View style={styles.encounterAllyHeading}>
              <View style={styles.encounterEnemiesTitleGroup}>
                <Text style={styles.encounterAllyIcon}>♟</Text>
                <Text style={styles.encounterSectionTitle}>Temporary Allies</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={openCombatAllyForm}
                style={styles.addEnemyButton}
              >
                <Text style={styles.addEnemyPlus}>＋</Text>
                <Text style={styles.addEnemyButtonText}>Add Ally</Text>
              </Pressable>
            </View>
            {encounterAllies.length > 0 ? (
              encounterAllies.map((ally) => (
                <View key={ally.id} style={styles.encounterEnemyRow}>
                  {getCharacterPortraitSource(ally.portraitPresetId, ally.portraitUri) ? (
                    <Image
                      accessibilityLabel={`${ally.name} portrait`}
                      resizeMode="cover"
                      source={getCharacterPortraitSource(
                        ally.portraitPresetId,
                        ally.portraitUri,
                      )}
                      style={styles.encounterEnemyPortrait}
                    />
                  ) : (
                    <View style={styles.encounterAllyPortraitFallback}>
                      <Text style={styles.encounterPartyInitial}>
                        {ally.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.encounterEnemyInfo}>
                    <Text numberOfLines={1} style={styles.encounterEnemyName}>
                      {ally.name}
                    </Text>
                    <View style={styles.encounterEnemyMeta}>
                      <Text style={styles.encounterEnemyInitiative}>
                        {ally.race ? `${ally.race} · ` : ''}
                        {ally.className}
                      </Text>
                      <Text style={styles.encounterEnemyModeBadge}>
                        Initiative {ally.initiative >= 0 ? '+' : ''}
                        {ally.initiative}
                      </Text>
                      <Text style={styles.encounterEnemyModeBadge}>
                        HP {ally.maxHp ?? 10}
                      </Text>
                      <Text style={styles.encounterEnemyModeBadge}>
                        AC {ally.armorClass ?? 10}
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${ally.name} from this encounter`}
                    onPress={() =>
                      setEncounterAllies((current) =>
                        current.filter((item) => item.id !== ally.id),
                      )
                    }
                    style={styles.enemyRowIconButton}
                  >
                    <Text style={styles.enemyRowRemoveIcon}>×</Text>
                  </Pressable>
                </View>
              ))
            ) : (
              <Text style={styles.encounterPartyEmpty}>
                Add temporary allies to this encounter without saving them to the Party tab.
              </Text>
            )}

            <View style={styles.encounterDivider} />
            <View style={styles.encounterEnemiesHeading}>
              <View style={styles.encounterEnemiesTitleGroup}>
                <Text style={styles.encounterSkull}>☠</Text>
                <Text style={styles.encounterSectionTitle}>Enemies</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => openEnemyPicker()}
                style={styles.addEnemyButton}
              >
                <Text style={styles.addEnemyPlus}>＋</Text>
                <Text style={styles.addEnemyButtonText}>Add Enemy</Text>
              </Pressable>
            </View>
            {encounterEnemies.length > 0 ? (
              encounterEnemies.flatMap((enemy, index) => {
                const isIndividualGroup =
                  enemy.initiativeMode === 'individual' && enemy.quantity > 1;
                const visibleCount = isIndividualGroup ? enemy.quantity : 1;
                return Array.from({ length: visibleCount }, (_, instanceIndex) => {
                  const displayName = isIndividualGroup
                    ? `${enemy.name} ${instanceIndex + 1}`
                    : enemy.name;
                  return (
                <View
                  key={`${enemy.imageId}-${index}-${instanceIndex}`}
                  style={styles.encounterEnemyRow}
                >
                  <Image
                    accessibilityLabel={`${displayName} preset image`}
                    resizeMode="cover"
                    source={getEnemyImage(enemy.imageId, campaign?.customEnemyPresets)}
                    style={styles.encounterEnemyPortrait}
                  />
                  <View style={styles.encounterEnemyInfo}>
                    <Text numberOfLines={1} style={styles.encounterEnemyName}>
                      {displayName}
                    </Text>
                    <View style={styles.encounterEnemyMeta}>
                      <Text style={styles.encounterEnemyInitiative}>
                        Initiative bonus {enemy.initiative >= 0 ? '+' : ''}
                        {enemy.initiative}
                      </Text>
                      <Text style={styles.encounterEnemyModeBadge}>
                        {enemy.maxHp ?? 10} HP each
                      </Text>
                      <Text style={styles.encounterEnemyModeBadge}>
                        AC {enemy.armorClass ?? 10}
                      </Text>
                      <Text style={styles.encounterEnemyModeBadge}>
                        {isIndividualGroup
                          ? `Individual · ${instanceIndex + 1}/${enemy.quantity}`
                          : enemy.initiativeMode === 'horde' && enemy.quantity > 1
                          ? `${enemy.quantity} enemies · 1 initiative`
                          : `${enemy.quantity} ${enemy.quantity === 1 ? 'enemy' : 'enemies'}`}
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${displayName}`}
                    onPress={() => openEnemyPicker(enemy, index)}
                    style={styles.enemyRowIconButton}
                  >
                    <Text style={styles.enemyRowEditIcon}>✎</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${displayName}`}
                    onPress={() =>
                      setEncounterEnemies((current) => {
                        if (!isIndividualGroup) {
                          return current.filter((_, enemyIndex) => enemyIndex !== index);
                        }
                        return current.flatMap((item, enemyIndex) => {
                          if (enemyIndex !== index) return [item];
                          const quantity = item.quantity - 1;
                          return quantity > 0 ? [{ ...item, quantity }] : [];
                        });
                      })
                    }
                    style={styles.enemyRowIconButton}
                  >
                    <Text style={styles.enemyRowRemoveIcon}>×</Text>
                  </Pressable>
                </View>
                  );
                });
              })
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => openEnemyPicker()}
                style={styles.encounterEmptyEnemies}
              >
                <Text style={styles.encounterEmptyEnemiesTitle}>No enemies added yet</Text>
                <Text style={styles.encounterEmptyEnemiesText}>
                  Choose a preset image and set the enemy count and initiative.
                </Text>
              </Pressable>
            )}
            <View style={styles.encounterSummaryBar}>
              <Text style={styles.encounterSummaryIcon}>♟</Text>
              <Text style={styles.encounterSummaryText}>
                {encounterEnemies.reduce((total, enemy) => total + enemy.quantity, 0)} enemies
                {'  ·  '}
                {encounterEnemies.reduce(
                  (total, enemy) =>
                    total +
                    (enemy.initiativeMode === 'horde' && enemy.quantity > 1 ? 1 : enemy.quantity),
                  0,
                )}{' '}
                enemy initiative rolls
              </Text>
            </View>
            {actionError && <Text style={styles.errorText}>{actionError}</Text>}
              </>
            ) : (
              <View style={styles.reinforcementTabContent}>
                <Text style={styles.encounterSectionTitle}>Reinforcement Arrival</Text>
                <Text style={styles.reinforcementIntro}>
                  Set when each enemy group enters combat. “When Decided” keeps them out of the
                  initiative until you activate them from the lobby after the trigger occurs.
                </Text>
                {encounterEnemies.length > 0 ? (
                  encounterEnemies.map((enemy, index) => (
                    <View key={`${enemy.imageId}-${index}`} style={styles.reinforcementCard}>
                      <Image
                        accessibilityLabel={`${enemy.name} portrait`}
                        resizeMode="cover"
                        source={getEnemyImage(enemy.imageId, campaign?.customEnemyPresets)}
                        style={styles.reinforcementPortrait}
                      />
                      <View style={styles.reinforcementCardInfo}>
                        <Text style={styles.reinforcementName}>{enemy.name}</Text>
                        <Text style={styles.reinforcementDetails}>
                          {enemy.quantity} {enemy.quantity === 1 ? 'enemy' : 'enemies'}
                          {enemy.arrivalMode === 'dm'
                              ? ` · When Decided${enemy.arrivalNote ? ` · ${enemy.arrivalNote}` : ''}`
                            : ` · Round ${enemy.arrivalRound ?? 1}`}
                        </Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Configure arrival for ${enemy.name}`}
                        onPress={() => openEnemyPicker(enemy, index)}
                        style={styles.reinforcementEditButton}
                      >
                        <Text style={styles.reinforcementEditText}>Configure</Text>
                      </Pressable>
                    </View>
                  ))
                ) : (
                  <View style={styles.reinforcementEmpty}>
                    <Text style={styles.reinforcementEmptyText}>
                      Add enemies on the Encounter tab before scheduling reinforcements.
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setEncounterEditorTab('prepare');
                        openEnemyPicker();
                      }}
                      style={styles.addEnemyButton}
                    >
                      <Text style={styles.addEnemyPlus}>＋</Text>
                      <Text style={styles.addEnemyButtonText}>Add Enemy</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}
          </ScrollView>
          <View style={styles.encounterEditorFooter}>
            {editingEncounterId && (
              <Pressable
                accessibilityRole="button"
                disabled={isSavingEncounter || isDeletingEncounter}
                onPress={() => {
                  const encounter = campaign?.encounters?.find(
                    (item) => item.id === editingEncounterId,
                  );
                  if (!encounter) {
                    setActionError('That encounter could not be found.');
                    return;
                  }
                  setSelectedEncounter(encounter);
                  setActionError(null);
                  setIsDeleteEncounterConfirmVisible(true);
                }}
                style={styles.encounterEditorDeleteButton}
              >
                <Text style={styles.encounterEditorDeleteText}>Delete Combat</Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              disabled={isSavingEncounter}
              onPress={() => void handleSaveEncounter('ready')}
              style={styles.encounterSaveButton}
            >
              <Text style={styles.encounterSaveButtonText}>
                {isSavingEncounter ? 'Saving...' : 'Save Encounter'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={
                isSavingEncounter ||
                isOnlineLobbyBusy ||
                (encounterEnemies.length === 0 && encounterAllies.length === 0) ||
                !encounterName.trim()
              }
              onPress={() => void handleSaveEncounterAndOpenLobby()}
              style={[
                styles.encounterOpenLobbyButton,
                (isSavingEncounter ||
                  isOnlineLobbyBusy ||
                  (encounterEnemies.length === 0 && encounterAllies.length === 0) ||
                  !encounterName.trim()) &&
                  styles.encounterOpenLobbyDisabled,
              ]}
            >
              <Text style={styles.encounterOpenLobbyIcon}>⚔</Text>
              <Text style={styles.encounterOpenLobbyText}>
                {isSavingEncounter || isOnlineLobbyBusy
                  ? 'Saving & Opening…'
                  : 'Open Online Lobby'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={isSavingEncounter}
              onPress={() => void handleSaveEncounter('draft')}
              style={styles.encounterSaveDraftButton}
            >
              <Text style={styles.encounterSaveDraftText}>Save as Draft</Text>
            </Pressable>
          </View>
          {isEnemyPickerVisible && (
            <View style={styles.enemyPickerBackdrop}>
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.enemyPickerCard}
              >
                <View style={styles.enemyPickerHeader}>
                  <Text style={styles.enemyPickerTitle}>
                    {editingEnemyIndex === null ? 'Add Enemy' : 'Edit Enemy'}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close enemy selector"
                    onPress={() => setIsEnemyPickerVisible(false)}
                    style={styles.enemyPickerCloseButton}
                  >
                    <Text style={styles.enemyPickerCloseText}>×</Text>
                  </Pressable>
                </View>
                <ScrollView
                  contentContainerStyle={styles.enemyPickerContent}
                  keyboardShouldPersistTaps="handled"
                >
                  <TextInput
                    accessibilityLabel="Search enemy presets"
                    autoCapitalize="none"
                    onChangeText={setEnemySearch}
                    placeholder="⌕   Search presets..."
                    placeholderTextColor="#8D969C"
                    style={styles.enemySearchInput}
                    value={enemySearch}
                  />
                  <Pressable
                    accessibilityRole="button"
                    disabled={isPickingEnemyImage || isSavingEnemyPreset}
                    onPress={() => void handlePickCustomEnemyImage()}
                    style={[
                      styles.customEnemyCreateButton,
                      (isPickingEnemyImage || isSavingEnemyPreset) &&
                        styles.customEnemyCreateButtonDisabled,
                    ]}
                  >
                    <Text style={styles.customEnemyCreateButtonText}>
                      {isPickingEnemyImage ? 'Preparing photo…' : '＋ Create Custom Enemy · Add Photo'}
                    </Text>
                  </Pressable>
                  <View style={styles.enemyPresetGrid}>
                    {matchingCustomEnemyPresets.map((preset) => (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: enemyForm?.imageId === preset.id }}
                        key={preset.id}
                        onPress={() => chooseCustomEnemyPreset(preset)}
                        style={[
                          styles.enemyPresetCard,
                          enemyForm?.imageId === preset.id && styles.enemyPresetCardSelected,
                        ]}
                      >
                        <Image
                          accessibilityLabel={`${preset.name} custom preset`}
                          resizeMode="cover"
                          source={{ uri: preset.imageUri }}
                          style={styles.enemyPresetImage}
                        />
                        <Text numberOfLines={1} style={styles.enemyPresetName}>
                          {preset.name}
                        </Text>
                      </Pressable>
                    ))}
                    {matchingEnemyPresets.map((preset) => (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: enemyForm?.imageId === preset.id }}
                        key={preset.id}
                        onPress={() => chooseEnemyPreset(preset.id)}
                        style={[
                          styles.enemyPresetCard,
                          enemyForm?.imageId === preset.id && styles.enemyPresetCardSelected,
                        ]}
                      >
                        <Image
                          accessibilityLabel={`${preset.name} preset`}
                          resizeMode="cover"
                          source={preset.source}
                          style={styles.enemyPresetImage}
                        />
                        <Text numberOfLines={1} style={styles.enemyPresetName}>
                          {preset.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {matchingEnemyPresets.length === 0 &&
                    matchingCustomEnemyPresets.length === 0 && (
                    <Text style={styles.enemySearchEmpty}>No presets match that search.</Text>
                  )}
                  {enemyForm && (
                    <>
                      {enemyForm.imageUri && (
                        <View style={styles.customEnemyPreviewRow}>
                          <Image
                            accessibilityLabel={`${enemyForm.name || 'Custom enemy'} photo preview`}
                            resizeMode="cover"
                            source={{ uri: enemyForm.imageUri }}
                            style={styles.customEnemyPreview}
                          />
                          <Text style={styles.customEnemyPreviewHint}>
                            Custom enemy photo · resized for the encounter list
                          </Text>
                        </View>
                      )}
                      <TextInput
                        accessibilityLabel="Enemy name"
                        autoCapitalize="words"
                        maxLength={40}
                        onChangeText={(name) => setEnemyForm((current) => current && { ...current, name })}
                        placeholder="Enemy name"
                        placeholderTextColor="#8D969C"
                        style={styles.enemyFormNameInput}
                        value={enemyForm.name}
                      />
                      <View style={styles.enemyHpRow}>
                        <Text style={styles.enemyFormLabel}>HP per enemy</Text>
                        <TextInput
                          accessibilityLabel="Enemy hit points"
                          keyboardType="number-pad"
                          maxLength={4}
                          onChangeText={(maxHp) =>
                            setEnemyForm((current) => current && { ...current, maxHp })
                          }
                          placeholder="10"
                          placeholderTextColor="#8D969C"
                          style={styles.enemyHpInput}
                          value={enemyForm.maxHp}
                        />
                      </View>
                      <View style={styles.enemyHpRow}>
                        <Text style={styles.enemyFormLabel}>AC (Armor Class)</Text>
                        <TextInput
                          accessibilityLabel="Enemy AC (Armor Class)"
                          keyboardType="number-pad"
                          maxLength={2}
                          onChangeText={(armorClass) =>
                            setEnemyForm((current) => current && { ...current, armorClass })
                          }
                          placeholder="10"
                          placeholderTextColor="#8D969C"
                          style={styles.enemyHpInput}
                          value={enemyForm.armorClass}
                        />
                      </View>
                      <View style={styles.enemyQuantityInitiativeRow}>
                        <Text style={styles.enemyFormLabel}>Quantity</Text>
                        <View style={styles.enemyQuantityControl}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Decrease enemy quantity"
                            onPress={() =>
                              setEnemyForm((current) =>
                                current && {
                                  ...current,
                                  quantity: String(Math.max(1, Number(current.quantity || 1) - 1)),
                                },
                              )
                            }
                            style={styles.enemyQuantityButton}
                          >
                            <Text style={styles.enemyQuantityButtonText}>−</Text>
                          </Pressable>
                          <TextInput
                            accessibilityLabel="Enemy quantity"
                            keyboardType="number-pad"
                            onChangeText={(quantity) =>
                              setEnemyForm((current) => current && { ...current, quantity })
                            }
                            style={styles.enemyQuantityInput}
                            value={enemyForm.quantity}
                          />
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Increase enemy quantity"
                            onPress={() =>
                              setEnemyForm((current) =>
                                current && {
                                  ...current,
                                  quantity: String(Math.min(99, Number(current.quantity || 0) + 1)),
                                },
                              )
                            }
                            style={styles.enemyQuantityButton}
                          >
                            <Text style={styles.enemyQuantityButtonText}>＋</Text>
                          </Pressable>
                        </View>
                        <Text style={styles.enemyFormLabel}>Initiative bonus</Text>
                        <TextInput
                          accessibilityLabel="Enemy initiative bonus"
                          keyboardType="numbers-and-punctuation"
                          onChangeText={(initiative) =>
                            setEnemyForm((current) => current && { ...current, initiative })
                          }
                          placeholder="0"
                          placeholderTextColor="#8D969C"
                          style={styles.enemyInitiativeInput}
                          value={enemyForm.initiative}
                        />
                      </View>
                      <View style={styles.enemyModeRow}>
                        <Text style={styles.enemyFormLabel}>Initiative mode</Text>
                        <View style={styles.enemyModeOptions}>
                          {(['individual', 'horde'] as const).map((mode) => (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityState={{ selected: enemyForm.initiativeMode === mode }}
                              key={mode}
                              onPress={() =>
                                setEnemyForm((current) => current && { ...current, initiativeMode: mode })
                              }
                              style={[
                                styles.enemyModeButton,
                                enemyForm.initiativeMode === mode && styles.enemyModeButtonSelected,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.enemyModeButtonText,
                                  enemyForm.initiativeMode === mode && styles.enemyModeButtonTextSelected,
                                ]}
                              >
                                {mode === 'individual' ? 'Individual' : 'Horde'}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                      <Text style={styles.enemyModeDescription}>
                        {enemyForm.initiativeMode === 'horde'
                          ? `All ${enemyForm.quantity || '0'} enemies act on one initiative turn.`
                          : 'Each enemy gets a separate turn in initiative.'}
                      </Text>
                      <View style={styles.enemyArrivalPanel}>
                        <Text style={styles.enemyFormLabel}>Reinforcement arrival</Text>
                        <View style={styles.enemyModeOptions}>
                          {([
                            ['round', 'Round'],
                            ['dm', 'When Decided'],
                          ] as const).map(([mode, label]) => (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityState={{ selected: enemyForm.arrivalMode === mode }}
                              key={mode}
                              onPress={() =>
                                setEnemyForm((current) =>
                                  current && { ...current, arrivalMode: mode },
                                )
                              }
                              style={[
                                styles.enemyModeButton,
                                enemyForm.arrivalMode === mode && styles.enemyModeButtonSelected,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.enemyModeButtonText,
                                  enemyForm.arrivalMode === mode &&
                                    styles.enemyModeButtonTextSelected,
                                ]}
                              >
                                {label}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                        {enemyForm.arrivalMode === 'round' ? (
                          <View style={styles.enemyArrivalRoundRow}>
                            <Text style={styles.enemyArrivalDescription}>
                              Add this group at the start of the selected combat round.
                            </Text>
                            <TextInput
                              accessibilityLabel="Enemy arrival round"
                              keyboardType="number-pad"
                              maxLength={3}
                              onChangeText={(arrivalRound) =>
                                setEnemyForm((current) =>
                                  current && { ...current, arrivalRound },
                                )
                              }
                              placeholder="1"
                              placeholderTextColor="#8D969C"
                              style={styles.enemyArrivalRoundInput}
                              value={enemyForm.arrivalRound}
                            />
                          </View>
                        ) : (
                          <>
                            <Text style={styles.enemyArrivalDescription}>
                              Keep this group scheduled. After the trigger happens, activate it from
                              the online lobby.
                            </Text>
                            <TextInput
                              accessibilityLabel="Reinforcement trigger note"
                              autoCapitalize="sentences"
                              maxLength={200}
                              multiline
                              onChangeText={(arrivalNote) =>
                                setEnemyForm((current) =>
                                  current && { ...current, arrivalNote },
                                )
                              }
                              placeholder="Optional trigger note (e.g. cries for help)"
                              placeholderTextColor="#8D969C"
                              style={styles.enemyArrivalNoteInput}
                              value={enemyForm.arrivalNote}
                            />
                          </>
                        )}
                      </View>
                    </>
                  )}
                  {enemyFormError && <Text style={styles.errorText}>{enemyFormError}</Text>}
                </ScrollView>
                <Pressable
                  accessibilityRole="button"
                  disabled={!enemyForm || isPickingEnemyImage || isSavingEnemyPreset}
                  onPress={() => void handleAddEnemyToEncounter()}
                  style={[
                    styles.enemyPickerAddButton,
                    (!enemyForm || isPickingEnemyImage || isSavingEnemyPreset) &&
                      styles.enemyPickerAddButtonDisabled,
                  ]}
                >
                  <Text style={styles.enemyPickerAddButtonText}>
                    {isSavingEnemyPreset
                      ? 'Saving custom enemy…'
                      : enemyForm
                        ? editingEnemyIndex === null
                          ? `${enemyForm.imageUri ? 'Save & Add' : 'Add'} ${enemyForm.quantity} ${enemyForm.name || 'Enemy'}${Number(enemyForm.quantity) === 1 ? '' : 's'}`
                          : `Save ${enemyForm.name || 'Enemy'}`
                        : 'Choose a preset'}
                  </Text>
                </Pressable>
              </KeyboardAvoidingView>
            </View>
          )}
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setIsOnlineLobbyVisible(false)}
        transparent
        visible={isOnlineLobbyVisible && Boolean(onlineLobby)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, styles.onlineLobbyModal]}>
            {onlineLobby?.combat_started && onlineCombatBackground && (
              <View pointerEvents="none" style={styles.onlineLobbyBackground}>
                <ImageBackground
                  resizeMode="cover"
                  source={onlineCombatBackground}
                  style={StyleSheet.absoluteFill}
                  imageStyle={styles.onlineLobbyBackgroundImage}
                >
                  <View style={styles.onlineLobbyBackgroundShade} />
                </ImageBackground>
              </View>
            )}
            <Text style={styles.modalTitle}>{onlineLobby?.encounter_name}</Text>
            <Text style={styles.modalDescription}>
              {onlineLobby?.role === 'dm'
                ? 'Share this code with players. Enemy details remain private to the DM.'
                : 'Choose one available character. Enemy details are not shared with players.'}
            </Text>
            {onlineLobby?.join_code && (
              <View style={styles.onlineJoinCodePanel}>
                <Text style={styles.lobbySectionTitle}>PLAYER JOIN CODE</Text>
                <Text selectable style={styles.onlineJoinCode}>
                  {onlineLobby.join_code}
                </Text>
              </View>
            )}
            <View style={styles.onlineLobbyStateRow}>
              <Text style={styles.onlineLobbyState}>
                {onlineLobby?.status === 'open' ? 'Lobby open · live updates on' : 'Lobby closed'}
              </Text>
              <Text style={styles.onlineLobbyState}>
                {onlineLobby?.members.length ?? 0} player
                {(onlineLobby?.members.length ?? 0) === 1 ? '' : 's'}
              </Text>
            </View>
            <ScrollView style={styles.onlineLobbyRoster}>
              <Text style={styles.lobbySectionTitle}>PLAYERS</Text>
              {onlineLobby?.members.map((member) => {
                const claimedCharacter = onlineLobby.characters.find(
                  (character) => character.character_id === member.claimed_character_id,
                );
                return (
                  <View key={member.user_id} style={styles.onlineMemberRow}>
                    <View style={styles.onlineMemberText}>
                      <Text numberOfLines={1} style={styles.lobbyMemberName}>
                        {member.display_name}
                        {member.user_id === onlineIdentity?.userId ? ' · You' : ''}
                      </Text>
                      <Text numberOfLines={1} style={styles.lobbyMemberClass}>
                        {member.role === 'dm'
                          ? 'Dungeon Master'
                          : claimedCharacter
                            ? `Playing ${claimedCharacter.name}`
                            : 'No character selected'}
                      </Text>
                    </View>
                  </View>
                );
              })}
              {onlineLobby?.role === 'player' && (
                <Text style={[styles.lobbySectionTitle, styles.onlineCharactersTitle]}>
                  CHARACTERS
                </Text>
              )}
              {onlineLobby?.role === 'dm' && (
                <>
                  {onlineInitiativeResultsInOrder.length > 0 && (
                    <>
                      <Text style={[styles.lobbySectionTitle, styles.onlineCharactersTitle]}>
                        INITIATIVE ORDER
                      </Text>
                      {onlineInitiativeResultsInOrder.map((result) => (
                        <View key={`initiative-order-${result.initiative_key}`} style={styles.onlineMemberRow}>
                          <View style={styles.onlineMemberText}>
                            <Text numberOfLines={1} style={styles.lobbyMemberName}>
                              {result.name}
                            </Text>
                            <Text numberOfLines={1} style={styles.lobbyMemberClass}>
                              {result.participant_type === 'character'
                                ? 'Player character'
                                : result.participant_type === 'ally' ? 'NPC' : 'Enemy'}
                              {' · '}{result.raw_roll} {result.bonus >= 0 ? '+' : '−'}{' '}
                              {Math.abs(result.bonus)} = {result.total}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </>
                  )}
                  <Text style={[styles.lobbySectionTitle, styles.onlineCharactersTitle]}>
                    PARTY INITIATIVE
                  </Text>
                  {onlineCharactersInDisplayOrder.map((character) => {
                    const result = onlineResultsByKey.get(`character:${character.character_id}`);
                    const claimant = onlineLobby.members.find(
                      (member) => member.claimed_character_id === character.character_id,
                    );
                    return (
                      <View key={`party-result-${character.character_id}`} style={styles.onlineMemberRow}>
                        <View style={styles.onlineMemberText}>
                          <Text numberOfLines={1} style={styles.lobbyMemberName}>
                            {character.name}
                          </Text>
                          <Text numberOfLines={1} style={styles.lobbyMemberClass}>
                            {character.class_name} · Bonus {character.initiative_bonus >= 0 ? '+' : ''}
                            {character.initiative_bonus}
                          </Text>
                          <Text numberOfLines={1} style={styles.onlineLobbyStatus}>
                            {result
                              ? `${result.raw_roll} ${result.bonus >= 0 ? '+' : '−'} ${Math.abs(result.bonus)} = ${result.total} · Ready`
                              : claimant
                                ? `Waiting · ${claimant.display_name}`
                                : 'Waiting for a player to claim'}
                          </Text>
                        </View>
                        {result && (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Reset ${character.name} initiative`}
                            disabled={isOnlineLobbyBusy || onlineLobby.combat_started}
                            onPress={() => void handleResetOnlineInitiative(
                              `character:${character.character_id}`,
                            )}
                            style={[
                              styles.initiativeResetButton,
                              (isOnlineLobbyBusy || onlineLobby.combat_started) &&
                                styles.disabledAction,
                            ]}
                          >
                            <Text style={styles.initiativeResetText}>Reset</Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                  <Text style={[styles.lobbySectionTitle, styles.onlineCharactersTitle]}>
                    ENEMY & NPC INITIATIVE
                  </Text>
                  <View style={styles.dmRollActions}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={
                        isOnlineLobbyBusy ||
                        onlineLobby.combat_started ||
                        unrolledOnlineDmParticipants.length === 0
                      }
                      onPress={() => void handleSubmitDmInitiative([], { rollUnrolled: true })}
                      style={[
                        styles.onlineLobbyAction,
                        (isOnlineLobbyBusy ||
                          onlineLobby.combat_started ||
                          unrolledOnlineDmParticipants.length === 0) &&
                          styles.disabledAction,
                      ]}
                    >
                      <Text style={styles.onlineLobbyActionText}>
                        Roll Unrolled ({unrolledOnlineDmParticipants.length})
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={
                        isOnlineLobbyBusy ||
                        onlineLobby.combat_started ||
                        selectedOnlineInitiativeKeys.filter(
                          (key) => !onlineResultsByKey.has(key),
                        ).length === 0
                      }
                      onPress={() => void handleSubmitDmInitiative(
                        selectedOnlineInitiativeKeys.filter(
                          (key) => !onlineResultsByKey.has(key),
                        ),
                      )}
                      style={[
                        styles.onlineLobbyAction,
                        (isOnlineLobbyBusy ||
                          onlineLobby.combat_started ||
                          selectedOnlineInitiativeKeys.filter(
                            (key) => !onlineResultsByKey.has(key),
                          ).length === 0) && styles.disabledAction,
                      ]}
                    >
                      <Text style={styles.onlineLobbyActionText}>
                        Roll Selected ({
                          selectedOnlineInitiativeKeys.filter(
                            (key) => !onlineResultsByKey.has(key),
                          ).length
                        })
                      </Text>
                    </Pressable>
                  </View>
                  {onlineDmParticipantsInDisplayOrder.map((participant) => {
                    const result = onlineResultsByKey.get(participant.initiative_key);
                    const manualInput =
                      onlineInitiativeInputs[participant.initiative_key] ?? '';
                    const parsedManualRoll = /^\d+$/.test(manualInput)
                      ? Number(manualInput)
                      : Number.NaN;
                    const selected = selectedOnlineInitiativeKeys.includes(
                      participant.initiative_key,
                    );
                    const waitingStatus = [
                      participant.active_count > 0 && `Active ${participant.active_count}`,
                      participant.hidden_count > 0 && `Hidden ${participant.hidden_count}`,
                      participant.scheduled_count > 0 &&
                        `Scheduled ${participant.scheduled_count} · arrives round ${participant.arrival_round}`,
                      participant.waiting_count > 0 && `Waiting ${participant.waiting_count}`,
                      participant.defeated_count > 0 && `Defeated ${participant.defeated_count}`,
                      participant.inactive_count > 0 && `Inactive ${participant.inactive_count}`,
                    ].filter(Boolean).join(' · ') || 'Waiting';
                    const isHorde =
                      participant.initiative_mode === 'horde' && participant.member_count > 1;
                    return (
                      <View key={participant.initiative_key} style={styles.dmParticipantCard}>
                        <View style={styles.dmParticipantTopRow}>
                          {!result && (
                            <Pressable
                              accessibilityRole="checkbox"
                              accessibilityState={{
                                checked: selected,
                                disabled: isOnlineLobbyBusy || onlineLobby.combat_started,
                              }}
                              disabled={
                                isOnlineLobbyBusy ||
                                onlineLobby.status !== 'open' ||
                                onlineLobby.combat_started
                              }
                              onPress={() => toggleOnlineInitiativeSelection(
                                participant.initiative_key,
                              )}
                              style={[
                                styles.dmParticipantCheckbox,
                                selected && styles.dmParticipantCheckboxSelected,
                              ]}
                            >
                              <Text style={styles.dmParticipantCheckboxText}>
                                {selected ? '✓' : ''}
                              </Text>
                            </Pressable>
                          )}
                          {participant.participant_type === 'enemy' && participant.image_id && (
                            <Image
                              accessibilityLabel={`${participant.name} portrait`}
                              resizeMode="cover"
                              source={getEnemyImage(
                                participant.image_id,
                                campaign?.customEnemyPresets,
                              )}
                              style={styles.lobbyMemberPortrait}
                            />
                          )}
                          <View style={styles.onlineMemberText}>
                            <Text numberOfLines={1} style={styles.lobbyMemberName}>
                              {participant.name}
                            </Text>
                            <Text numberOfLines={2} style={styles.lobbyMemberClass}>
                              {isHorde
                                ? `${participant.member_count} separate members · one shared initiative`
                                : participant.participant_type === 'ally'
                                  ? 'NPC'
                                  : 'Enemy'}
                              {' · '}{waitingStatus}
                              {' · Bonus '}{participant.initiative_bonus >= 0 ? '+' : ''}
                              {participant.initiative_bonus}
                            </Text>
                          </View>
                        </View>
                        {result ? (
                          <View style={styles.dmResultRow}>
                            <Text style={styles.initiativeSubmissionResult}>
                              {result.raw_roll} {result.bonus >= 0 ? '+' : '−'} {Math.abs(result.bonus)} = {result.total} · Ready
                            </Text>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Reset ${participant.name} initiative`}
                              disabled={isOnlineLobbyBusy || onlineLobby.combat_started}
                              onPress={() => void handleResetOnlineInitiative(
                                participant.initiative_key,
                              )}
                              style={[
                                styles.initiativeResetButton,
                                (isOnlineLobbyBusy || onlineLobby.combat_started) &&
                                  styles.disabledAction,
                              ]}
                            >
                              <Text style={styles.initiativeResetText}>Reset</Text>
                            </Pressable>
                          </View>
                        ) : (
                          <>
                            <View style={styles.dmParticipantActions}>
                              <Pressable
                                accessibilityRole="button"
                                disabled={
                                  isOnlineLobbyBusy ||
                                  onlineLobby.status !== 'open' ||
                                  onlineLobby.combat_started
                                }
                                onPress={() => void handleSubmitDmInitiative([
                                  participant.initiative_key,
                                ])}
                                style={[
                                  styles.characterClaimButton,
                                  (isOnlineLobbyBusy ||
                                    onlineLobby.status !== 'open' ||
                                    onlineLobby.combat_started) && styles.disabledAction,
                                ]}
                              >
                                <Text style={styles.characterClaimText}>Roll d20</Text>
                              </Pressable>
                              <TextInput
                                accessibilityLabel={`${participant.name} raw d20 result`}
                                keyboardType="number-pad"
                                maxLength={2}
                                onChangeText={(value) => setOnlineInitiativeInputs(
                                  (current) => ({
                                    ...current,
                                    [participant.initiative_key]: value,
                                  }),
                                )}
                                placeholder="d20"
                                placeholderTextColor="#887A64"
                                style={styles.dmManualRollInput}
                                value={manualInput}
                              />
                              <Pressable
                                accessibilityRole="button"
                                disabled={
                                  isOnlineLobbyBusy ||
                                  onlineLobby.status !== 'open' ||
                                  onlineLobby.combat_started ||
                                  !Number.isInteger(parsedManualRoll) ||
                                  parsedManualRoll < 1 ||
                                  parsedManualRoll > 20
                                }
                                onPress={() => void handleSubmitDmInitiative(
                                  [participant.initiative_key],
                                  { rawRoll: parsedManualRoll },
                                )}
                                style={[
                                  styles.characterClaimButton,
                                  (isOnlineLobbyBusy ||
                                    onlineLobby.status !== 'open' ||
                                    onlineLobby.combat_started ||
                                    !Number.isInteger(parsedManualRoll) ||
                                    parsedManualRoll < 1 ||
                                    parsedManualRoll > 20) && styles.disabledAction,
                                ]}
                              >
                                <Text style={styles.characterClaimText}>Enter Roll</Text>
                              </Pressable>
                            </View>
                            <Text style={styles.onlineLobbyStatus}>
                              Enter raw d20 result; the saved DM bonus is added automatically.
                            </Text>
                          </>
                        )}
                      </View>
                    );
                  })}
                  {onlineDmParticipantsInDisplayOrder.length === 0 && (
                    <Text style={styles.onlineLobbyStatus}>No enemies or NPCs in this encounter.</Text>
                  )}
                </>
              )}
              {onlineLobby?.characters.map((character) => {
                const claimant = onlineLobby.members.find(
                  (member) => member.claimed_character_id === character.character_id,
                );
                const myClaim =
                  claimant?.user_id === onlineIdentity?.userId &&
                  onlineLobby.role === 'player';
                const unavailable =
                  onlineLobby.role !== 'player' ||
                  onlineLobby.status !== 'open' ||
                  isOnlineLobbyBusy ||
                  Boolean(claimant && !myClaim);
                const portrait = getCharacterPortraitSource(
                  character.portrait_preset_id ?? undefined,
                );
                return (
                  <View key={character.character_id} style={styles.onlineCharacterRow}>
                    {portrait ? (
                      <Image
                        accessibilityLabel={`${character.name} portrait`}
                        resizeMode="cover"
                        source={portrait}
                        style={styles.lobbyMemberPortrait}
                      />
                    ) : (
                      <View style={styles.lobbyMemberInitial}>
                        <Text style={styles.lobbyMemberInitialText}>
                          {character.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={styles.onlineMemberText}>
                      <Text numberOfLines={1} style={styles.lobbyMemberName}>
                        {character.name}
                      </Text>
                      <Text numberOfLines={1} style={styles.lobbyMemberClass}>
                        {character.race ? `${character.race} · ` : ''}{character.class_name}
                        {claimant ? ` · ${claimant.display_name}` : ' · Available'}
                      </Text>
                    </View>
                    {onlineLobby.role === 'player' && onlineLobby.status === 'open' && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ disabled: unavailable }}
                        disabled={unavailable}
                        onPress={() => void handleClaimOnlineCharacter(
                          myClaim ? null : character.character_id,
                        )}
                        style={[
                          styles.characterClaimButton,
                          myClaim && styles.characterReleaseButton,
                          unavailable && !myClaim && styles.disabledAction,
                        ]}
                      >
                        <Text style={styles.characterClaimText}>
                          {myClaim ? 'Release' : 'Claim'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
              {onlineLobby?.characters.length === 0 && (
                <Text style={styles.onlineLobbyStatus}>
                  The DM has not added any active party characters.
                </Text>
              )}
            </ScrollView>
            {onlineLobbyError && (
              <Text accessibilityLiveRegion="polite" style={styles.errorText}>
                {onlineLobbyError}
              </Text>
            )}
            {onlineLobby?.role === 'dm' && onlineLobby.status === 'open' && (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  disabled: isOnlineLobbyBusy || onlineLobby.combat_started,
                }}
                disabled={isOnlineLobbyBusy || onlineLobby.combat_started}
                onPress={() => void handleStartOnlineCombat()}
                style={[
                  styles.onlineLobbyAction,
                  (isOnlineLobbyBusy || onlineLobby.combat_started) &&
                    styles.disabledAction,
                ]}
              >
                <Text style={styles.onlineLobbyActionText}>
                  {onlineLobby.combat_started
                    ? `Combat Started · Round ${onlineLobby.current_round}`
                    : isOnlineLobbyBusy ? 'Starting Combat…' : 'Start Combat'}
                </Text>
              </Pressable>
            )}
            <View style={styles.modalActions}>
              {onlineLobby?.role === 'dm' && onlineLobby.status === 'open' ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={isOnlineLobbyBusy}
                  onPress={() => void handleCloseOnlineLobby()}
                  style={styles.closeOnlineLobbyButton}
                >
                  <Text style={styles.closeOnlineLobbyText}>
                    {isOnlineLobbyBusy ? 'Closing…' : 'Close Lobby'}
                  </Text>
                </Pressable>
              ) : <View style={styles.onlineLobbyActionSpacer} />}
              <Pressable
                accessibilityRole="button"
                onPress={() => setIsOnlineLobbyVisible(false)}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => {
          if (!isDeletingEncounter) setIsDeleteEncounterConfirmVisible(false);
        }}
        transparent
        visible={isDeleteEncounterConfirmVisible && Boolean(selectedEncounter)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.characterActionsModal}>
            <Text style={styles.modalTitle}>Delete Combat?</Text>
            <Text style={styles.modalDescription}>
              Permanently delete “{selectedEncounter?.name}” and its temporary allies? Reusable enemy presets will not be deleted.
            </Text>
            {actionError && <Text style={styles.errorText}>{actionError}</Text>}
            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                disabled={isDeletingEncounter}
                onPress={() => setIsDeleteEncounterConfirmVisible(false)}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isDeletingEncounter}
                onPress={() => void handleDeleteEncounter()}
                style={styles.deleteCharacterAction}
              >
                <Text style={styles.deleteCharacterActionText}>
                  {isDeletingEncounter ? 'Deleting…' : 'Delete Combat'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => {
          setIsCharacterMenuVisible(false);
          setIsEditingInitiative(false);
          setIsEditingArmorClass(false);
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
                  : isEditingArmorClass
                    ? 'Change AC'
                : selectedCharacter?.name ?? 'Character'}
            </Text>
            <Text style={styles.modalDescription}>
              {isCharacterDeleteConfirmVisible
                ? 'This permanently removes the character from this campaign.'
                : isEditingInitiative
                  ? 'Set the initiative modifier from −4 to +10.'
                  : isEditingArmorClass
                    ? 'Set Armor Class to a whole number from 1 to 40.'
                : selectedCharacter?.status === 'dead'
                  ? 'This character is in the Graveyard.'
                  : selectedCharacter?.status === 'stored'
                    ? 'Stored characters are not included in combat.'
                    : 'Manage this character in your campaign.'}
            </Text>
            {(isEditingInitiative || isEditingArmorClass) &&
            !isCharacterDeleteConfirmVisible ? (
              <>
                {isEditingInitiative ? (
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
                  </>
                ) : (
                  <View style={styles.armorClassInputRow}>
                    <Text style={styles.fieldLabel}>AC (Armor Class)</Text>
                    <TextInput
                      accessibilityLabel={`Armor Class for ${selectedCharacter?.name ?? 'character'}`}
                      keyboardType="number-pad"
                      maxLength={2}
                      onChangeText={(value) => {
                        setEditedArmorClass(value);
                        setActionError(null);
                      }}
                      placeholder="10"
                      placeholderTextColor="#8D806B"
                      style={styles.armorClassInput}
                      value={editedArmorClass}
                    />
                  </View>
                )}
                {actionError && <Text style={styles.errorText}>{actionError}</Text>}
                <View style={styles.modalActions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isUpdatingCharacter}
                    onPress={() => {
                      setIsEditingInitiative(false);
                      setIsEditingArmorClass(false);
                    }}
                    style={styles.cancelButton}
                  >
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isUpdatingCharacter}
                    onPress={() => void (
                      isEditingInitiative
                        ? handleSaveInitiative()
                        : handleSaveArmorClass()
                    )}
                    style={styles.saveButton}
                  >
                    <Text style={styles.saveText}>
                      {isUpdatingCharacter
                        ? 'Saving...'
                        : isEditingInitiative ? 'Save Initiative' : 'Save AC'}
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
                    setIsEditingArmorClass(false);
                    setActionError(null);
                  }}
                  style={styles.characterAction}
                >
                  <Text style={styles.characterActionText}>Change Initiative</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={isUpdatingCharacter}
                  onPress={() => {
                    setEditedArmorClass(String(selectedCharacter?.armorClass ?? 10));
                    setIsEditingArmorClass(true);
                    setActionError(null);
                  }}
                  style={styles.characterAction}
                >
                  <Text style={styles.characterActionText}>Change AC</Text>
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
        onRequestClose={() => {
          if (isAddingCombatAlly) setIsAddingCombatAlly(false);
          else setIsCombatModalVisible(false);
        }}
        transparent
        visible={
          (isCombatModalVisible && Boolean(campaign?.combat)) ||
          (isAddingCombatAlly && isEncounterEditorVisible)
        }
      >
        <View
          style={[
            styles.modalBackdrop,
            !isAddingCombatAlly && styles.combatScreenBackdrop,
          ]}
        >
          <View
            style={[
              isAddingCombatAlly ? styles.combatModal : styles.combatFullScreen,
              !isAddingCombatAlly && {
                paddingTop: insets.top + 8,
                paddingBottom: insets.bottom + 10,
                paddingHorizontal: windowWidth < 420 ? 16 : 24,
              },
            ]}
          >
            {!isAddingCombatAlly && (
              <View pointerEvents="none" style={styles.combatArtLayer}>
                <ImageBackground
                  resizeMode="cover"
                  source={
                    activeCombatBackground ??
                    require('../../../assets/images/combat-background.png')
                  }
                  style={styles.combatScreenBackground}
                  imageStyle={styles.combatScreenBackgroundImage}
                >
                  <View style={styles.combatScreenBackgroundShade} />
                </ImageBackground>
                <Image
                  accessibilityElementsHidden
                  resizeMode="contain"
                  source={require('../../../assets/images/lobby-ornaments/dragon-left-corner.png')}
                  style={[styles.combatDragonCorner, styles.combatDragonLeft]}
                />
                <Image
                  accessibilityElementsHidden
                  resizeMode="contain"
                  source={require('../../../assets/images/lobby-ornaments/dragon-right-corner.png')}
                  style={[styles.combatDragonCorner, styles.combatDragonRight]}
                />
                <Image
                  accessibilityElementsHidden
                  resizeMode="contain"
                  source={require('../../../assets/images/lobby-ornaments/acanthus-corner.png')}
                  style={[styles.combatBottomFlourish, styles.combatBottomFlourishLeft]}
                />
                <Image
                  accessibilityElementsHidden
                  resizeMode="contain"
                  source={require('../../../assets/images/lobby-ornaments/acanthus-corner.png')}
                  style={[styles.combatBottomFlourish, styles.combatBottomFlourishRight]}
                />
              </View>
            )}
            {!isAddingCombatAlly && (
              <>
                <View style={[styles.combatHeader, windowWidth < 420 && styles.combatHeaderCompact]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close combat tracker"
                    hitSlop={8}
                    onPress={() => setIsCombatModalVisible(false)}
                    style={styles.combatBackButton}
                  >
                    <CombatIcon name="arrow.left" size={20} />
                  </Pressable>
                  <View style={styles.combatHeaderTitles}>
                    <Text style={styles.combatScreenTitle}>Combat</Text>
                    <Text style={styles.combatEncounterName}>
                      {activeCombatEncounter?.name ?? campaign?.name ?? 'Encounter'}
                    </Text>
                  </View>
                  <View style={styles.combatLiveBadge}>
                    <CombatIcon name="checkmark" size={14} color="#74D69A" />
                    <Text style={styles.combatLiveText}>LIVE</Text>
                  </View>
                </View>
                <View style={styles.combatHeaderDivider} />
                <View style={styles.combatRoundBar}>
                  <Text style={styles.combatRound}>Round {campaign?.combat?.round ?? 1}</Text>
                  <View style={styles.combatRoundDivider} />
                  <View style={styles.combatRoundLive}>
                    <View style={styles.combatLiveDot} />
                    <Text style={styles.combatRoundLiveText}>In Progress</Text>
                  </View>
                </View>
                {currentCharacter && (
                  <View style={styles.currentTurnCard}>
                    <View style={styles.currentTurnHeader}>
                      <Text style={styles.currentTurnEyebrow}>CURRENT TURN</Text>
                      <View style={styles.currentTurnDivider} />
                    </View>
                    <View style={styles.currentTurnContent}>
                      {currentTurnPortrait ? (
                        <Image
                          accessibilityLabel={`${currentCharacter.name} portrait`}
                          resizeMode="cover"
                          source={currentTurnPortrait}
                          style={styles.currentTurnPortrait}
                        />
                      ) : (
                        <View style={styles.currentTurnPortraitFallback}>
                          <Text style={styles.currentTurnPortraitInitial}>
                            {currentCharacter.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={styles.currentTurnInfo}>
                        <Text style={styles.currentTurnName}>{currentCharacter.name}</Text>
                        <Text style={styles.currentTurnClass}>
                          {currentCharacter.className ??
                            (currentCharacter.imageId ? 'Enemy' : 'Combatant')}
                        </Text>
                      </View>
                      <Text style={styles.currentTurnInitiative}>
                        {currentCharacter.initiative}
                      </Text>
                    </View>
                  </View>
                )}
                <View style={styles.initiativeSectionHeading}>
                  <Text style={styles.initiativeSectionTitle}>INITIATIVE ORDER</Text>
                  <View style={styles.initiativeSectionDivider} />
                </View>
              </>
            )}
            {isAddingCombatAlly && (
              <Text style={styles.modalTitle}>Add Ally</Text>
            )}
            {isAddingCombatAlly ? (
              <ScrollView
                contentContainerStyle={styles.combatAllyFormContent}
                keyboardShouldPersistTaps="handled"
                style={styles.combatAllyFormScroll}
              >
                <Text style={styles.modalDescription}>
                  This ally is saved with this encounter only and won’t be added to the Party tab.
                </Text>
                <CharacterPresetPicker
                  onSelect={chooseCombatAllyPreset}
                  selectedPresetId={combatAllyPortraitPresetId}
                />
                <TextInput
                  accessibilityLabel="Ally name"
                  autoCapitalize="words"
                  maxLength={40}
                  onChangeText={setCombatAllyName}
                  placeholder="Character name"
                  placeholderTextColor="#A8987D"
                  style={styles.modalInput}
                  value={combatAllyName}
                />
                <TextInput
                  accessibilityLabel="Ally race"
                  autoCapitalize="words"
                  autoCorrect={false}
                  maxLength={30}
                  onChangeText={setCombatAllyRace}
                  placeholder="Race (optional)"
                  placeholderTextColor="#8D806B"
                  style={styles.modalInput}
                  value={combatAllyRace}
                />
                <Text style={styles.fieldLabel}>Maximum HP</Text>
                <TextInput
                  accessibilityLabel="Ally maximum HP"
                  keyboardType="number-pad"
                  maxLength={4}
                  onChangeText={setCombatAllyMaxHp}
                  placeholder="10"
                  placeholderTextColor="#8D806B"
                  style={styles.modalInput}
                  value={combatAllyMaxHp}
                />
                <Text style={styles.fieldLabel}>AC (Armor Class)</Text>
                <TextInput
                  accessibilityLabel="Ally AC (Armor Class)"
                  keyboardType="number-pad"
                  maxLength={2}
                  onChangeText={setCombatAllyArmorClass}
                  placeholder="10"
                  placeholderTextColor="#8D806B"
                  style={styles.modalInput}
                  value={combatAllyArmorClass}
                />
                <Text style={styles.fieldLabel}>Class</Text>
                <View style={styles.classOptions}>
                  {CHARACTER_CLASSES.map((className) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: combatAllyClass === className }}
                      key={className}
                      onPress={() => setCombatAllyClass(className)}
                      style={[
                        styles.classOption,
                        combatAllyClass === className && styles.selectedClassOption,
                      ]}
                    >
                      <Text
                        style={[
                          styles.classOptionText,
                          combatAllyClass === className && styles.selectedClassOptionText,
                        ]}
                      >
                        {className}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={isPickingCombatAllyPortrait || isSavingCombatAlly}
                  onPress={() => void handlePickCombatAllyPortrait()}
                  style={styles.portraitPickerButton}
                >
                  <Text style={styles.portraitPickerText}>
                    {isPickingCombatAllyPortrait
                      ? 'Preparing photo…'
                      : combatAllyPortraitUri || combatAllyPortraitPresetId
                        ? 'Change Character Image'
                        : 'Add Character Image'}
                  </Text>
                </Pressable>
                {(combatAllyPortraitUri || combatAllyPortraitPresetId) && (
                  <View style={styles.portraitPreviewRow}>
                    <Image
                      accessibilityLabel="Temporary ally portrait preview"
                      resizeMode="cover"
                      source={getCharacterPortraitSource(
                        combatAllyPortraitPresetId ?? undefined,
                        combatAllyPortraitUri,
                      )}
                      style={styles.portraitPreview}
                    />
                    <Pressable
                      accessibilityRole="button"
                      disabled={isSavingCombatAlly || isPickingCombatAllyPortrait}
                      onPress={() => {
                        setCombatAllyPortraitUri(null);
                        setCombatAllyPortraitPresetId(null);
                      }}
                      style={styles.removePortraitButton}
                    >
                      <Text style={styles.removePortraitText}>Remove image</Text>
                    </Pressable>
                  </View>
                )}
                <View style={styles.initiativeHeader}>
                  <Text style={styles.fieldLabel}>Initiative Modifier</Text>
                  <Text accessibilityLiveRegion="polite" style={styles.initiativeValue}>
                    {combatAllyInitiative >= 0 ? '+' : ''}
                    {combatAllyInitiative}
                  </Text>
                </View>
                <Slider
                  accessibilityLabel="Ally initiative modifier"
                  accessibilityValue={{
                    min: -4,
                    max: 10,
                    now: combatAllyInitiative,
                    text: `${combatAllyInitiative >= 0 ? '+' : ''}${combatAllyInitiative}`,
                  }}
                  maximumTrackTintColor="#5B513F"
                  maximumValue={10}
                  minimumTrackTintColor="#D9A64D"
                  minimumValue={-4}
                  onValueChange={(value) => setCombatAllyInitiative(Math.round(value))}
                  step={1}
                  style={styles.initiativeSlider}
                  thumbTintColor="#F4DDAE"
                  value={combatAllyInitiative}
                />
                <View style={styles.sliderLimits}>
                  <Text style={styles.sliderLimitText}>−4</Text>
                  <Text style={styles.sliderLimitText}>+10</Text>
                </View>
                {combatAllyError && <Text style={styles.errorText}>{combatAllyError}</Text>}
                <View style={styles.modalActions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isSavingCombatAlly || isPickingCombatAllyPortrait}
                    onPress={() => setIsAddingCombatAlly(false)}
                    style={styles.cancelButton}
                  >
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={
                      !combatAllyName.trim() ||
                      !combatAllyClass ||
                      isSavingCombatAlly ||
                      isPickingCombatAllyPortrait
                    }
                    onPress={() => void handleAddCombatAlly()}
                    style={[
                      styles.saveButton,
                      (!combatAllyName.trim() ||
                        !combatAllyClass ||
                        isSavingCombatAlly ||
                        isPickingCombatAllyPortrait) &&
                        styles.disabledSaveButton,
                    ]}
                  >
                    <Text style={styles.saveText}>
                      {isSavingCombatAlly ? 'Adding…' : 'Add to Encounter'}
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            ) : (
              <>
                <ScrollView
                  contentContainerStyle={styles.initiativeListContent}
                  style={styles.initiativeList}
                >
                  {initiativeOrder.map((character, index) => {
                    const isCurrentTurn =
                      character.id === campaign?.combat?.currentCharacterId;
                    const portraitSource = character.imageId
                      ? getEnemyImage(character.imageId, campaign?.customEnemyPresets)
                      : getCharacterPortraitSource(
                          character.portraitPresetId,
                          character.portraitUri,
                        );
                    const savedCharacter = campaign?.characters?.find(
                      (item) => item.id === character.id,
                    );
                    return (
                      <View
                        key={character.id}
                        style={styles.initiativeFrameWrapper}
                      >
                      <View
                        style={[
                          styles.initiativeRow,
                          isCurrentTurn && styles.currentInitiativeRow,
                        ]}
                      >
                      <View style={styles.initiativeRowContent}>
                        <Text style={styles.initiativeRank}>{index + 1}</Text>
                        {portraitSource ? (
                          <Image
                            accessibilityLabel={`${character.name} portrait`}
                            resizeMode="cover"
                            source={portraitSource}
                            style={styles.initiativePortrait}
                          />
                        ) : (
                          <View style={styles.initiativePortraitFallback}>
                            <Text style={styles.initiativePortraitInitial}>
                              {character.name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <View style={styles.initiativeCombatantInfo}>
                          <Text style={styles.initiativeName}>{character.name}</Text>
                          <Text style={styles.initiativeClass}>
                            {character.race ? `${character.race} · ` : ''}
                            {character.className ??
                              (character.imageId ? 'Enemy' : 'Combatant')}
                            {' · AC '}
                            {character.armorClass ?? 10}
                          </Text>
                          {isCurrentTurn && (
                            <Text style={styles.initiativeCurrentLabel}>Current turn</Text>
                          )}
                          {character.initiativeRoll !== undefined &&
                            character.initiativeBonus !== undefined && (
                              <Text style={styles.initiativeCalculation}>
                                {character.initiativeRoll}{' '}
                                {character.initiativeBonus >= 0 ? '+' : '−'}{' '}
                                {Math.abs(character.initiativeBonus)} = {character.initiative}
                              </Text>
                            )}
                          {character.maxHp !== undefined && (
                            <View style={styles.combatHpControls}>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Damage ${character.name} by 1 HP`}
                                disabled={
                                  isUpdatingCombat ||
                                  (character.currentHp ?? character.maxHp) <= 0
                                }
                                onPress={() =>
                                  void handleAdjustCombatantHp(
                                    character.id,
                                    character.currentHp ?? character.maxHp!,
                                    character.maxHp!,
                                    -1,
                                  )
                                }
                                style={styles.combatHpButton}
                              >
                                <CombatIcon name="minus" size={14} />
                              </Pressable>
                              <Text style={styles.combatHpValue}>
                                HP {character.currentHp ?? character.maxHp}/{character.maxHp}
                              </Text>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Heal ${character.name} by 1 HP`}
                                disabled={
                                  isUpdatingCombat ||
                                  (character.currentHp ?? character.maxHp) >= character.maxHp
                                }
                                onPress={() =>
                                  void handleAdjustCombatantHp(
                                    character.id,
                                    character.currentHp ?? character.maxHp!,
                                    character.maxHp!,
                                    1,
                                  )
                                }
                                style={styles.combatHpButton}
                              >
                                <CombatIcon name="plus" size={14} />
                              </Pressable>
                            </View>
                          )}
                        </View>
                        <View style={styles.initiativeScoreBox}>
                          <Text style={styles.initiativeScore}>{character.initiative}</Text>
                        </View>
                        {savedCharacter && (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Character options for ${character.name}`}
                            disabled={isUpdatingCharacter}
                            hitSlop={6}
                            onPress={() => {
                              setActionError(null);
                              setSelectedCharacter(savedCharacter);
                              setEditedInitiative(savedCharacter.initiative);
                              setIsEditingInitiative(false);
                              setIsEditingArmorClass(false);
                              setIsCharacterDeleteConfirmVisible(false);
                              setIsCharacterMenuVisible(true);
                            }}
                            style={styles.combatCharacterMenuButton}
                          >
                            <CombatIcon name="ellipsis" size={20} color="#DCC9A9" />
                          </Pressable>
                        )}
                      </View>
                      {isCurrentTurn && (
                        <View pointerEvents="none" style={styles.activeTurnFrameLayer}>
                          <Image
                            accessible={false}
                            resizeMode="stretch"
                            source={ACTIVE_TURN_FRAME}
                            style={styles.activeTurnFrame}
                          />
                        </View>
                      )}
                      </View>
                      </View>
                    );
                  })}
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
                    style={styles.combatNextTurnButton}
                  >
                    <Text style={styles.combatNextTurnText}>
                      {isUpdatingCombat ? 'Please wait…' : 'Next Turn'}
                    </Text>
                    {!isUpdatingCombat && (
                      <CombatIcon name="arrow.right" size={19} color="#17120A" />
                    )}
                  </Pressable>
                </View>
              </>
            )}
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
  },
  backgroundArtwork: {
    flex: 1,
    width: '100%',
  },
  backgroundTextureImage: {
    opacity: 0.16,
  },
  page: {
    flex: 1,
    width: '100%',
    paddingHorizontal: '4.5%',
    paddingTop: '4%',
    paddingBottom: '3%',
  },
  mainContentScroll: {
    flex: 1,
    minHeight: 0,
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
  encountersSection: {
    paddingTop: 18,
    paddingBottom: 12,
  },
  encountersHeading: {
    marginBottom: 14,
  },
  encountersHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  encountersTitleGroup: {
    flex: 1,
    minWidth: 0,
  },
  joinLobbyButton: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#C69A50',
    borderRadius: 6,
    backgroundColor: 'rgba(5, 14, 22, 0.78)',
  },
  joinLobbyButtonText: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 13,
    fontWeight: '600',
  },
  encountersTitle: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 29,
    fontWeight: '700',
  },
  encountersDescription: {
    color: '#BDAE98',
    fontFamily: 'serif',
    fontSize: 14,
    marginTop: 3,
  },
  prepareCombatButton: {
    height: 52,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#D3A54D',
    borderRadius: 5,
    backgroundColor: '#100E09',
    shadowColor: '#D3A54D',
    shadowOpacity: 0.45,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  prepareCombatButtonPressed: {
    backgroundColor: '#2A2010',
    borderColor: '#F4DDAE',
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  prepareCombatInnerFrame: {
    position: 'absolute',
    top: 3,
    right: 4,
    bottom: 3,
    left: 4,
    borderWidth: 1,
    borderColor: 'rgba(211, 165, 77, 0.68)',
    borderRadius: 3,
  },
  prepareCombatLeftOrnament: {
    position: 'absolute',
    left: 11,
    color: '#E6B65C',
    fontSize: 12,
    textShadowColor: '#E6B65C',
    textShadowRadius: 5,
  },
  prepareCombatContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  prepareCombatRightOrnament: {
    position: 'absolute',
    right: 13,
    color: '#C69742',
    fontSize: 28,
    lineHeight: 30,
    textShadowColor: '#D9A94F',
    textShadowRadius: 6,
  },
  prepareCombatIcon: {
    color: '#E8B95F',
    fontSize: 24,
    lineHeight: 28,
    textShadowColor: '#D9A94F',
    textShadowRadius: 5,
  },
  prepareCombatText: {
    color: '#F2D18A',
    fontFamily: 'serif',
    fontSize: 17,
    fontWeight: '700',
    textShadowColor: '#D9A94F',
    textShadowRadius: 5,
  },
  encounterEditorScreen: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? 10 : 20,
    backgroundColor: '#030A12',
  },
  encounterEditorHeader: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196, 151, 76, 0.45)',
  },
  encounterEditorTabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 2,
  },
  encounterEditorTab: {
    minHeight: 40,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  encounterEditorTabSelected: {
    borderBottomColor: '#D9A64D',
  },
  encounterEditorTabText: {
    color: '#BDAE98',
    fontFamily: 'serif',
    fontSize: 14,
  },
  encounterEditorTabTextSelected: {
    color: '#F4DDAE',
    fontWeight: '700',
  },
  encounterBackButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#B78A43',
    borderRadius: 20,
  },
  encounterBackArrow: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 36,
    lineHeight: 38,
    marginTop: -3,
  },
  encounterEditorTitleBlock: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  encounterEditorTitle: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 25,
    fontWeight: '700',
    textAlign: 'center',
  },
  encounterEditorCampaignName: {
    color: '#D4A448',
    fontFamily: 'serif',
    fontSize: 10,
    letterSpacing: 2,
    marginTop: 1,
  },
  encounterHeaderSpacer: {
    width: 40,
  },
  encounterEditorContent: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 22,
  },
  reinforcementTabContent: {
    gap: 12,
  },
  reinforcementIntro: {
    color: '#C8BBA8',
    fontFamily: 'serif',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 4,
  },
  reinforcementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(196, 151, 76, 0.42)',
    borderRadius: 8,
    backgroundColor: 'rgba(13, 24, 33, 0.92)',
  },
  reinforcementPortrait: {
    width: 52,
    height: 52,
    borderWidth: 1,
    borderColor: '#B78A43',
    borderRadius: 6,
  },
  reinforcementCardInfo: {
    flex: 1,
    minWidth: 0,
  },
  reinforcementName: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
  },
  reinforcementDetails: {
    color: '#C8BBA8',
    fontFamily: 'serif',
    fontSize: 13,
    marginTop: 3,
  },
  reinforcementEditButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#92713F',
    borderRadius: 6,
  },
  reinforcementEditText: {
    color: '#F0D69F',
    fontFamily: 'serif',
    fontSize: 12,
  },
  reinforcementEmpty: {
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(196, 151, 76, 0.35)',
    borderRadius: 8,
    backgroundColor: 'rgba(13, 24, 33, 0.84)',
  },
  reinforcementEmptyText: {
    color: '#C8BBA8',
    fontFamily: 'serif',
    fontSize: 14,
    lineHeight: 20,
  },
  encounterFieldLabel: {
    color: '#E6D5B5',
    fontFamily: 'serif',
    fontSize: 14,
    marginBottom: 6,
  },
  encounterNameInput: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#987443',
    borderRadius: 6,
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 16,
    backgroundColor: 'rgba(4, 13, 21, 0.82)',
  },
  combatBackgroundPicker: {
    marginTop: 16,
  },
  combatBackgroundHint: {
    color: '#BDAE98',
    fontFamily: 'serif',
    fontSize: 12,
    marginTop: 3,
  },
  combatBackgroundOptions: {
    gap: 9,
    paddingVertical: 9,
  },
  combatBackgroundOption: {
    width: 112,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#80683D',
    borderRadius: 7,
    backgroundColor: '#0B1721',
  },
  combatBackgroundOptionSelected: {
    borderColor: '#F3C45D',
    shadowColor: '#E8B95F',
    shadowOpacity: 0.75,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  combatBackgroundThumbnail: {
    width: '100%',
    height: 66,
  },
  combatBackgroundName: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: 5,
    paddingHorizontal: 3,
  },
  encounterPartyHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 14,
    marginBottom: 8,
  },
  encounterSectionTitle: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 19,
    fontWeight: '700',
  },
  encounterSectionCount: {
    color: '#C8B99D',
    fontFamily: 'serif',
    fontSize: 14,
    marginLeft: 4,
  },
  encounterPartyList: {
    gap: 9,
    paddingBottom: 2,
  },
  encounterPartyMember: {
    width: 78,
    alignItems: 'center',
  },
  encounterPartyPortrait: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#C69A50',
    borderRadius: 6,
    backgroundColor: '#10202B',
  },
  encounterPartyPortraitImage: {
    width: 76,
    height: 76,
    maxWidth: 76,
    maxHeight: 76,
  },
  encounterPartyInitial: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 30,
  },
  encounterPartyName: {
    maxWidth: 78,
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 12,
    marginTop: 4,
  },
  encounterPartyClass: {
    maxWidth: 78,
    color: '#BDA476',
    fontFamily: 'serif',
    fontSize: 10,
  },
  encounterPartyEmpty: {
    color: '#BDAE98',
    fontFamily: 'serif',
    fontSize: 13,
    paddingVertical: 9,
  },
  encounterDivider: {
    height: 1,
    marginTop: 14,
    marginBottom: 11,
    backgroundColor: 'rgba(196, 151, 76, 0.62)',
  },
  encounterAllyHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 12,
    marginBottom: 9,
  },
  encounterAllyIcon: {
    color: '#DDB76F',
    fontSize: 20,
  },
  encounterAllyPortraitFallback: {
    width: 60,
    height: 62,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#987443',
    borderRadius: 5,
    backgroundColor: '#10202B',
  },
  encounterEnemiesHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 9,
  },
  encounterEnemiesTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  encounterSkull: {
    color: '#DDB76F',
    fontSize: 22,
  },
  addEnemyButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#D3A54D',
    borderRadius: 6,
    backgroundColor: 'rgba(167, 122, 49, 0.16)',
  },
  addEnemyPlus: {
    color: '#E8B95F',
    fontSize: 19,
  },
  addEnemyButtonText: {
    color: '#F2D18A',
    fontFamily: 'serif',
    fontSize: 14,
    fontWeight: '600',
  },
  encounterEnemyRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    padding: 6,
    borderWidth: 1,
    borderColor: 'rgba(196, 151, 76, 0.6)',
    borderRadius: 7,
    backgroundColor: 'rgba(5, 14, 22, 0.92)',
  },
  encounterEnemyPortrait: {
    width: 60,
    height: 62,
    flexShrink: 0,
    borderWidth: 1,
    borderColor: '#987443',
    borderRadius: 5,
  },
  encounterEnemyInfo: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  encounterEnemyName: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 16,
    fontWeight: '700',
  },
  encounterEnemyMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 4,
  },
  encounterEnemyInitiative: {
    color: '#C8B99D',
    fontFamily: 'serif',
    fontSize: 11,
  },
  encounterEnemyModeBadge: {
    color: '#D9B66D',
    fontFamily: 'serif',
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#8F713D',
    borderRadius: 10,
  },
  enemyRowIconButton: {
    width: 28,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enemyRowEditIcon: {
    color: '#D8C9AB',
    fontSize: 18,
  },
  enemyRowRemoveIcon: {
    color: '#E25F4E',
    fontSize: 25,
    lineHeight: 28,
  },
  encounterEmptyEnemies: {
    minHeight: 78,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(196, 151, 76, 0.55)',
    borderRadius: 7,
    backgroundColor: 'rgba(5, 14, 22, 0.7)',
  },
  encounterEmptyEnemiesTitle: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 14,
  },
  encounterEmptyEnemiesText: {
    color: '#BDAE98',
    fontFamily: 'serif',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 3,
  },
  encounterSummaryBar: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#A77A31',
    borderRadius: 7,
    backgroundColor: 'rgba(5, 14, 22, 0.86)',
  },
  encounterSummaryIcon: {
    color: '#DDB76F',
    fontSize: 18,
  },
  encounterSummaryText: {
    color: '#E1D1B5',
    fontFamily: 'serif',
    fontSize: 12,
    textAlign: 'center',
  },
  encounterEditorFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    paddingHorizontal: 18,
    paddingTop: 9,
    paddingBottom: Platform.OS === 'ios' ? 20 : 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(196, 151, 76, 0.42)',
    backgroundColor: '#030A12',
  },
  encounterEditorDeleteButton: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(226, 95, 78, 0.65)',
    borderRadius: 6,
  },
  encounterEditorDeleteText: {
    color: '#E88A7F',
    fontFamily: 'serif',
    fontSize: 12,
    fontWeight: '700',
  },
  encounterSaveButton: {
    flex: 1,
    minHeight: 48,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C69A50',
    borderRadius: 7,
    backgroundColor: 'rgba(5, 14, 22, 0.95)',
  },
  encounterSaveButtonText: {
    color: '#EBC77D',
    fontFamily: 'serif',
    fontSize: 15,
    fontWeight: '700',
  },
  encounterOpenLobbyButton: {
    flex: 1,
    minHeight: 48,
    minWidth: 130,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#F0C05D',
    borderRadius: 7,
    backgroundColor: '#80541C',
    shadowColor: '#E8B95F',
    shadowOpacity: 0.65,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  encounterOpenLobbyDisabled: {
    opacity: 0.48,
  },
  encounterOpenLobbyIcon: {
    color: '#F4DDAE',
    fontSize: 18,
  },
  encounterOpenLobbyText: {
    color: '#FFF0C5',
    fontFamily: 'serif',
    fontSize: 15,
    fontWeight: '700',
  },
  encounterSaveDraftButton: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 5,
  },
  encounterSaveDraftText: {
    color: '#9F927B',
    fontFamily: 'serif',
    fontSize: 12,
  },
  enemyPickerBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 18,
    backgroundColor: 'rgba(0, 4, 9, 0.94)',
  },
  enemyPickerCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '100%',
    padding: 14,
    borderWidth: 1,
    borderColor: '#C69A50',
    borderRadius: 12,
    backgroundColor: '#07111B',
  },
  enemyPickerHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  enemyPickerTitle: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 24,
    fontWeight: '700',
  },
  enemyPickerCloseButton: {
    position: 'absolute',
    right: 0,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#B78A43',
    borderRadius: 17,
  },
  enemyPickerCloseText: {
    color: '#EAD5AA',
    fontSize: 26,
    lineHeight: 28,
    marginTop: -2,
  },
  enemyPickerContent: {
    paddingBottom: 8,
  },
  enemySearchInput: {
    minHeight: 42,
    marginTop: 7,
    marginBottom: 11,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#53606A',
    borderRadius: 7,
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 14,
    backgroundColor: '#0A1722',
  },
  customEnemyCreateButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 11,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#B78A43',
    borderRadius: 7,
    backgroundColor: '#182315',
  },
  customEnemyCreateButtonDisabled: {
    opacity: 0.55,
  },
  customEnemyCreateButtonText: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  enemyPresetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  enemyPresetCard: {
    width: '31.5%',
    minWidth: 82,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#80683D',
    borderRadius: 7,
    backgroundColor: '#0B1721',
  },
  enemyPresetCardSelected: {
    borderColor: '#F3C45D',
    shadowColor: '#E8B95F',
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  enemyPresetImage: {
    width: '100%',
    height: 76,
  },
  enemyPresetName: {
    color: '#EEE1C9',
    fontFamily: 'serif',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 4,
  },
  customEnemyPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  customEnemyPreview: {
    width: 72,
    height: 72,
    flexShrink: 0,
    borderWidth: 1,
    borderColor: '#987443',
    borderRadius: 7,
    backgroundColor: '#0B1721',
  },
  customEnemyPreviewHint: {
    flex: 1,
    color: '#BDAE98',
    fontFamily: 'serif',
    fontSize: 12,
  },
  enemySearchEmpty: {
    color: '#BDAE98',
    fontFamily: 'serif',
    textAlign: 'center',
    paddingVertical: 16,
  },
  enemyFormNameInput: {
    minHeight: 42,
    marginTop: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#53606A',
    borderRadius: 6,
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 15,
    backgroundColor: '#0A1722',
  },
  enemyQuantityInitiativeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 10,
  },
  enemyHpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  enemyHpInput: {
    width: 74,
    height: 36,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#7C6745',
    borderRadius: 6,
    color: '#F4DDAE',
    textAlign: 'center',
    backgroundColor: '#0A1722',
  },
  enemyFormLabel: {
    color: '#D7C6A8',
    fontFamily: 'serif',
    fontSize: 12,
  },
  enemyQuantityControl: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#7C6745',
    borderRadius: 6,
  },
  enemyQuantityButton: {
    width: 31,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enemyQuantityButtonText: {
    color: '#E8B95F',
    fontSize: 19,
  },
  enemyQuantityInput: {
    width: 36,
    height: 34,
    color: '#F4DDAE',
    textAlign: 'center',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(124, 103, 69, 0.7)',
  },
  enemyInitiativeInput: {
    width: 56,
    height: 36,
    paddingHorizontal: 5,
    borderWidth: 1,
    borderColor: '#7C6745',
    borderRadius: 6,
    color: '#F4DDAE',
    textAlign: 'center',
    backgroundColor: '#0A1722',
  },
  enemyModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 11,
  },
  enemyModeOptions: {
    flex: 1,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#80683D',
    borderRadius: 6,
  },
  enemyModeButton: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  enemyModeButtonSelected: {
    borderWidth: 1,
    borderColor: '#F0C05D',
    borderRadius: 6,
    backgroundColor: 'rgba(142, 99, 33, 0.38)',
  },
  enemyModeButtonText: {
    color: '#BDAE98',
    fontFamily: 'serif',
    fontSize: 12,
  },
  enemyModeButtonTextSelected: {
    color: '#FFE8B0',
  },
  enemyModeDescription: {
    color: '#AEB7BC',
    fontFamily: 'serif',
    fontSize: 11,
    marginTop: 7,
  },
  enemyArrivalPanel: {
    gap: 8,
    marginTop: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(196, 151, 76, 0.35)',
    borderRadius: 7,
    backgroundColor: 'rgba(3, 10, 18, 0.62)',
  },
  enemyArrivalRoundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  enemyArrivalDescription: {
    color: '#BDB29F',
    flex: 1,
    fontFamily: 'serif',
    fontSize: 12,
    lineHeight: 18,
  },
  enemyArrivalRoundInput: {
    width: 64,
    minHeight: 40,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#987443',
    borderRadius: 6,
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 16,
    textAlign: 'center',
    backgroundColor: '#09131E',
  },
  enemyArrivalNoteInput: {
    minHeight: 56,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#80683D',
    borderRadius: 6,
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 13,
    textAlignVertical: 'top',
    backgroundColor: '#09131E',
  },
  enemyPickerAddButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#F0C05D',
    borderRadius: 7,
    backgroundColor: '#80541C',
  },
  enemyPickerAddButtonDisabled: {
    borderColor: '#65583F',
    backgroundColor: '#29251D',
  },
  enemyPickerAddButtonText: {
    color: '#FFF0C5',
    fontFamily: 'serif',
    fontSize: 15,
    fontWeight: '700',
  },
  emptyEncountersPanel: {
    minHeight: 132,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(196, 151, 76, 0.48)',
    borderRadius: 8,
    backgroundColor: 'rgba(5, 14, 22, 0.84)',
  },
  encounterCard: {
    minHeight: 132,
    flexDirection: 'row',
    marginBottom: 12,
    padding: 7,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(196, 151, 76, 0.68)',
    borderRadius: 8,
    backgroundColor: 'rgba(5, 14, 22, 0.94)',
  },
  encounterArtwork: {
    width: 96,
    height: 116,
    maxHeight: 116,
    flexShrink: 0,
    borderRadius: 5,
    backgroundColor: '#10202B',
  },
  encounterDetails: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingLeft: 12,
    paddingVertical: 5,
  },
  encounterCardHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  encounterName: {
    flex: 1,
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 17,
    fontWeight: '700',
  },
  encounterStatusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: 10,
  },
  draftStatusBadge: {
    borderColor: '#827659',
    backgroundColor: 'rgba(130, 118, 89, 0.16)',
  },
  readyStatusBadge: {
    borderColor: '#61926C',
    backgroundColor: 'rgba(76, 130, 86, 0.18)',
  },
  progressStatusBadge: {
    borderColor: '#C69A50',
    backgroundColor: 'rgba(167, 122, 49, 0.19)',
  },
  encounterStatusText: {
    fontFamily: 'serif',
    fontSize: 10,
    fontWeight: '600',
  },
  draftStatusText: {
    color: '#C5B99F',
  },
  readyStatusText: {
    color: '#A8D2AE',
  },
  progressStatusText: {
    color: '#F2D18A',
  },
  encounterSummary: {
    color: '#BDAE98',
    fontFamily: 'serif',
    fontSize: 12,
    marginTop: 6,
  },
  encounterActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 10,
  },
  encounterEditButton: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: '#827659',
    borderRadius: 5,
  },
  encounterEditIcon: {
    color: '#D0BE9C',
    fontSize: 14,
  },
  encounterDeleteButton: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: 'rgba(226, 95, 78, 0.65)',
    borderRadius: 5,
  },
  encounterDeleteText: {
    color: '#E88A7F',
    fontFamily: 'serif',
    fontSize: 12,
    fontWeight: '700',
  },
  encounterLobbyButton: {
    minHeight: 34,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 7,
    borderWidth: 1,
    borderColor: '#B78A43',
    borderRadius: 5,
    backgroundColor: 'rgba(167, 122, 49, 0.17)',
  },
  encounterActionText: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 12,
    fontWeight: '600',
  },
  encounterLobbyIcon: {
    color: '#E8B95F',
    fontSize: 15,
  },
  encounterDisabledButton: {
    borderColor: '#514A3D',
    backgroundColor: 'rgba(74, 67, 53, 0.12)',
  },
  encounterDisabledText: {
    color: '#8D806B',
  },
  encounterResumeButton: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#C69A50',
    borderRadius: 5,
    backgroundColor: 'rgba(167, 122, 49, 0.18)',
  },
  encounterResumeIcon: {
    color: '#E8B95F',
    fontSize: 12,
  },
  encounterResumeText: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionTitle: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 27,
    fontWeight: '700',
  },
  graveyardSection: {
    paddingTop: 14,
  },
  graveyardHeading: {
    alignItems: 'center',
    marginBottom: 16,
  },
  graveyardTitle: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 34,
    fontWeight: '700',
    textAlign: 'center',
  },
  graveyardOrnament: {
    width: '78%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  graveyardRule: {
    height: StyleSheet.hairlineWidth,
    flex: 1,
    backgroundColor: 'rgba(196, 151, 76, 0.8)',
  },
  graveyardStar: {
    color: '#E8B95F',
    fontSize: 21,
    lineHeight: 24,
  },
  graveyardDescription: {
    color: '#BDAE98',
    fontFamily: 'serif',
    fontSize: 15,
    marginTop: 4,
    textAlign: 'center',
  },
  graveyardCard: {
    height: 142,
    maxHeight: 142,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 12,
    padding: 5,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#C69A50',
    borderRadius: 8,
    backgroundColor: 'rgba(5, 14, 22, 0.92)',
  },
  graveyardPortrait: {
    width: 88,
    height: 130,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(196, 151, 76, 0.65)',
    borderRadius: 5,
    backgroundColor: '#10202B',
  },
  graveyardPortraitImage: {
    width: 88,
    height: 130,
    maxWidth: 88,
    maxHeight: 130,
    flexShrink: 0,
  },
  graveyardCharacterInfo: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 8,
  },
  graveyardCharacterHeading: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  graveyardMenuButton: {
    width: 34,
    height: 30,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreCharacterButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#C69A50',
    borderRadius: 5,
    backgroundColor: 'rgba(167, 122, 49, 0.14)',
  },
  restoreCharacterText: {
    color: '#E8B95F',
    fontFamily: 'serif',
    fontSize: 14,
    fontWeight: '600',
  },
  graveyardActionRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  memorialCandle: {
    width: 54,
    height: 68,
    flexShrink: 0,
  },
  graveyardFooter: {
    alignItems: 'center',
    marginTop: 2,
    paddingVertical: 8,
  },
  graveyardFooterText: {
    color: '#BDAE98',
    fontFamily: 'serif',
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
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
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0, 5, 11, 0.84)',
  },
  combatScreenBackdrop: {
    justifyContent: 'flex-start',
    padding: 0,
    backgroundColor: '#020812',
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
  onlineLobbyModal: {
    position: 'relative',
    maxHeight: '84%',
    overflow: 'hidden',
  },
  onlineLobbyBackground: {
    ...StyleSheet.absoluteFill,
  },
  onlineLobbyBackgroundImage: {
    borderRadius: 11,
  },
  onlineLobbyBackgroundShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(2, 8, 13, 0.76)',
  },
  combatModal: {
    position: 'relative',
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
  combatFullScreen: {
    position: 'relative',
    flex: 1,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    overflow: 'hidden',
    backgroundColor: '#06111C',
  },
  combatScreenBackground: {
    ...StyleSheet.absoluteFill,
  },
  combatArtLayer: {
    ...StyleSheet.absoluteFill,
  },
  combatScreenBackgroundImage: {
    width: '100%',
    height: '100%',
  },
  combatScreenBackgroundShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(2, 9, 17, 0.72)',
  },
  combatDragonCorner: {
    position: 'absolute',
    top: -14,
    width: 142,
    height: 142,
    opacity: 0.55,
  },
  combatDragonLeft: {
    left: -12,
  },
  combatDragonRight: {
    right: -12,
  },
  combatBottomFlourish: {
    position: 'absolute',
    bottom: -4,
    width: 132,
    height: 110,
    opacity: 0.55,
  },
  combatBottomFlourishLeft: {
    left: -5,
  },
  combatBottomFlourishRight: {
    right: -5,
    transform: [{ scaleX: -1 }],
  },
  combatHeader: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  combatHeaderCompact: {
    minHeight: 58,
    gap: 6,
  },
  combatBackButton: {
    width: 42,
    height: 42,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(206, 163, 87, 0.7)',
    borderRadius: 22,
    backgroundColor: 'rgba(4, 14, 24, 0.84)',
  },
  combatHeaderTitles: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  combatScreenTitle: {
    color: '#F2D18B',
    fontFamily: 'serif',
    fontSize: 27,
    fontWeight: '700',
    letterSpacing: 2,
  },
  combatEncounterName: {
    maxWidth: '100%',
    color: '#D4C7B4',
    fontFamily: 'serif',
    fontSize: 14,
    textAlign: 'center',
  },
  combatLiveBadge: {
    minWidth: 58,
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 7,
    borderWidth: 1,
    borderColor: 'rgba(198, 154, 80, 0.6)',
    borderRadius: 5,
    backgroundColor: 'rgba(4, 14, 24, 0.86)',
  },
  combatLiveText: {
    color: '#F2D18B',
    fontFamily: 'serif',
    fontSize: 10,
    letterSpacing: 1,
  },
  combatHeaderDivider: {
    height: 1,
    marginTop: 5,
    backgroundColor: 'rgba(202, 157, 79, 0.62)',
  },
  combatRoundBar: {
    minHeight: 43,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(198, 154, 80, 0.56)',
    backgroundColor: 'rgba(3, 13, 22, 0.82)',
  },
  combatRoundDivider: {
    width: 1,
    height: 22,
    backgroundColor: 'rgba(202, 157, 79, 0.62)',
  },
  combatRoundLive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  combatLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#53D78A',
  },
  combatRoundLiveText: {
    color: '#89DDA5',
    fontFamily: 'serif',
    fontSize: 14,
  },
  currentTurnCard: {
    marginTop: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E6B759',
    borderRadius: 8,
    backgroundColor: 'rgba(3, 13, 22, 0.9)',
    shadowColor: '#F0B949',
    shadowOpacity: 0.46,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  currentTurnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  currentTurnEyebrow: {
    color: '#E8BD6B',
    fontFamily: 'serif',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
  currentTurnDivider: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(206, 163, 87, 0.64)',
  },
  currentTurnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  currentTurnPortrait: {
    width: 62,
    height: 62,
    flexShrink: 0,
    borderWidth: 1,
    borderColor: '#DBB461',
    borderRadius: 6,
  },
  currentTurnPortraitFallback: {
    width: 62,
    height: 62,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DBB461',
    borderRadius: 6,
    backgroundColor: '#0B1A27',
  },
  currentTurnPortraitInitial: {
    color: '#E8B95F',
    fontFamily: 'serif',
    fontSize: 30,
  },
  currentTurnInfo: {
    flex: 1,
    minWidth: 0,
  },
  currentTurnName: {
    color: '#F3E3C8',
    fontFamily: 'serif',
    fontSize: 22,
    fontWeight: '700',
  },
  currentTurnClass: {
    color: '#BEB5A9',
    fontFamily: 'serif',
    fontSize: 14,
    marginTop: 2,
  },
  currentTurnInitiative: {
    color: '#F3D28D',
    fontFamily: 'serif',
    fontSize: 44,
    fontWeight: '700',
    paddingHorizontal: 8,
  },
  initiativeSectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    marginBottom: 8,
  },
  initiativeSectionTitle: {
    color: '#E8BD6B',
    fontFamily: 'serif',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 3,
  },
  initiativeSectionDivider: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(206, 163, 87, 0.58)',
  },
  combatBackgroundImage: {
    ...StyleSheet.absoluteFill,
    borderRadius: 11,
    overflow: 'hidden',
  },
  combatBackgroundImageStyle: {
    borderRadius: 11,
  },
  combatBackgroundShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(2, 8, 13, 0.76)',
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
  characterPresetSection: {
    marginTop: 14,
  },
  characterPresetHint: {
    color: '#BDA476',
    fontFamily: 'serif',
    fontSize: 12,
    marginTop: 3,
    marginBottom: 8,
  },
  characterPresetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  characterPresetCard: {
    width: '31.5%',
    minWidth: 82,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#80683D',
    borderRadius: 7,
    backgroundColor: '#0B1721',
  },
  characterPresetCardSelected: {
    borderColor: '#F3C45D',
    shadowColor: '#E8B95F',
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  characterPresetImage: {
    width: '100%',
    height: 76,
  },
  characterPresetName: {
    color: '#EEE1C9',
    fontFamily: 'serif',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    paddingTop: 4,
  },
  characterPresetClass: {
    color: '#BDA476',
    fontFamily: 'serif',
    fontSize: 9,
    textAlign: 'center',
    paddingHorizontal: 2,
    paddingBottom: 4,
  },
  lobbyRoster: {
    maxHeight: 300,
    marginTop: 16,
  },
  onlineLobbyCallout: {
    marginTop: 8,
    marginBottom: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(196, 151, 76, 0.48)',
    borderRadius: 7,
    backgroundColor: 'rgba(5, 14, 22, 0.78)',
  },
  onlineLobbyStatus: {
    color: '#BDAE98',
    fontFamily: 'serif',
    fontSize: 12,
    lineHeight: 18,
  },
  onlineLobbyAction: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#C69A50',
    borderRadius: 6,
    backgroundColor: 'rgba(167, 122, 49, 0.16)',
  },
  onlineLobbyActionText: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  disabledAction: {
    opacity: 0.45,
  },
  onlineJoinCodePanel: {
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#C69A50',
    borderRadius: 7,
    backgroundColor: 'rgba(167, 122, 49, 0.12)',
  },
  onlineJoinCode: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 2,
  },
  onlineLobbyStateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  onlineLobbyState: {
    color: '#E8B95F',
    fontFamily: 'serif',
    fontSize: 12,
  },
  onlineLobbyRoster: {
    flexGrow: 0,
    maxHeight: 280,
    marginTop: 6,
  },
  onlineMemberRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(196, 151, 76, 0.3)',
  },
  onlineMemberText: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 9,
  },
  onlineCharactersTitle: {
    marginTop: 14,
  },
  dmRollActions: {
    gap: 6,
    marginBottom: 8,
  },
  dmParticipantCard: {
    marginBottom: 8,
    padding: 9,
    borderWidth: 1,
    borderColor: 'rgba(196, 151, 76, 0.42)',
    borderRadius: 6,
    backgroundColor: 'rgba(5, 14, 22, 0.72)',
  },
  dmParticipantTopRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  dmParticipantCheckbox: {
    width: 28,
    height: 28,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#987443',
    borderRadius: 4,
    backgroundColor: '#0B1924',
  },
  dmParticipantCheckboxSelected: {
    borderColor: '#E8B95F',
    backgroundColor: 'rgba(167, 122, 49, 0.4)',
  },
  dmParticipantCheckboxText: {
    color: '#F4DDAE',
    fontSize: 16,
    fontWeight: '700',
  },
  dmParticipantActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  dmManualRollInput: {
    width: 56,
    minHeight: 36,
    paddingHorizontal: 5,
    borderWidth: 1,
    borderColor: '#79613B',
    borderRadius: 5,
    backgroundColor: '#0B1924',
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 14,
    textAlign: 'center',
  },
  dmResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 6,
  },
  onlineCharacterRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(196, 151, 76, 0.3)',
  },
  characterClaimButton: {
    minWidth: 64,
    minHeight: 34,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#C69A50',
    borderRadius: 5,
    backgroundColor: 'rgba(167, 122, 49, 0.16)',
  },
  characterReleaseButton: {
    borderColor: '#987443',
    backgroundColor: 'rgba(5, 14, 22, 0.78)',
  },
  characterClaimText: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 12,
    fontWeight: '600',
  },
  closeOnlineLobbyButton: {
    minHeight: 42,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#8F5142',
    borderRadius: 6,
    backgroundColor: 'rgba(120, 48, 35, 0.18)',
  },
  closeOnlineLobbyText: {
    color: '#E9A18C',
    fontFamily: 'serif',
    fontSize: 14,
    fontWeight: '600',
  },
  onlineLobbyActionSpacer: {
    flex: 1,
  },
  lobbySectionTitle: {
    color: '#E8B95F',
    fontFamily: 'serif',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 5,
  },
  lobbyEnemyHeader: {
    marginTop: 16,
  },
  lobbyInitiativeEntry: {
    marginBottom: 8,
  },
  lobbyMemberRow: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(196, 151, 76, 0.3)',
  },
  lobbyMemberPortrait: {
    width: 40,
    height: 40,
    flexShrink: 0,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#987443',
    borderRadius: 5,
  },
  lobbyMemberInitial: {
    width: 40,
    height: 40,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#987443',
    borderRadius: 5,
    backgroundColor: '#10202B',
  },
  lobbyMemberInitialText: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 18,
  },
  lobbyMemberInfo: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 9,
  },
  lobbyMemberName: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 14,
  },
  lobbyMemberClass: {
    color: '#BDA476',
    fontFamily: 'serif',
    fontSize: 11,
    marginTop: 1,
  },
  lobbyInitiative: {
    color: '#E8B95F',
    fontFamily: 'serif',
    fontSize: 13,
  },
  lobbyEnemyInitiative: {
    color: '#BDA476',
    fontFamily: 'serif',
    fontSize: 12,
  },
  initiativeSubmission: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 4,
  },
  initiativeSubmissionResult: {
    flex: 1,
    color: '#BFE0C4',
    fontFamily: 'serif',
    fontSize: 12,
  },
  initiativeSubmissionBlock: {
    marginHorizontal: 10,
    paddingTop: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(196, 151, 76, 0.2)',
  },
  initiativeRollHint: {
    color: '#A8987D',
    fontFamily: 'serif',
    fontSize: 10,
  },
  initiativeSubmissionStale: {
    color: '#E9A18F',
  },
  initiativeRollInput: {
    width: 54,
    height: 29,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: '#8F713D',
    borderRadius: 5,
    color: '#F4DDAE',
    textAlign: 'center',
    backgroundColor: 'rgba(5, 14, 22, 0.9)',
  },
  initiativeRollButton: {
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#8F713D',
    borderRadius: 5,
    backgroundColor: 'rgba(167, 122, 49, 0.14)',
  },
  initiativeRollButtonText: {
    color: '#E8B95F',
    fontFamily: 'serif',
    fontSize: 11,
  },
  initiativeResetButton: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#8F713D',
    borderRadius: 5,
  },
  initiativeResetText: {
    color: '#E8B95F',
    fontFamily: 'serif',
    fontSize: 11,
  },
  initiativeSubmissionDisabled: {
    opacity: 0.45,
  },
  rollUnrolledButton: {
    alignSelf: 'flex-start',
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#A77A31',
    borderRadius: 5,
    backgroundColor: 'rgba(167, 122, 49, 0.14)',
  },
  rollUnrolledText: {
    color: '#E8B95F',
    fontFamily: 'serif',
    fontSize: 12,
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
  armorClassInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 14,
  },
  armorClassInput: {
    width: 76,
    minHeight: 40,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#8E703F',
    borderRadius: 6,
    color: '#F4DDAE',
    fontSize: 16,
    textAlign: 'center',
    backgroundColor: '#0A1722',
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
    color: '#F2D18B',
    fontFamily: 'serif',
    fontSize: 16,
    letterSpacing: 1,
  },
  currentTurn: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 15,
    marginTop: 6,
    textAlign: 'center',
  },
  initiativeList: {
    flex: 1,
    minHeight: 0,
  },
  initiativeListContent: {
    gap: Platform.OS === 'ios' ? 10 : 7,
    paddingTop: 2,
    paddingBottom: 16,
  },
  initiativeRow: {
    width: '100%',
    minHeight: Platform.OS === 'ios' ? 60 : 80,
    borderWidth: 1,
    borderColor: 'rgba(174, 139, 84, 0.48)',
    borderRadius: 7,
    backgroundColor: 'rgba(3, 14, 23, 0.88)',
  },
  currentInitiativeRow: {
    backgroundColor: 'rgba(49, 38, 20, 0.92)',
    overflow: 'visible',
    position: 'relative',
  },
  initiativeRowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Platform.OS === 'ios' ? 7 : 9,
    paddingHorizontal: Platform.OS === 'ios' ? 6 : 8,
    paddingVertical: Platform.OS === 'ios' ? 3 : 8,
    position: 'relative',
    zIndex: 3,
    elevation: 3,
  },
  activeTurnFrame: {
    width: '100%',
    height: '100%',
  },
  initiativeFrameWrapper: {
    alignSelf: 'stretch',
    marginHorizontal: 24,
    position: 'relative',
    overflow: 'visible',
  },
  activeTurnFrameLayer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? '-32%' : '-25%',
    right: Platform.OS === 'ios' ? -4 : -10,
    bottom: Platform.OS === 'ios' ? '-32%' : '-25%',
    left: Platform.OS === 'ios' ? -10 : -22,
    zIndex: 4,
    elevation: 4,
  },
  initiativeRank: {
    width: 24,
    flexShrink: 0,
    color: '#E8DDC8',
    fontFamily: 'serif',
    fontSize: 22,
    textAlign: 'center',
  },
  initiativePortrait: {
    width: Platform.OS === 'ios' ? 32 : 54,
    height: Platform.OS === 'ios' ? 32 : 58,
    flexShrink: 0,
    borderWidth: 1,
    borderColor: '#B18A4E',
    borderRadius: 6,
    backgroundColor: '#0B1721',
  },
  initiativePortraitFallback: {
    width: Platform.OS === 'ios' ? 32 : 54,
    height: Platform.OS === 'ios' ? 32 : 58,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#987443',
    borderRadius: 6,
    backgroundColor: '#0B1721',
  },
  initiativePortraitInitial: {
    color: '#E8B95F',
    fontFamily: 'serif',
    fontSize: Platform.OS === 'ios' ? 17 : 24,
  },
  initiativeCombatantInfo: {
    flex: 1,
    minWidth: 0,
  },
  combatHpControls: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  combatHpButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#8F713D',
    borderRadius: 15,
    backgroundColor: 'rgba(167, 122, 49, 0.18)',
  },
  combatHpValue: {
    minWidth: 64,
    color: '#CFC1A9',
    fontFamily: 'serif',
    fontSize: 12,
    textAlign: 'center',
  },
  initiativeName: {
    color: '#F1E4D2',
    fontFamily: 'serif',
    fontSize: Platform.OS === 'ios' ? 13 : 17,
    fontWeight: '600',
  },
  initiativeClass: {
    color: '#BDB4A8',
    fontFamily: 'serif',
    fontSize: Platform.OS === 'ios' ? 10 : 12,
    marginTop: 1,
  },
  initiativeCurrentLabel: {
    color: '#EBC46D',
    fontFamily: 'serif',
    fontSize: Platform.OS === 'ios' ? 9 : 12,
    marginTop: Platform.OS === 'ios' ? 0 : 2,
  },
  initiativeCalculation: {
    color: '#C5B9A8',
    fontFamily: 'serif',
    fontSize: Platform.OS === 'ios' ? 9 : 11,
    marginTop: Platform.OS === 'ios' ? 0 : 2,
  },
  initiativeScoreBox: {
    minWidth: Platform.OS === 'ios' ? 32 : 40,
    minHeight: Platform.OS === 'ios' ? 32 : 46,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(202, 157, 79, 0.32)',
  },
  initiativeScore: {
    color: '#F1D18D',
    fontFamily: 'serif',
    fontSize: Platform.OS === 'ios' ? 19 : 25,
    fontWeight: '600',
  },
  combatCharacterMenuButton: {
    width: 32,
    height: Platform.OS === 'ios' ? 32 : 40,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCombatAllyButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#B78A43',
    borderRadius: 6,
    backgroundColor: 'rgba(167, 122, 49, 0.14)',
  },
  addCombatAllyText: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 15,
    fontWeight: '700',
  },
  combatAllyFormScroll: {
    flexShrink: 1,
    marginTop: 6,
  },
  combatAllyFormContent: {
    paddingBottom: 4,
  },
  combatModalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(202, 157, 79, 0.45)',
  },
  endCombatButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: 'rgba(185, 103, 89, 0.65)',
    borderRadius: 7,
    backgroundColor: 'rgba(28, 15, 18, 0.86)',
  },
  endCombatText: {
    color: '#F0A59B',
    fontFamily: 'serif',
    fontSize: 14,
  },
  combatNextTurnButton: {
    minHeight: 48,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: '#F5D486',
    borderRadius: 7,
    backgroundColor: '#D8A64D',
    shadowColor: '#E6B859',
    shadowOpacity: 0.34,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  combatNextTurnText: {
    color: '#17120A',
    fontFamily: 'serif',
    fontSize: 16,
    fontWeight: '700',
  },
});
