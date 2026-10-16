import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useFonts } from 'expo-font';
import { Cinzel_400Regular } from '@expo-google-fonts/cinzel/400Regular';
import { Cinzel_600SemiBold } from '@expo-google-fonts/cinzel/600SemiBold';
import { Cinzel_700Bold } from '@expo-google-fonts/cinzel/700Bold';
import { SourceSans3_400Regular } from '@expo-google-fonts/source-sans-3/400Regular';
import { SourceSans3_600SemiBold } from '@expo-google-fonts/source-sans-3/600SemiBold';
import { SourceSans3_700Bold } from '@expo-google-fonts/source-sans-3/700Bold';
import { SymbolView } from 'expo-symbols';
import Slider from '@react-native-community/slider';
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
  type ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ensureSupabaseIdentity, isSupabaseConfigured, type SupabaseIdentity } from '@/lib/supabase';
import {
  claimOnlineLobbyCharacter,
  closeOnlineCombatLobby,
  activateOnlineCombatReinforcement,
  advanceOnlineCombatTurn,
  joinOnlineCombatLobby,
  leaveOnlineCombatLobby,
  loadOnlineLobbySnapshot,
  resetDmInitiative,
  restoreLastOnlineLobby,
  rollPlayerInitiative,
  submitDmPartyInitiative,
  startOnlineCombat,
  setOnlineParticipantHp,
  reviveOnlineParticipant,
  submitDmInitiative,
  submitPlayerInitiative,
  subscribeToOnlineCombatLobby,
  type OnlineDmParticipant,
  type OnlineInitiativeResult,
  type OnlineLobbyCharacter,
  type OnlineLobbySnapshot,
  PORTRAIT_URL_PREFIX,
} from '@/storage/online-lobbies';

const ACTIVE_TURN_FRAME = require('../../assets/images/active-turn-frame-wide.png');
const DEFEATED_FRAME = require('../../assets/images/defeated-frame.png');

function getCharacterPortrait(presetId: string | null): ImageSourcePropType | undefined {
  if (presetId?.startsWith(PORTRAIT_URL_PREFIX)) {
    return { uri: presetId.slice(PORTRAIT_URL_PREFIX.length) };
  }
  switch (presetId) {
    case 'dragonborn-wizard':
      return require('../../assets/images/character-presets/dragonborn-wizard.jpg');
    case 'tiefling-bard':
      return require('../../assets/images/character-presets/tiefling-bard.jpg');
    case 'halfling-rogue':
      return require('../../assets/images/character-presets/halfling-rogue.jpg');
    case 'dwarf-cleric':
      return require('../../assets/images/character-presets/dwarf-cleric.jpg');
    case 'elf-ranger':
      return require('../../assets/images/character-presets/elf-ranger.jpg');
    case 'human-fighter':
      return require('../../assets/images/character-presets/human-fighter.jpg');
    default:
      return undefined;
  }
}

function getCombatantPortrait(imageId: string | null): ImageSourcePropType | undefined {
  if (imageId?.startsWith(PORTRAIT_URL_PREFIX)) {
    return { uri: imageId.slice(PORTRAIT_URL_PREFIX.length) };
  }
  switch (imageId) {
    case 'bandit':
      return require('../../assets/images/encounter-enemies/bandit.jpg');
    case 'cultist':
      return require('../../assets/images/encounter-enemies/cultist.jpg');
    case 'dragon':
      return require('../../assets/images/encounter-enemies/dragon.jpg');
    case 'knight':
      return require('../../assets/images/encounter-enemies/knight.jpg');
    case 'lich':
      return require('../../assets/images/encounter-enemies/lich.jpg');
    case 'necromancer':
      return require('../../assets/images/encounter-enemies/necromancer.jpg');
    case 'ogre':
      return require('../../assets/images/encounter-enemies/ogre.jpg');
    case 'spider':
      return require('../../assets/images/encounter-enemies/spider.jpg');
    case 'vampire':
      return require('../../assets/images/encounter-enemies/vampire.jpg');
    case 'wolf':
      return require('../../assets/images/encounter-enemies/wolf.jpg');
    case 'goblin':
      return require('../../assets/images/encounter-enemies/goblin.png');
    case 'skeleton':
      return require('../../assets/images/encounter-enemies/skeleton.png');
    case 'mimic':
      return require('../../assets/images/encounter-enemies/mimic.png');
    case 'owlbear':
      return require('../../assets/images/encounter-enemies/owlbear.png');
    case 'zombie':
      return require('../../assets/images/encounter-enemies/zombie.png');
    default:
      return undefined;
  }
}

function getCombatSceneBackground(backgroundId: string | null) {
  switch (backgroundId) {
    case 'haunted-city':
      return require('../../assets/images/Haunted city under violet moonlight-6.png');
    case 'moonlit-forest':
      return require('../../assets/images/Moonlit Enchanted Forest-3.png');
    case 'frozen-fortress':
      return require('../../assets/images/Fortress Beneath the Frozen Peaks-4.png');
    case 'desert-ruins':
      return require('../../assets/images/Turquoise Light in Desert Ruins-5.png');
    case 'rose-castle':
      return require('../../assets/images/Rosecourt Castle at Sunset-2.png');
    case 'sunlit-harbor':
      return require('../../assets/images/Turquoise Bay and Sunlit Harbor-1.png');
    default:
      return undefined;
  }
}

function getCharacterResult(
  results: OnlineInitiativeResult[],
  characterId: string,
) {
  return results.find(
    (result) =>
      result.participant_type === 'character' &&
      result.participant_id === characterId,
  );
}

type OnlineCombatInitiativeRow = {
  key: string;
  name: string;
  type: 'character' | 'enemy' | 'ally';
  total: number | null;
  rawRoll: number | null;
  bonus: number | null;
  sortOrder: number;
  portraitPresetId: string | null;
  imageId: string | null;
  armorClass: number | null;
  visibleMemberCount: number;
  currentHp: number | null;
  maxHp: number | null;
  isDefeated?: boolean;
  className?: string;
  race?: string | null;
  playerName?: string;
};

const lobbyIconNames = {
  back: { ios: 'arrow.left', android: 'arrow_back', web: 'arrow_back' },
  copy: { ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' },
  dice: { ios: 'die.face.5', android: 'casino', web: 'casino' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
  hidden: { ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' },
  clock: { ios: 'clock', android: 'schedule', web: 'schedule' },
  expand: { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' },
  more: { ios: 'ellipsis', android: 'more_vert', web: 'more_vert' },
  swords: {
    ios: 'figure.fencing',
    android: 'sports_martial_arts',
    web: 'sports_martial_arts',
  },
} as const;

function LobbyIcon({
  name,
  size = 18,
  color = '#E8B95F',
}: {
  name: keyof typeof lobbyIconNames;
  size?: number;
  color?: string;
}) {
  return (
    <SymbolView
      name={lobbyIconNames[name]}
      size={size}
      tintColor={color}
      weight="medium"
    />
  );
}

function PanelCorners() {
  return (
    <View pointerEvents="none" style={styles.panelCorners}>
      <View style={[styles.panelCorner, styles.panelCornerTopLeft]} />
      <View style={[styles.panelCorner, styles.panelCornerTopRight]} />
      <View style={[styles.panelCorner, styles.panelCornerBottomLeft]} />
      <View style={[styles.panelCorner, styles.panelCornerBottomRight]} />
    </View>
  );
}

function isEndedStatus(status: OnlineDmParticipant['members'][number]['status']) {
  return status === 'defeated' || status === 'inactive';
}

export default function OnlineLobbyScreen() {
  const { join } = useLocalSearchParams<{ join?: string }>();
  const joinWithoutRestoring = join === '1';
  const [fontsLoaded, fontError] = useFonts({
    Cinzel_400Regular,
    Cinzel_600SemiBold,
    Cinzel_700Bold,
    SourceSans3_400Regular,
    SourceSans3_600SemiBold,
    SourceSans3_700Bold,
  });
  const [identity, setIdentity] = useState<SupabaseIdentity | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [manualRoll, setManualRoll] = useState('');
  const [dmRollInputs, setDmRollInputs] = useState<Record<string, string>>({});
  const [partyRollInputs, setPartyRollInputs] = useState<Record<string, string>>({});
  const [openPartyRollCharacter, setOpenPartyRollCharacter] = useState<string | null>(null);
  const [lobby, setLobby] = useState<OnlineLobbySnapshot | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [lobbyViewId, setLobbyViewId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const [selectedInitiativeKeys, setSelectedInitiativeKeys] = useState<string[]>([]);
  const [expandedHordes, setExpandedHordes] = useState<Record<string, boolean>>({});
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);
  const [isLobbyOptionsOpen, setIsLobbyOptionsOpen] = useState(false);
  const [isCloseConfirmationVisible, setIsCloseConfirmationVisible] = useState(false);
  const [isLeaveConfirmationVisible, setIsLeaveConfirmationVisible] = useState(false);
  const [isDmLeaveConfirmationVisible, setIsDmLeaveConfirmationVisible] = useState(false);
  const [hoveredControl, setHoveredControl] = useState<string | null>(null);
  const [dmListTab, setDmListTab] = useState<'enemies' | 'npcs' | 'reinforcements'>('enemies');
  const { width } = useWindowDimensions();
  const safeAreaInsets = useSafeAreaInsets();

  useEffect(() => {
    let isActive = true;
    if (!isSupabaseConfigured()) return;
    void ensureSupabaseIdentity()
      .then((resolvedIdentity) => {
        if (!isActive) return;
        setIdentity(resolvedIdentity);
        if (joinWithoutRestoring) {
          setLobby(null);
          return;
        }
        return restoreLastOnlineLobby(resolvedIdentity).then((snapshot) => {
          if (isActive && snapshot) setLobby(snapshot);
        });
      })
      .catch((error: unknown) => {
        if (isActive) {
          setIdentityError(
            error instanceof Error ? error.message : 'Device identity could not be created.',
          );
        }
      });
    return () => {
      isActive = false;
    };
  }, [joinWithoutRestoring]);

  useEffect(() => {
    const lobbyId = lobby?.lobby_id;
    if (!identity || !lobbyId) return;
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
          const snapshot = await loadOnlineLobbySnapshot(identity, lobbyId);
          if (isActive) setLobby(snapshot);
        } catch (error) {
          if (isActive) {
            setErrorMessage(
              error instanceof Error ? error.message : 'Online lobby could not be refreshed.',
            );
          }
        }
      } while (isActive && refreshAgain);
      isRefreshing = false;
    };
    const unsubscribe = subscribeToOnlineCombatLobby(
      identity,
      lobbyId,
      () => void refreshSnapshot(),
      (message) => {
        if (isActive) setErrorMessage(message);
      },
    );
    void refreshSnapshot();
    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [identity, lobby?.lobby_id]);

  async function handleJoinLobby() {
    if (isBusy) return;
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const deviceIdentity = identity ?? await ensureSupabaseIdentity();
      if (!identity) setIdentity(deviceIdentity);
      setLobby(await joinOnlineCombatLobby(deviceIdentity, joinCode, displayName, {
        remember: !joinWithoutRestoring,
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Lobby could not be joined.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleClaimCharacter(characterId: string | null) {
    if (!identity || !lobby || isBusy) return;
    setIsBusy(true);
    setErrorMessage(null);
    try {
      await claimOnlineLobbyCharacter(identity, lobby.lobby_id, characterId);
      setLobby(await loadOnlineLobbySnapshot(identity, lobby.lobby_id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Character claim could not be saved.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handlePlayerInitiative(rawRoll: number | null) {
    if (!identity || !lobby || isBusy) return;
    setIsBusy(true);
    setErrorMessage(null);
    try {
      await submitPlayerInitiative(identity, lobby.lobby_id, rawRoll);
      setManualRoll('');
      setLobby(await loadOnlineLobbySnapshot(identity, lobby.lobby_id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Initiative could not be submitted.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRollPlayerInitiative() {
    if (!identity || !lobby || isBusy) return;
    setIsBusy(true);
    setErrorMessage(null);
    try {
      await rollPlayerInitiative(identity, lobby.lobby_id);
      setLobby(await loadOnlineLobbySnapshot(identity, lobby.lobby_id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Initiative could not be rolled.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDmInitiative(
    initiativeKeys: string[],
    options: { rawRoll?: number; rollUnrolled?: boolean } = {},
  ) {
    if (!identity || !lobby || isBusy || lobby.role !== 'dm') return;
    setIsBusy(true);
    setErrorMessage(null);
    try {
      await submitDmInitiative(identity, lobby.lobby_id, initiativeKeys, options);
      setSelectedInitiativeKeys([]);
      setDmRollInputs({});
      setOpenActionMenu(null);
      setLobby(await loadOnlineLobbySnapshot(identity, lobby.lobby_id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Initiative could not be saved.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDmPartyInitiative(characterId: string, rawRoll: number) {
    if (
      !identity ||
      !lobby ||
      isBusy ||
      lobby.role !== 'dm' ||
      lobby.status !== 'open' ||
      lobby.combat_started ||
      getCharacterResult(lobby.initiative_results, characterId)
    ) return;
    setIsBusy(true);
    setErrorMessage(null);
    try {
      await submitDmPartyInitiative(identity, lobby.lobby_id, characterId, rawRoll);
      setOpenPartyRollCharacter(null);
      setPartyRollInputs((current) => ({ ...current, [characterId]: '' }));
      setLobby(await loadOnlineLobbySnapshot(identity, lobby.lobby_id));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Party initiative could not be saved.',
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function handleResetInitiative(initiativeKey: string) {
    if (!identity || !lobby || isBusy || lobby.role !== 'dm') return;
    setIsBusy(true);
    setErrorMessage(null);
    try {
      await resetDmInitiative(identity, lobby.lobby_id, initiativeKey);
      setOpenActionMenu(null);
      setLobby(await loadOnlineLobbySnapshot(identity, lobby.lobby_id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Initiative could not be reset.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleStartCombat() {
    if (
      !identity ||
      !lobby ||
      isBusy ||
      lobby.role !== 'dm' ||
      lobby.status !== 'open' ||
      lobby.combat_started
    ) return;
    setIsBusy(true);
    setErrorMessage(null);
    try {
      await startOnlineCombat(identity, lobby.lobby_id);
      setLobby(await loadOnlineLobbySnapshot(identity, lobby.lobby_id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Combat could not be started.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleActivateReinforcement(initiativeKey: string) {
    if (!identity || !lobby || isBusy || lobby.role !== 'dm' || !lobby.combat_started) return;
    setIsBusy(true);
    setErrorMessage(null);
    try {
      await activateOnlineCombatReinforcement(identity, lobby.lobby_id, initiativeKey);
      setLobby(await loadOnlineLobbySnapshot(identity, lobby.lobby_id));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Reinforcement could not be activated.',
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSetParticipantHp(participantId: string, currentHp: number) {
    if (!identity || !lobby || isBusy || lobby.role !== 'dm' || !lobby.combat_started) return;
    setIsBusy(true);
    setErrorMessage(null);
    try {
      await setOnlineParticipantHp(identity, lobby.lobby_id, participantId, currentHp);
      setLobby(await loadOnlineLobbySnapshot(identity, lobby.lobby_id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Hit points could not be saved.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleReviveParticipant(participantId: string, hp: number) {
    if (!identity || !lobby || isBusy || lobby.role !== 'dm' || !lobby.combat_started) return;
    setIsBusy(true);
    setErrorMessage(null);
    try {
      await reviveOnlineParticipant(identity, lobby.lobby_id, participantId, hp);
      setLobby(await loadOnlineLobbySnapshot(identity, lobby.lobby_id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Combatant could not be revived.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleAdvanceCombatTurn() {
    if (!identity || !lobby || isBusy || lobby.role !== 'dm' || !lobby.combat_started) return;
    setIsBusy(true);
    setErrorMessage(null);
    try {
      await advanceOnlineCombatTurn(identity, lobby.lobby_id);
      setLobby(await loadOnlineLobbySnapshot(identity, lobby.lobby_id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Combat round could not advance.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCloseLobby() {
    if (!identity || !lobby || isBusy || lobby.role !== 'dm') return;
    setIsBusy(true);
    setErrorMessage(null);
    try {
      await closeOnlineCombatLobby(identity, lobby.lobby_id);
      setIsCloseConfirmationVisible(false);
      setIsLobbyOptionsOpen(false);
      setLobby(await loadOnlineLobbySnapshot(identity, lobby.lobby_id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Lobby could not be closed.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleLeaveLobby() {
    if (!identity || !lobby || isBusy || lobby.role !== 'player') return;
    setIsBusy(true);
    setErrorMessage(null);
    try {
      await leaveOnlineCombatLobby(identity, lobby.lobby_id);
      setIsLeaveConfirmationVisible(false);
      setLobby(null);
      setJoinCode('');
      setDisplayName('');
      setManualRoll('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Lobby could not be left.');
    } finally {
      setIsBusy(false);
    }
  }

  function handleDmLeaveLobby() {
    if (!lobby || lobby.role !== 'dm' || isBusy) return;
    setIsDmLeaveConfirmationVisible(false);
    setIsLobbyOptionsOpen(false);
    if (router.canGoBack()) router.back();
    else router.replace('/campaigns');
  }

  async function handleCopyJoinCode() {
    if (!lobby?.join_code) return;
    setErrorMessage(null);
    try {
      await Clipboard.setStringAsync(lobby.join_code);
      setCopyStatus('Code copied');
    } catch (error) {
      setCopyStatus('');
      setErrorMessage(error instanceof Error ? error.message : 'Join code could not be copied.');
    }
  }

  function toggleInitiativeSelection(initiativeKey: string) {
    setSelectedInitiativeKeys((current) =>
      current.includes(initiativeKey)
        ? current.filter((key) => key !== initiativeKey)
        : [...current, initiativeKey],
    );
  }

  const partyInitiativeCharacters = lobby
    ? [...lobby.characters].sort((left, right) => {
        const leftResult = getCharacterResult(lobby.initiative_results, left.character_id);
        const rightResult = getCharacterResult(lobby.initiative_results, right.character_id);
        if (leftResult && rightResult) {
          return rightResult.total - leftResult.total ||
            left.name.localeCompare(right.name) ||
            left.character_id.localeCompare(right.character_id);
        }
        if (leftResult) return -1;
        if (rightResult) return 1;
        return left.name.localeCompare(right.name) ||
          left.character_id.localeCompare(right.character_id);
      })
    : [];
  const dmParticipants = lobby?.role === 'dm' ? lobby.dm_participants ?? [] : [];
  const activeDmParticipants = dmParticipants.filter(
    (participant) => !participant.members.every((member) => isEndedStatus(member.status)),
  );
  const reinforcementDmParticipants = activeDmParticipants.filter(
    (participant) => participant.arrival_mode === 'dm' &&
      participant.members.some((member) => member.status === 'scheduled'),
  );
  const regularDmParticipants = activeDmParticipants.filter(
    (participant) => !reinforcementDmParticipants.includes(participant),
  );
  const dmTabParticipants = {
    enemies: regularDmParticipants.filter(
      (participant) => participant.participant_type !== 'ally',
    ),
    npcs: regularDmParticipants.filter(
      (participant) => participant.participant_type === 'ally',
    ),
    reinforcements: reinforcementDmParticipants,
  };
  const visibleDmParticipants = dmTabParticipants[dmListTab];
  const endedDmParticipants = dmParticipants.filter(
    (participant) => participant.members.every((member) => isEndedStatus(member.status)),
  );
  const playerCount = lobby?.members.filter((member) => member.role === 'player').length ?? 0;
  const readyPartyCount = lobby?.characters.filter(
    (character) => Boolean(getCharacterResult(lobby.initiative_results, character.character_id)),
  ).length ?? 0;
  const readyDmCount = dmParticipants.filter(
    (participant) => lobby?.initiative_results.some(
      (result) => result.initiative_key === participant.initiative_key,
    ),
  ).length;
  const waitingInitiativeNames = [
    ...partyInitiativeCharacters
      .filter((character) => !getCharacterResult(lobby?.initiative_results ?? [], character.character_id))
      .map((character) => character.name),
    ...activeDmParticipants
      .filter((participant) =>
        !lobby?.initiative_results.some(
          (result) => result.initiative_key === participant.initiative_key,
        ))
      .map((participant) => participant.name),
  ];
  const waitingSummary = waitingInitiativeNames.length > 0
    ? `Waiting: ${waitingInitiativeNames.slice(0, 2).join(', ')}${
        waitingInitiativeNames.length > 2 ? ` +${waitingInitiativeNames.length - 2} more` : ''
      }`
    : 'All initiative results saved';
  const myMember = lobby?.members.find((member) => member.user_id === identity?.userId);
  const myCharacter = lobby?.characters.find(
    (character) => character.character_id === myMember?.claimed_character_id,
  );
  const myCharacterResult = myCharacter && lobby
    ? getCharacterResult(lobby.initiative_results, myCharacter.character_id)
    : undefined;
  const isCombatTrackerVisible = Boolean(
    lobby?.combat_started && lobbyViewId !== lobby.lobby_id,
  );
  const combatInitiativeRows = lobby?.combat_started
    ? [
        ...lobby.characters.map((character, index) => {
          const result = getCharacterResult(lobby.initiative_results, character.character_id);
          const claimant = lobby.members.find(
            (member) => member.claimed_character_id === character.character_id,
          );
          return {
            key: `character:${character.character_id}`,
            name: character.name,
            type: 'character' as const,
            total: result?.total ?? null,
            rawRoll: result?.raw_roll ?? null,
            bonus: result?.bonus ?? character.initiative_bonus,
            sortOrder: result?.sort_order ?? index,
            portraitPresetId: character.portrait_preset_id,
            imageId: null,
            armorClass: character.armor_class,
            visibleMemberCount: 1,
            currentHp: null,
            maxHp: null,
            className: character.class_name,
            race: character.race,
            playerName: claimant?.display_name,
          };
        }),
        ...(lobby.visible_combatants ?? []).map((participant) => {
          const result = lobby.initiative_results.find(
            (item) => item.initiative_key === participant.initiative_key,
          );
          return {
            key: participant.initiative_key,
            name: participant.name,
            type: participant.participant_type,
            total: participant.total,
            rawRoll: result?.raw_roll ?? null,
            bonus: result?.bonus ?? null,
            sortOrder: participant.sort_order,
            portraitPresetId: participant.portrait_preset_id,
            imageId: participant.image_id,
            armorClass: participant.armor_class ?? null,
            visibleMemberCount: participant.visible_member_count,
            currentHp: participant.current_hp ?? null,
            maxHp: participant.max_hp ?? null,
            isDefeated: participant.is_defeated === true,
          };
        }),
      ].sort((left, right) => {
        if (left.total !== null && right.total !== null) {
          const initiativeDifference = right.total - left.total;
          if (initiativeDifference !== 0) return initiativeDifference;
        }
        if (left.total !== right.total) {
          if (left.total !== null) return -1;
          if (right.total !== null) return 1;
        }
        const partyPriority =
          Number(right.type === 'character') - Number(left.type === 'character');
        return partyPriority ||
          left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }) ||
          left.key.localeCompare(right.key);
      }) satisfies OnlineCombatInitiativeRow[]
    : [];
  const sceneBackground = (lobby ? getCombatSceneBackground(lobby.background_id) : undefined) ??
    require('../../assets/images/combat-background.png');
  const totalInitiativeCount = lobby
    ? lobby.characters.length + (lobby.role === 'dm' ? dmParticipants.length : 0)
    : 0;
  const totalReadyCount = readyPartyCount + (lobby?.role === 'dm' ? readyDmCount : 0);
  const readinessPercent = totalInitiativeCount > 0
    ? Math.round((totalReadyCount / totalInitiativeCount) * 100)
    : 0;

  if (!fontsLoaded) {
    return (
      <View style={styles.fontLoadingScreen}>
        {fontError ? (
          <Text style={styles.fontLoadError}>
            Lobby fonts could not be loaded: {fontError.message}
          </Text>
        ) : (
          <ActivityIndicator color="#E8B95F" />
        )}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.keyboardAvoiding}
    >
      <View
        style={[
          styles.screen,
          {
            paddingTop: Math.max(safeAreaInsets.top, 14),
            paddingBottom: Math.max(safeAreaInsets.bottom, 8),
          },
        ]}
      >
        <View pointerEvents="none" style={styles.sceneBackground}>
          <ImageBackground
            resizeMode="cover"
            source={sceneBackground}
            imageStyle={styles.sceneBackgroundImage}
            style={StyleSheet.absoluteFill}
          >
            <View style={styles.sceneShade} />
          </ImageBackground>
          <ImageBackground
            resizeMode="cover"
            source={sceneBackground}
            imageStyle={styles.bottomSceneImage}
            style={styles.bottomSceneArtwork}
          >
            <View style={styles.bottomSceneShade} />
          </ImageBackground>
          <Image
            accessibilityElementsHidden
            resizeMode="contain"
            source={require('../../assets/images/lobby-ornaments/dragon-left-corner.png')}
            style={[
              styles.leftDragonCorner,
              width < 430 && styles.compactDragonCorner,
            ]}
          />
          <Image
            accessibilityElementsHidden
            resizeMode="contain"
            source={require('../../assets/images/lobby-ornaments/dragon-right-corner.png')}
            style={[
              styles.rightDragonCorner,
              width < 430 && styles.compactDragonCorner,
            ]}
          />
          <Image
            accessibilityElementsHidden
            resizeMode="contain"
            source={require('../../assets/images/lobby-ornaments/acanthus-corner.png')}
            style={[
              styles.acanthusCorner,
              width < 430 && styles.compactAcanthusCorner,
            ]}
          />
        </View>
        <View style={styles.contentFrame}>
          <View style={[styles.header, width < 430 && styles.compactHeader]}>
            <Pressable
              accessibilityLabel={isCombatTrackerVisible ? 'Return to lobby' : 'Back'}
              accessibilityRole="button"
              onBlur={() => setHoveredControl(null)}
              onFocus={() => setHoveredControl('back')}
              onHoverIn={() => setHoveredControl('back')}
              onHoverOut={() => setHoveredControl(null)}
              onPress={() => {
                if (isCombatTrackerVisible && lobby) {
                  setLobbyViewId(lobby.lobby_id);
                  return;
                }
                if (router.canGoBack()) router.back();
                else router.replace('/campaigns');
              }}
              style={({ pressed }) => [
                styles.backButton,
                hoveredControl === 'back' && styles.buttonHovered,
                pressed && styles.buttonPressed,
              ]}
            >
              <View style={styles.backButtonContent}>
                <LobbyIcon name="back" size={17} />
                  <Text style={styles.backText}>
                    {isCombatTrackerVisible ? 'Lobby' : 'Back'}
                  </Text>
                </View>
              </Pressable>
              <View style={[styles.headerTitle, width < 430 && styles.compactHeaderTitle]}>
                <Text style={[styles.title, width < 430 && styles.compactTitle]}>
                  {isCombatTrackerVisible ? 'Combat' : 'Combat Lobby'}
                </Text>
              {lobby && (
                <Text style={styles.encounterName}>
                  {lobby.encounter_name}
                </Text>
              )}
            </View>
            {lobby && (
              <View style={[styles.roleBadge, lobby.role === 'dm' && styles.dmBadge]}>
                <Text style={styles.roleBadgeText}>
                  {lobby.role === 'dm' ? 'DM VIEW' : 'PLAYER VIEW'}
                </Text>
              </View>
            )}
          </View>

          {!lobby ? (
            <ScrollView
              nativeID="online-lobby-scroll"
              style={styles.mainScroll}
              contentContainerStyle={styles.joinContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.panel}>
                <PanelCorners />
                <Text style={styles.panelTitle}>Join a Combat Lobby</Text>
                <Text style={styles.description}>
                  Enter the 12-character code from your DM. This device uses its saved identity so your character claim remains yours when you return.
                </Text>
                <Text style={styles.fieldLabel}>Lobby code</Text>
                <TextInput
                  accessibilityLabel="12-character lobby code"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={12}
                  onChangeText={(value) => setJoinCode(value.toUpperCase().replace(/\s/g, ''))}
                  placeholder="AB12CD34EF56"
                  placeholderTextColor="#887A64"
                  style={styles.input}
                  value={joinCode}
                />
                <Text style={styles.fieldLabel}>Player name</Text>
                <TextInput
                  accessibilityLabel="Player display name"
                  autoCapitalize="words"
                  maxLength={40}
                  onChangeText={setDisplayName}
                  placeholder="Your name"
                  placeholderTextColor="#887A64"
                  style={styles.input}
                  value={displayName}
                />
                {!isSupabaseConfigured() ? (
                  <Text style={styles.error}>
                    Configure the Supabase project first. Follow SUPABASE_SETUP.md.
                  </Text>
                ) : identityError ? (
                  <Text style={styles.error}>{identityError}</Text>
                ) : identity ? (
                  <Text style={styles.hint}>Device identity ready for this installation.</Text>
                ) : (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color="#E8B95F" />
                    <Text style={styles.hint}>Preparing your device identity…</Text>
                  </View>
                )}
                {errorMessage && <Text accessibilityLiveRegion="polite" style={styles.error}>{errorMessage}</Text>}
                <Pressable
                  accessibilityRole="button"
                  disabled={!isSupabaseConfigured() || isBusy}
                  onPress={() => void handleJoinLobby()}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    (!isSupabaseConfigured() || isBusy) && styles.disabled,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.primaryText}>{isBusy ? 'Joining…' : 'Join Lobby'}</Text>
                </Pressable>
              </View>
            </ScrollView>
          ) : (
            <>
              <ScrollView
                nativeID="online-lobby-scroll"
                style={styles.mainScroll}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
              >
                {isCombatTrackerVisible && lobby ? (
                  <OnlineCombatTracker
                    round={lobby.current_round}
                    currentTurnKey={lobby.current_turn_key}
                    rows={combatInitiativeRows}
                    errorMessage={errorMessage}
                    width={width}
                    dmParticipants={lobby.role === 'dm' ? dmParticipants : undefined}
                    isBusy={isBusy}
                    onSetHp={handleSetParticipantHp}
                    onRevive={handleReviveParticipant}
                  />
                ) : (
                  <>
                {lobby.role === 'dm' && lobby.join_code && (
                  <View style={styles.inviteCard}>
                    <PanelCorners />
                    <View style={styles.inviteInfo}>
                      <Text style={styles.eyebrow}>PLAYER JOIN CODE</Text>
                      <Text
                        selectable
                        style={[styles.joinCode, width < 380 && styles.compactJoinCode]}
                      >
                        {lobby.join_code}
                      </Text>
                      <View style={styles.openStatusRow}>
                        <View
                          style={[
                            styles.statusDot,
                            lobby.status !== 'open' && styles.closedStatusDot,
                          ]}
                        />
                        <Text style={lobby.status === 'open' ? styles.openStatus : styles.closedStatus}>
                          {lobby.status === 'open' ? 'Lobby open · Live updates' : 'Lobby closed'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.inviteActions}>
                      <Pressable
                        accessibilityRole="button"
                        onBlur={() => setHoveredControl(null)}
                        onFocus={() => setHoveredControl('copy')}
                        onHoverIn={() => setHoveredControl('copy')}
                        onHoverOut={() => setHoveredControl(null)}
                        onPress={() => void handleCopyJoinCode()}
                        style={({ pressed }) => [
                          styles.secondaryButton,
                          hoveredControl === 'copy' && styles.buttonHovered,
                          pressed && styles.buttonPressed,
                        ]}
                      >
                        <View style={styles.buttonContent}>
                          <LobbyIcon name="copy" size={17} />
                          <Text style={styles.secondaryButtonText}>Copy Code</Text>
                        </View>
                      </Pressable>
                      <Text style={styles.joinedCount}>
                        {playerCount} player{playerCount === 1 ? '' : 's'} joined
                      </Text>
                      {copyStatus ? <Text style={styles.successText}>{copyStatus}</Text> : null}
                    </View>
                    {totalInitiativeCount > 0 && (
                      <View style={styles.inviteReadiness}>
                        <Text style={styles.inviteReadinessLabel}>
                          {totalReadyCount} of {totalInitiativeCount} initiative results saved
                          {' · optional before start'}
                        </Text>
                        <View
                          accessibilityLabel={`${readinessPercent}% of initiative rolls ready`}
                          accessibilityRole="progressbar"
                          accessibilityValue={{
                            min: 0,
                            max: 100,
                            now: readinessPercent,
                          }}
                          style={styles.progressTrack}
                        >
                          <View
                            style={[
                              styles.progressFill,
                              { width: `${readinessPercent}%` as `${number}%` },
                            ]}
                          />
                        </View>
                      </View>
                    )}
                  </View>
                )}

                {lobby.role === 'player' && myCharacter && (
                  <PlayerInitiativeCard
                    character={myCharacter}
                    result={myCharacterResult}
                    manualRoll={manualRoll}
                    setManualRoll={setManualRoll}
                    isBusy={isBusy}
                    isOpen={lobby.status === 'open' && !lobby.combat_started}
                    onRoll={() => void handleRollPlayerInitiative()}
                    onSubmit={(rawRoll) => void handlePlayerInitiative(rawRoll)}
                  />
                )}

                {lobby.combat_started && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeading}>
                      <Text style={styles.sectionTitle}>COMBAT INITIATIVE</Text>
                      {lobby.role === 'dm' ? (
                        <Pressable
                          accessibilityRole="button"
                          disabled={isBusy}
                          onPress={() => void handleAdvanceCombatTurn()}
                          style={({ pressed }) => [
                            styles.advanceRoundButton,
                            isBusy && styles.disabled,
                            pressed && styles.buttonPressed,
                          ]}
                        >
                          <Text style={styles.advanceRoundButtonText}>
                            {isBusy ? 'Please wait…' : 'Next Turn'}
                          </Text>
                        </Pressable>
                      ) : (
                        <Text style={styles.sectionMeta}>Round {lobby.current_round}</Text>
                      )}
                    </View>
                    {combatInitiativeRows.map((participant) => (
                      <View
                        key={participant.key}
                        style={[
                          styles.combatRow,
                          participant.key === lobby.current_turn_key &&
                            styles.combatRowCurrentTurn,
                        ]}
                      >
                        <ParticipantPortrait
                          name={participant.name}
                          image={participant.type === 'character'
                            ? getCharacterPortrait(participant.portraitPresetId)
                            : getCombatantPortrait(participant.imageId)}
                          large
                        />
                        <View style={styles.participantInfo}>
                          {participant.key === lobby.current_turn_key && (
                            <Text style={styles.currentTurnRowLabel}>CURRENT TURN</Text>
                          )}
                          <Text style={styles.participantName}>{participant.name}</Text>
                          <Text style={styles.participantSubtext}>
                            {participant.type === 'character'
                              ? 'Player character'
                              : participant.type === 'ally' ? 'Ally' : 'Enemy'}
                            {participant.armorClass !== null
                              ? ` · AC ${participant.armorClass}`
                              : ''}
                            {participant.visibleMemberCount > 1
                              ? ` · ${participant.visibleMemberCount} visible`
                              : ''}
                          </Text>
                        </View>
                        <View style={styles.resultBox}>
                          <Text style={styles.resultTotal}>
                            {participant.total === null ? '—' : participant.total}
                          </Text>
                          {participant.rawRoll !== null && participant.bonus !== null && (
                            <Text style={styles.resultCalculation}>
                              {participant.rawRoll} {participant.bonus >= 0 ? '+' : '−'} {Math.abs(participant.bonus)}
                            </Text>
                          )}
                        </View>
                      </View>
                    ))}
                    {combatInitiativeRows.length === 0 && (
                      <Text style={styles.hint}>No active combatants are visible.</Text>
                    )}
                  </View>
                )}

                <View style={styles.section}>
                  <View style={styles.sectionHeading}>
                    <View style={styles.sectionHeadingTitle}>
                      <Text style={styles.sectionTitle}>PARTY</Text>
                      <View style={styles.sectionDivider} />
                    </View>
                    {!lobby.combat_started && (
                      <Text style={styles.sectionMeta}>
                        {readyPartyCount} of {lobby.characters.length} ready
                      </Text>
                    )}
                  </View>
                  <View style={styles.partyGrid}>
                    {partyInitiativeCharacters.map((character) => (
                      <PartyCharacterCard
                        key={character.character_id}
                        character={character}
                        result={getCharacterResult(lobby.initiative_results, character.character_id)}
                        claimant={lobby.members.find(
                          (member) => member.claimed_character_id === character.character_id,
                        )}
                        currentUserId={identity?.userId}
                        isPlayer={lobby.role === 'player'}
                        canClaim={
                          lobby.status === 'open' &&
                          !lobby.combat_started &&
                          !isBusy &&
                          (!myMember?.claimed_character_id ||
                            myMember.claimed_character_id === character.character_id)
                        }
                        isDm={lobby.role === 'dm'}
                        canEnterDmRoll={
                          lobby.status === 'open' &&
                          !lobby.combat_started &&
                          !isBusy &&
                          !getCharacterResult(lobby.initiative_results, character.character_id)
                        }
                        isDmRollOpen={openPartyRollCharacter === character.character_id}
                        dmRollValue={partyRollInputs[character.character_id] ?? ''}
                        cardWidth="100%"
                        onClaim={(id) => void handleClaimCharacter(id)}
                        onToggleDmRoll={() => setOpenPartyRollCharacter((current) =>
                          current === character.character_id ? null : character.character_id,
                        )}
                        onDmRollValueChange={(value) => setPartyRollInputs((current) => ({
                          ...current,
                          [character.character_id]: value,
                        }))}
                        onSubmitDmRoll={(rawRoll) =>
                          void handleDmPartyInitiative(character.character_id, rawRoll)}
                      />
                    ))}
                  </View>
                  {lobby.characters.length === 0 && (
                    <Text style={styles.hint}>The DM has not added active party characters.</Text>
                  )}
                </View>

                {lobby.role === 'dm' && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeading}>
                      <View style={styles.headingWithBadge}>
                        <Text style={styles.sectionTitle}>ENEMIES &amp; NPCs</Text>
                        <Text style={styles.dmOnlyBadge}>DM ONLY</Text>
                      </View>
                      <View style={styles.sectionDivider} />
                    </View>
                    <View style={styles.dmActionBar}>
                      <Text style={styles.sectionMeta}>
                        {readyDmCount} of {dmParticipants.length} results
                      </Text>
                      <View style={styles.dmToolbar}>
                        <Pressable
                          accessibilityRole="button"
                          onBlur={() => setHoveredControl(null)}
                          disabled={
                            isBusy ||
                            selectedInitiativeKeys.length === 0 ||
                            lobby.status !== 'open' ||
                            lobby.combat_started
                          }
                          onFocus={() => setHoveredControl('roll-selected')}
                          onHoverIn={() => setHoveredControl('roll-selected')}
                          onHoverOut={() => setHoveredControl(null)}
                          onPress={() => void handleDmInitiative(selectedInitiativeKeys)}
                          style={({ pressed }) => [
                            styles.rollSelectedButton,
                            (isBusy || selectedInitiativeKeys.length === 0 ||
                              lobby.status !== 'open' || lobby.combat_started) && styles.disabled,
                            hoveredControl === 'roll-selected' && styles.buttonHovered,
                            pressed && styles.buttonPressed,
                          ]}
                        >
                          <View style={styles.buttonContent}>
                            <LobbyIcon name="dice" size={18} color="#17120A" />
                            <Text style={styles.rollSelectedText}>
                              Roll Selected{selectedInitiativeKeys.length
                                ? ` · ${selectedInitiativeKeys.length}`
                                : ''}
                            </Text>
                          </View>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          onBlur={() => setHoveredControl(null)}
                          disabled={
                            isBusy ||
                            lobby.status !== 'open' ||
                            lobby.combat_started ||
                            !dmParticipants.some((participant) =>
                              !lobby.initiative_results.some(
                                (result) => result.initiative_key === participant.initiative_key,
                              ),
                            )
                          }
                          onFocus={() => setHoveredControl('roll-unrolled')}
                          onHoverIn={() => setHoveredControl('roll-unrolled')}
                          onHoverOut={() => setHoveredControl(null)}
                          onPress={() => void handleDmInitiative([], { rollUnrolled: true })}
                          style={({ pressed }) => [
                            styles.rollUnrolledButton,
                            (isBusy || lobby.status !== 'open' || lobby.combat_started) &&
                              styles.disabled,
                            hoveredControl === 'roll-unrolled' && styles.buttonHovered,
                            pressed && styles.buttonPressed,
                          ]}
                        >
                          <View style={styles.buttonContent}>
                            <LobbyIcon name="dice" size={18} />
                            <Text style={styles.rollUnrolledText}>
                              {isBusy ? 'Rolling…' : 'Roll Unrolled'}
                            </Text>
                          </View>
                        </Pressable>
                      </View>
                    </View>
                    <View style={styles.dmListTabs}>
                      {([
                        ['enemies', 'Enemies'],
                        ['npcs', 'NPCs'],
                        ['reinforcements', 'Reinforcements'],
                      ] as const).map(([tab, label]) => (
                        <Pressable
                          key={tab}
                          accessibilityRole="tab"
                          accessibilityState={{ selected: dmListTab === tab }}
                          onPress={() => setDmListTab(tab)}
                          style={[
                            styles.dmListTab,
                            dmListTab === tab && styles.dmListTabActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.dmListTabText,
                              dmListTab === tab && styles.dmListTabTextActive,
                            ]}
                          >
                            {label} · {dmTabParticipants[tab].length}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <View style={styles.enemyGrid}>
                      {visibleDmParticipants.map((participant) => (
                        <View key={participant.initiative_key}>
                          <DmParticipantCard
                            participant={participant}
                            result={lobby.initiative_results.find(
                              (item) => item.initiative_key === participant.initiative_key,
                            )}
                            isSelected={selectedInitiativeKeys.includes(participant.initiative_key)}
                            isExpanded={Boolean(expandedHordes[participant.initiative_key])}
                            isMenuOpen={openActionMenu === participant.initiative_key}
                            manualValue={dmRollInputs[participant.initiative_key] ?? ''}
                            isBusy={isBusy}
                            canRoll={lobby.status === 'open' && !lobby.combat_started}
                            cardWidth="100%"
                            onToggleSelected={() => toggleInitiativeSelection(participant.initiative_key)}
                            onToggleExpanded={() => setExpandedHordes((current) => ({
                              ...current,
                              [participant.initiative_key]: !current[participant.initiative_key],
                            }))}
                            onToggleMenu={() => setOpenActionMenu((current) =>
                              current === participant.initiative_key ? null : participant.initiative_key,
                            )}
                            onManualValueChange={(value) => setDmRollInputs((current) => ({
                              ...current,
                              [participant.initiative_key]: value,
                            }))}
                            onRoll={() => void handleDmInitiative([participant.initiative_key])}
                            onEnterRoll={(rawRoll) => void handleDmInitiative(
                              [participant.initiative_key],
                              { rawRoll },
                            )}
                            onReset={() => void handleResetInitiative(participant.initiative_key)}
                          />
                          {participant.members.some((member) => member.status === 'scheduled') && (
                            <View style={styles.reinforcementStatus}>
                              <Text style={styles.reinforcementStatusText}>
                                {participant.arrival_mode === 'dm'
                                  ? `When Decided${participant.arrival_note ? ` · ${participant.arrival_note}` : ''}`
                                  : `Arrives at the start of round ${participant.arrival_round}`}
                              </Text>
                              {lobby.combat_started && participant.arrival_mode === 'dm' && (
                                <Pressable
                                  accessibilityRole="button"
                                  disabled={isBusy}
                                  onPress={() =>
                                    void handleActivateReinforcement(participant.initiative_key)
                                  }
                                  style={({ pressed }) => [
                                    styles.activateReinforcementButton,
                                    isBusy && styles.disabled,
                                    pressed && styles.buttonPressed,
                                  ]}
                                >
                                  <Text style={styles.activateReinforcementText}>
                                    Activate Now
                                  </Text>
                                </Pressable>
                              )}
                            </View>
                          )}
                        </View>
                      ))}
                    </View>
                    {dmParticipants.length > 0 && visibleDmParticipants.length === 0 && (
                      <Text style={styles.hint}>
                        {dmListTab === 'reinforcements'
                          ? 'No undecided reinforcements.'
                          : `No ${dmListTab === 'npcs' ? 'NPCs' : 'enemies'} in this encounter.`}
                      </Text>
                    )}
                    {endedDmParticipants.length > 0 && (
                      <View style={styles.inactiveSection}>
                        <Text style={styles.inactiveTitle}>DEFEATED &amp; INACTIVE</Text>
                        {endedDmParticipants.map((participant) => (
                          <DmParticipantCard
                            key={`ended-${participant.initiative_key}`}
                            participant={participant}
                            result={lobby.initiative_results.find(
                              (item) => item.initiative_key === participant.initiative_key,
                            )}
                            isSelected={false}
                            isExpanded={Boolean(expandedHordes[participant.initiative_key])}
                            isMenuOpen={openActionMenu === participant.initiative_key}
                            manualValue={dmRollInputs[participant.initiative_key] ?? ''}
                            isBusy={isBusy}
                            canRoll={false}
                            cardWidth="100%"
                            isEnded
                            onToggleSelected={() => undefined}
                            onToggleExpanded={() => setExpandedHordes((current) => ({
                              ...current,
                              [participant.initiative_key]: !current[participant.initiative_key],
                            }))}
                            onToggleMenu={() => setOpenActionMenu((current) =>
                              current === participant.initiative_key ? null : participant.initiative_key,
                            )}
                            onManualValueChange={(value) => setDmRollInputs((current) => ({
                              ...current,
                              [participant.initiative_key]: value,
                            }))}
                            onRoll={() => undefined}
                            onEnterRoll={(rawRoll) => void handleDmInitiative(
                              [participant.initiative_key],
                              { rawRoll },
                            )}
                            onReset={() => void handleResetInitiative(participant.initiative_key)}
                          />
                        ))}
                      </View>
                    )}
                    {dmParticipants.length === 0 && (
                      <Text style={styles.hint}>No enemies or NPCs were added to this encounter.</Text>
                    )}
                  </View>
                )}

                {errorMessage && (
                  <Text accessibilityLiveRegion="polite" style={styles.error}>
                    {errorMessage}
                  </Text>
                )}
                  </>
                )}
              </ScrollView>

              {isCombatTrackerVisible ? (
                <View style={styles.combatTrackerFooter}>
                  {lobby.role === 'dm' && (
                    <Pressable
                      accessibilityRole="button"
                      disabled={isBusy}
                      onPress={() => void handleAdvanceCombatTurn()}
                      style={({ pressed }) => [
                        styles.combatNextRoundButton,
                        isBusy && styles.disabled,
                        pressed && styles.buttonPressed,
                      ]}
                    >
                      <View style={styles.buttonContent}>
                        <LobbyIcon name="swords" size={18} color="#17130B" />
                        <Text style={styles.combatNextRoundText}>
                          {isBusy ? 'Please wait…' : 'Next Turn'}
                        </Text>
                      </View>
                    </Pressable>
                  )}
                  {lobby.role === 'dm' && (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {}}
                      style={({ pressed }) => [
                        styles.combatFinishButton,
                        pressed && styles.buttonPressed,
                      ]}
                    >
                      <Text style={styles.combatFinishText}>Finish Combat</Text>
                    </Pressable>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setLobbyViewId(lobby.lobby_id)}
                    style={({ pressed }) => [
                      styles.combatReturnButton,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.combatReturnText}>Return to Lobby</Text>
                  </Pressable>
                </View>
              ) : lobby.role === 'dm' ? (
                <View style={styles.footer}>
                  {lobby.combat_started ? (
                    <Text style={styles.footerStatus}>
                      Combat is active · Round {lobby.current_round}
                    </Text>
                  ) : lobby.status !== 'open' ? (
                    <Text style={styles.footerStatus}>Lobby is closed to new activity.</Text>
                  ) : (
                    <Text style={styles.footerStatus}>
                      {waitingSummary}
                    </Text>
                  )}
                  {lobby.status === 'open' && !lobby.combat_started && (
                    <Text style={styles.footerHint}>
                      Unrolled participants join without initiative.
                    </Text>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{
                      disabled: isBusy || (!lobby.combat_started && lobby.status !== 'open'),
                    }}
                    disabled={isBusy || (!lobby.combat_started && lobby.status !== 'open')}
                    onBlur={() => setHoveredControl(null)}
                    onFocus={() => setHoveredControl('start-combat')}
                    onHoverIn={() => setHoveredControl('start-combat')}
                    onHoverOut={() => setHoveredControl(null)}
                    onPress={() => {
                      if (lobby.combat_started) setLobbyViewId(null);
                      else void handleStartCombat();
                    }}
                    style={({ pressed }) => [
                      styles.startButton,
                      (isBusy || (!lobby.combat_started && lobby.status !== 'open')) && styles.disabled,
                      hoveredControl === 'start-combat' && styles.buttonHovered,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <View style={styles.buttonContent}>
                      <LobbyIcon
                        name="swords"
                        size={16}
                        color={lobby.combat_started ? '#66615A' : '#17130B'}
                      />
                      <Text style={styles.startButtonText}>
                        {lobby.combat_started
                          ? `Open Combat Tracker · Round ${lobby.current_round}`
                          : isBusy ? 'Starting Combat…' : 'Start Combat'}
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onBlur={() => setHoveredControl(null)}
                    onFocus={() => setHoveredControl('options')}
                    onHoverIn={() => setHoveredControl('options')}
                    onHoverOut={() => setHoveredControl(null)}
                    onPress={() => setIsLobbyOptionsOpen((open) => !open)}
                    style={({ pressed }) => [
                      styles.optionsButton,
                      hoveredControl === 'options' && styles.buttonHovered,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <View style={styles.buttonContent}>
                      <Text style={styles.optionsButtonText}>
                        {isLobbyOptionsOpen ? 'Close lobby options' : 'Lobby options'}
                      </Text>
                      {!isLobbyOptionsOpen && <LobbyIcon name="more" size={16} />}
                    </View>
                  </Pressable>
                  {isLobbyOptionsOpen && (
                    <View style={styles.optionsPanel}>
                      <Text style={styles.optionsDescription}>
                        Closing admission prevents new players from joining. It does not end or delete this combat.
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        disabled={isBusy || lobby.status !== 'open'}
                        onPress={() => setIsCloseConfirmationVisible(true)}
                        style={({ pressed }) => [
                          styles.closeLobbyButton,
                          (isBusy || lobby.status !== 'open') && styles.disabled,
                          pressed && styles.buttonPressed,
                        ]}
                      >
                        <Text style={styles.closeLobbyButtonText}>
                          {lobby.status === 'open' ? 'Close Lobby Admission' : 'Admission Closed'}
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        disabled={isBusy}
                        onPress={() => setIsDmLeaveConfirmationVisible(true)}
                        style={({ pressed }) => [
                          styles.optionsLeaveButton,
                          isBusy && styles.disabled,
                          pressed && styles.buttonPressed,
                        ]}
                      >
                        <Text style={styles.optionsLeaveButtonText}>Leave Lobby</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.footer}>
                  <Text style={styles.footerStatus}>
                    {lobby.combat_started
                      ? `Combat is active · Round ${lobby.current_round}`
                      : 'You are connected to this combat lobby.'}
                  </Text>
                  {lobby.combat_started && (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setLobbyViewId(null)}
                      style={({ pressed }) => [
                        styles.combatReopenButton,
                        pressed && styles.buttonPressed,
                      ]}
                    >
                      <Text style={styles.combatReopenText}>Open Combat Tracker</Text>
                    </Pressable>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    disabled={isBusy}
                    onPress={() => setIsLeaveConfirmationVisible(true)}
                    style={({ pressed }) => [
                      styles.leaveLobbyButton,
                      isBusy && styles.disabled,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.leaveLobbyButtonText}>
                      {isBusy ? 'Please wait…' : 'Leave Lobby'}
                    </Text>
                  </Pressable>
                </View>
              )}
            </>
          )}
        </View>
        <Modal
          animationType="fade"
          transparent
          visible={isCloseConfirmationVisible}
          onRequestClose={() => setIsCloseConfirmationVisible(false)}
        >
          <View style={styles.confirmBackdrop}>
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle}>Close lobby admission?</Text>
              <Text style={styles.confirmText}>
                Players will no longer be able to join or claim characters. The combat and its saved results will remain.
              </Text>
              <View style={styles.confirmActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setIsCloseConfirmationVisible(false)}
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={isBusy}
                  onPress={() => void handleCloseLobby()}
                  style={({ pressed }) => [
                    styles.closeLobbyButton,
                    isBusy && styles.disabled,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.closeLobbyButtonText}>
                    {isBusy ? 'Closing…' : 'Close Admission'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
        <Modal
          animationType="fade"
          transparent
          visible={isLeaveConfirmationVisible}
          onRequestClose={() => setIsLeaveConfirmationVisible(false)}
        >
          <View style={styles.confirmBackdrop}>
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle}>Leave this lobby?</Text>
              <Text style={styles.confirmText}>
                Your player connection and character claim will be removed. This will not close the DM&apos;s lobby or end combat. You can rejoin with the code.
              </Text>
              <View style={styles.confirmActions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={isBusy}
                  onPress={() => setIsLeaveConfirmationVisible(false)}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    isBusy && styles.disabled,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.secondaryButtonText}>Stay</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={isBusy}
                  onPress={() => void handleLeaveLobby()}
                  style={({ pressed }) => [
                    styles.leaveLobbyButton,
                    isBusy && styles.disabled,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.leaveLobbyButtonText}>
                    {isBusy ? 'Leaving…' : 'Leave Lobby'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
        <Modal
          animationType="fade"
          transparent
          visible={isDmLeaveConfirmationVisible}
          onRequestClose={() => setIsDmLeaveConfirmationVisible(false)}
        >
          <View style={styles.confirmBackdrop}>
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle}>Leave this lobby?</Text>
              <Text style={styles.confirmText}>
                You will return to the previous screen. The online lobby stays open, players remain connected, and combat is not ended. You can reopen this lobby from the encounter.
              </Text>
              <View style={styles.confirmActions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={isBusy}
                  onPress={() => setIsDmLeaveConfirmationVisible(false)}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    isBusy && styles.disabled,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.secondaryButtonText}>Stay</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={isBusy}
                  onPress={handleDmLeaveLobby}
                  style={({ pressed }) => [
                    styles.leaveLobbyButton,
                    isBusy && styles.disabled,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.leaveLobbyButtonText}>Leave Lobby</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
}

function OnlineCombatTracker({
  round,
  currentTurnKey,
  rows,
  errorMessage,
  width,
  dmParticipants,
  isBusy = false,
  onSetHp,
  onRevive,
}: {
  round: number;
  rows: OnlineCombatInitiativeRow[];
  errorMessage: string | null;
  width: number;
  currentTurnKey: string | null;
  dmParticipants?: OnlineDmParticipant[];
  isBusy?: boolean;
  onSetHp?: (participantId: string, currentHp: number) => void;
  onRevive?: (participantId: string, hp: number) => void;
}) {
  const [hpKey, setHpKey] = useState<string | null>(null);
  const [amount, setAmount] = useState('1');
  const hpParticipant = hpKey
    ? dmParticipants?.find((participant) => participant.initiative_key === hpKey)
    : undefined;
  const parsedAmount = /^\d+$/.test(amount) ? Math.min(Number(amount), 9999) : 0;
  const sliderMax = Math.max(
    1,
    ...(hpParticipant?.members.map((member) => member.max_hp) ?? [1]),
  );
  return (
    <View style={styles.combatTrackerContent}>
      <View style={styles.combatRoundPanel}>
        <Text style={styles.combatRoundTitle}>Round {round}</Text>
        <View style={styles.combatPanelDivider} />
        <View style={styles.combatLiveStatus}>
          <View style={styles.combatLiveDot} />
          <Text style={styles.combatLiveStatusText}>Live</Text>
        </View>
      </View>
      <View style={styles.combatInitiativeHeading}>
        <Text style={styles.combatInitiativeTitle}>INITIATIVE ORDER</Text>
        <View style={styles.combatSectionDivider} />
      </View>
      {rows.map((participant) => {
        const isEnemy = participant.type === 'enemy';
        const isCurrentTurn = participant.key === currentTurnKey;
        const portrait = participant.type === 'character'
          ? getCharacterPortrait(participant.portraitPresetId)
          : participant.type === 'ally'
            ? getCharacterPortrait(participant.portraitPresetId) ??
              getCombatantPortrait(participant.imageId)
            : getCombatantPortrait(participant.imageId);
        const dmParticipant = dmParticipants?.find(
          (item) => item.initiative_key === participant.key,
        );
        const dmLiveMembers = dmParticipant?.members.filter(
          (member) => member.status === 'active',
        ) ?? [];
        const dmHpText = dmParticipant && dmLiveMembers.length > 0
          ? `HP ${dmLiveMembers.reduce((sum, member) => sum + member.current_hp, 0)}/${
              dmLiveMembers.reduce((sum, member) => sum + member.max_hp, 0)
            }`
          : null;
        const details = [
          ...(participant.type === 'character'
            ? [
              participant.className,
              participant.race,
              participant.playerName,
            ]
            : [isEnemy ? 'Enemy' : 'Ally']),
          participant.visibleMemberCount > 1
            ? `${participant.visibleMemberCount} members`
            : null,
        ].filter(Boolean).join(' · ');
        const canEditHp = Boolean(onSetHp && participant.type !== 'character' && dmParticipant);
        return (
          <Pressable
            key={participant.key}
            accessibilityRole={canEditHp ? 'button' : undefined}
            accessibilityLabel={canEditHp ? `Edit hit points for ${participant.name}` : undefined}
            disabled={!canEditHp}
            onPress={() => {
              setAmount('1');
              setHpKey(participant.key);
            }}
            style={styles.onlineCombatantFrameWrapper}
          >
          <View
            style={[
              styles.onlineCombatantCard,
              width < 520 && styles.onlineCombatantCardShort,
              isCurrentTurn && styles.onlineCombatantCurrentTurn,
            ]}
          >
          <View
            style={[
              styles.onlineCombatantCardContent,
              width < 520 && styles.onlineCombatantCardCompact,
              participant.isDefeated && styles.onlineCombatantDefeatedContent,
            ]}
          >
            <ParticipantPortrait
              name={participant.name}
              image={portrait}
              large
              compact={width < 520}
            />
            <View style={styles.onlineCombatantInfo}>
              {isCurrentTurn && width >= 520 && (
                <Text style={styles.currentTurnRowLabel}>CURRENT TURN</Text>
              )}
              <Text
                numberOfLines={width < 520 ? 1 : undefined}
                style={[
                  styles.onlineCombatantName,
                  width < 520 && styles.onlineCombatantNameCompact,
                  isEnemy && styles.onlineCombatantEnemyName,
                ]}
              >
                {participant.name}
                {dmHpText && <Text style={styles.onlineCombatantHp}>{`  ${dmHpText}`}</Text>}
              </Text>
              <Text
                numberOfLines={width < 520 ? 1 : undefined}
                style={[
                  styles.onlineCombatantDetails,
                  width < 520 && styles.onlineCombatantDetailsCompact,
                  isEnemy && styles.onlineCombatantEnemyLabel,
                ]}
              >
                {details}
              </Text>
            </View>
            <View
              style={[
                styles.onlineCombatantStats,
                width < 520 && styles.onlineCombatantCardCompactStats,
              ]}
            >
              <View
                style={[
                  styles.onlineCombatantStat,
                  width < 520 && styles.onlineCombatantStatCompact,
                ]}
              >
                {width < 520 && (
                  <SymbolView
                    name={{ ios: 'figure.run', android: 'directions_run', web: 'directions_run' }}
                    size={18}
                    tintColor="#E8B95F"
                  />
                )}
                <Text
                  style={[
                    styles.onlineCombatantStatValue,
                    width < 520 && styles.onlineCombatantStatValueCompact,
                  ]}
                >
                  {participant.total ?? '—'}
                </Text>
                {width >= 520 && (
                  <Text style={styles.onlineCombatantStatLabel}>INIT</Text>
                )}
                {width >= 520 && participant.rawRoll !== null &&
                  participant.bonus !== null && (
                  <Text style={styles.onlineCombatantCalculation}>
                    {participant.rawRoll} {participant.bonus >= 0 ? '+' : '−'}{' '}
                    {Math.abs(participant.bonus)}
                  </Text>
                )}
              </View>
              <View
                style={[
                  styles.onlineCombatantStatDivider,
                  width < 520 && styles.onlineCombatantStatDividerCompact,
                ]}
              />
              <View
                style={[
                  styles.onlineCombatantStat,
                  width < 520 && styles.onlineCombatantStatCompact,
                ]}
              >
                {width < 520 && (
                  <SymbolView
                    name={{ ios: 'shield', android: 'shield', web: 'shield' }}
                    size={18}
                    tintColor="#E8B95F"
                  />
                )}
                <Text
                  style={[
                    styles.onlineCombatantStatValue,
                    width < 520 && styles.onlineCombatantStatValueCompact,
                  ]}
                >
                  {participant.armorClass ?? '—'}
                </Text>
                {width >= 520 && (
                  <Text style={styles.onlineCombatantStatLabel}>AC</Text>
                )}
              </View>
            </View>
          </View>
          {(isCurrentTurn || participant.isDefeated) && (
            <View
              pointerEvents="none"
              style={[
                styles.activeTurnFrameLayer,
                width < 520 && styles.activeTurnFrameLayerCompact,
              ]}
            >
              <Image
                accessible={false}
                resizeMode="stretch"
                source={participant.isDefeated ? DEFEATED_FRAME : ACTIVE_TURN_FRAME}
                style={styles.activeTurnFrame}
              />
            </View>
          )}
          </View>
          </Pressable>
        );
      })}
      {rows.length === 0 && (
        <Text style={styles.combatNoParticipants}>
          No visible combatants are active in this round.
        </Text>
      )}
      {errorMessage && (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {errorMessage}
        </Text>
      )}
      <Modal
        animationType="fade"
        transparent
        visible={Boolean(hpParticipant)}
        onRequestClose={() => setHpKey(null)}
      >
        <View style={styles.hpModalBackdrop}>
          <View style={styles.hpModalPanel}>
            <Text style={styles.hpModalTitle}>{hpParticipant?.name}</Text>
            <View style={styles.hpAmountRow}>
              <Text style={styles.hpAmountLabel}>Amount</Text>
              <TextInput
                accessibilityLabel="Damage or healing amount"
                keyboardType="number-pad"
                maxLength={4}
                onChangeText={setAmount}
                selectTextOnFocus
                style={styles.hpAmountInput}
                value={amount}
              />
            </View>
            <Slider
              accessibilityLabel="Damage or healing amount slider"
              maximumTrackTintColor="#4A4034"
              maximumValue={sliderMax}
              minimumTrackTintColor="#E8B95F"
              minimumValue={0}
              onValueChange={(value) => setAmount(String(Math.round(value)))}
              step={1}
              style={styles.hpSlider}
              thumbTintColor="#E8B95F"
              value={Math.min(parsedAmount, sliderMax)}
            />
            <ScrollView style={styles.hpMemberList}>
              {hpParticipant?.members.filter((member) =>
                member.status === 'active' || member.status === 'defeated',
              ).map((member) => {
                const percent = Math.max(
                  0,
                  Math.min(100, (member.current_hp / member.max_hp) * 100),
                );
                const isDefeated = member.status === 'defeated';
                return (
                  <View key={member.participant_id} style={styles.hpMemberRow}>
                    <View style={styles.hpMemberHeader}>
                      <Text style={[styles.hpMemberName, isDefeated && styles.hpDefeatedText]}>
                        {member.name}
                      </Text>
                      <Text style={[styles.hpMemberValue, isDefeated && styles.hpDefeatedText]}>
                        {isDefeated ? 'DEFEATED' : `${member.current_hp} / ${member.max_hp}`}
                      </Text>
                    </View>
                    <View style={styles.hpBarTrack}>
                      <View
                        style={[
                          styles.hpBarFill,
                          { width: `${percent}%` },
                          percent <= 25 && styles.hpBarFillLow,
                        ]}
                      />
                    </View>
                    <View style={styles.hpButtonRow}>
                      {isDefeated ? (
                        <Pressable
                          accessibilityRole="button"
                          disabled={isBusy}
                          onPress={() => onRevive?.(
                            member.participant_id,
                            Math.min(Math.max(parsedAmount, 1), member.max_hp),
                          )}
                          style={({ pressed }) => [
                            styles.hpHealButton,
                            isBusy && styles.disabled,
                            pressed && styles.buttonPressed,
                          ]}
                        >
                          <Text style={styles.hpButtonText}>
                            Revive with {Math.min(Math.max(parsedAmount, 1), member.max_hp)} HP
                          </Text>
                        </Pressable>
                      ) : (
                      <>
                      <Pressable
                        accessibilityRole="button"
                        disabled={isBusy || parsedAmount === 0 || member.current_hp === 0}
                        onPress={() => onSetHp?.(
                          member.participant_id,
                          member.current_hp - parsedAmount,
                        )}
                        style={({ pressed }) => [
                          styles.hpDamageButton,
                          (isBusy || parsedAmount === 0 || member.current_hp === 0) &&
                            styles.disabled,
                          pressed && styles.buttonPressed,
                        ]}
                      >
                        <Text style={styles.hpButtonText}>− Damage</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        disabled={isBusy || parsedAmount === 0 ||
                          member.current_hp >= member.max_hp}
                        onPress={() => onSetHp?.(
                          member.participant_id,
                          member.current_hp + parsedAmount,
                        )}
                        style={({ pressed }) => [
                          styles.hpHealButton,
                          (isBusy || parsedAmount === 0 ||
                            member.current_hp >= member.max_hp) && styles.disabled,
                          pressed && styles.buttonPressed,
                        ]}
                      >
                        <Text style={styles.hpButtonText}>+ Heal</Text>
                      </Pressable>
                      </>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              onPress={() => setHpKey(null)}
              style={({ pressed }) => [styles.hpCloseButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.hpCloseText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ParticipantPortrait({
  name,
  image,
  large = false,
  compact = false,
}: {
  name: string;
  image: ImageSourcePropType | undefined;
  large?: boolean;
  compact?: boolean;
}) {
  return image ? (
    <Image
      accessibilityLabel={`${name} portrait`}
      source={image}
      resizeMode="cover"
      style={[
        large ? styles.largePortrait : styles.portrait,
        compact && styles.compactPortrait,
      ]}
    />
  ) : (
    <View
      style={[
        large ? styles.largeInitial : styles.portraitInitial,
        compact && styles.compactPortrait,
      ]}
    >
      <Text style={styles.portraitInitialText}>
        {name.trim().charAt(0).toUpperCase() || '?'}
      </Text>
    </View>
  );
}

function PlayerInitiativeCard({
  character,
  result,
  manualRoll,
  setManualRoll,
  isBusy,
  isOpen,
  onRoll,
  onSubmit,
}: {
  character: OnlineLobbyCharacter;
  result: OnlineInitiativeResult | undefined;
  manualRoll: string;
  setManualRoll: (value: string) => void;
  isBusy: boolean;
  isOpen: boolean;
  onRoll: () => void;
  onSubmit: (rawRoll: number) => void;
}) {
  const portrait = getCharacterPortrait(character.portrait_preset_id);
  const parsedRoll = /^\d+$/.test(manualRoll) ? Number(manualRoll) : Number.NaN;
  const canSubmit = !isBusy && isOpen && Number.isInteger(parsedRoll) &&
    parsedRoll >= 1 && parsedRoll <= 20;
  return (
    <View style={styles.myCharacterPanel}>
      <PanelCorners />
      <Text style={styles.eyebrow}>YOUR CHARACTER</Text>
      <View style={styles.myCharacterRow}>
        <ParticipantPortrait name={character.name} image={portrait} large />
        <View style={styles.participantInfo}>
          <Text style={styles.myCharacterName}>{character.name}</Text>
          <Text style={styles.participantSubtext}>
            {character.class_name}
            {character.race ? ` · ${character.race}` : ''}
            {' · Initiative bonus '}
            {character.initiative_bonus >= 0 ? '+' : ''}
            {character.initiative_bonus}
            {' · AC '}
            {character.armor_class}
          </Text>
        </View>
      </View>
      {result ? (
        <View style={styles.playerReadyResult}>
          <Text style={styles.playerResultTotal}>{result.total}</Text>
          <View style={styles.playerReadyDetails}>
            <Text style={styles.resultCalculation}>
              {result.raw_roll} {result.bonus >= 0 ? '+' : '−'} {Math.abs(result.bonus)}
            </Text>
            <View style={styles.readyBadge}>
              <LobbyIcon name="check" size={16} color="#8EE0AC" />
              <Text style={styles.readyBadgeText}>Ready</Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.rollControls}>
          <Pressable
            accessibilityRole="button"
            disabled={isBusy || !isOpen}
            onPress={onRoll}
            style={({ pressed }) => [
              styles.primaryButton,
              (isBusy || !isOpen) && styles.disabled,
              pressed && styles.buttonPressed,
            ]}
          >
            <View style={styles.buttonContent}>
              <LobbyIcon name="dice" size={19} color="#17130B" />
              <Text style={styles.primaryText}>{isBusy ? 'Rolling…' : 'Roll Initiative'}</Text>
            </View>
          </Pressable>
          <View style={styles.manualEntry}>
            <Text style={styles.fieldLabel}>Enter My Roll</Text>
            <Text style={styles.fieldHelp}>Your d20 result — do not add your bonus.</Text>
            <View style={styles.manualRollRow}>
              <TextInput
                accessibilityLabel="Your d20 result — do not add your bonus"
                keyboardType="number-pad"
                maxLength={2}
                onChangeText={setManualRoll}
                placeholder="1–20"
                placeholderTextColor="#887A64"
                style={styles.manualRollInput}
                value={manualRoll}
              />
              <Pressable
                accessibilityRole="button"
                disabled={!canSubmit}
                onPress={() => onSubmit(parsedRoll)}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  !canSubmit && styles.disabled,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Submit Result</Text>
              </Pressable>
            </View>
            {!isOpen && <Text style={styles.fieldHelp}>The DM has closed this lobby.</Text>}
          </View>
        </View>
      )}
    </View>
  );
}

function PartyCharacterCard({
  character,
  result,
  claimant,
  currentUserId,
  isPlayer,
  isDm,
  canClaim,
  canEnterDmRoll,
  isDmRollOpen,
  dmRollValue,
  cardWidth,
  onClaim,
  onToggleDmRoll,
  onDmRollValueChange,
  onSubmitDmRoll,
}: {
  character: OnlineLobbyCharacter;
  result: OnlineInitiativeResult | undefined;
  claimant: OnlineLobbySnapshot['members'][number] | undefined;
  currentUserId: string | undefined;
  isPlayer: boolean;
  isDm: boolean;
  canClaim: boolean;
  canEnterDmRoll: boolean;
  isDmRollOpen: boolean;
  dmRollValue: string;
  cardWidth: '48.8%' | '100%';
  onClaim: (characterId: string | null) => void;
  onToggleDmRoll: () => void;
  onDmRollValueChange: (value: string) => void;
  onSubmitDmRoll: (rawRoll: number) => void;
}) {
  const portrait = getCharacterPortrait(character.portrait_preset_id);
  const isMine = claimant?.user_id === currentUserId && isPlayer;
  const status = result ? 'Ready' : claimant ? 'Claimed · Waiting' : 'Available';
  const parsedDmRoll = /^\d+$/.test(dmRollValue) ? Number(dmRollValue) : Number.NaN;
  const canSubmitDmRoll = canEnterDmRoll && Number.isInteger(parsedDmRoll) &&
    parsedDmRoll >= 1 && parsedDmRoll <= 20;
  return (
    <View style={[styles.partyCard, { width: cardWidth }]}>
      <PanelCorners />
      <ParticipantPortrait name={character.name} image={portrait} />
      <View style={styles.participantInfo}>
        <Text style={styles.participantName}>{character.name}</Text>
        <Text style={styles.participantSubtext}>
          {character.class_name}
          {character.race ? ` · ${character.race}` : ''}
          {' · Bonus '}
          {character.initiative_bonus >= 0 ? '+' : ''}
          {character.initiative_bonus}
          {' · AC '}
          {character.armor_class}
        </Text>
        {claimant && (
          <Text style={styles.claimantText}>
            {claimant.display_name}{claimant.user_id === currentUserId ? ' · You' : ''}
          </Text>
        )}
        {result ? (
          <View style={styles.partyResultRow}>
            <View style={styles.resultBox}>
              <Text style={styles.resultTotal}>{result.total}</Text>
              <Text style={styles.resultCalculation}>
                {result.raw_roll} {result.bonus >= 0 ? '+' : '−'} {Math.abs(result.bonus)}
              </Text>
            </View>
            <View style={styles.readyBadge}>
              <LobbyIcon name="check" size={16} color="#8EE0AC" />
              <Text style={styles.readyBadgeText}>Ready</Text>
            </View>
          </View>
        ) : (
          <View style={[styles.statusBadge, claimant ? styles.waitingBadge : styles.availableBadge]}>
            <Text style={claimant ? styles.waitingBadgeText : styles.availableBadgeText}>{status}</Text>
          </View>
        )}
        {isDm && !result && (
          <View style={styles.dmPartyRollControls}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canEnterDmRoll, expanded: isDmRollOpen }}
              disabled={!canEnterDmRoll}
              onPress={onToggleDmRoll}
              style={({ pressed }) => [
                styles.dmPartyRollToggle,
                !canEnterDmRoll && styles.disabled,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.dmPartyRollToggleText}>
                {isDmRollOpen ? 'Cancel Roll Entry' : 'Enter Roll for Player'}
              </Text>
            </Pressable>
            {isDmRollOpen && (
              <View style={styles.dmPartyRollForm}>
                <Text style={styles.fieldLabel}>Party d20 result — do not add the bonus.</Text>
                <View style={styles.manualRollRow}>
                  <TextInput
                    accessibilityLabel={`Raw d20 result for ${character.name}`}
                    keyboardType="number-pad"
                    maxLength={2}
                    onChangeText={onDmRollValueChange}
                    placeholder="1–20"
                    placeholderTextColor="#887A64"
                    style={styles.manualRollInput}
                    value={dmRollValue}
                  />
                  <Pressable
                    accessibilityRole="button"
                    disabled={!canSubmitDmRoll}
                    onPress={() => onSubmitDmRoll(parsedDmRoll)}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      !canSubmitDmRoll && styles.disabled,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.primaryText}>Save Party Roll</Text>
                  </Pressable>
                </View>
                <Text style={styles.fieldHelp}>
                  The saved character bonus is applied automatically.
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
      {isPlayer && !result && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canClaim && !isMine }}
          disabled={!canClaim && !isMine}
          onPress={() => onClaim(isMine ? null : character.character_id)}
          style={({ pressed }) => [
            styles.claimButton,
            isMine && styles.releaseButton,
            !canClaim && !isMine && styles.disabled,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.claimButtonText}>{isMine ? 'Release' : 'Claim'}</Text>
        </Pressable>
      )}
    </View>
  );
}

function DmParticipantCard({
  participant,
  result,
  isSelected,
  isExpanded,
  isMenuOpen,
  manualValue,
  isBusy,
  canRoll,
  cardWidth,
  isEnded = false,
  onToggleSelected,
  onToggleExpanded,
  onToggleMenu,
  onManualValueChange,
  onRoll,
  onEnterRoll,
  onReset,
}: {
  participant: OnlineDmParticipant;
  result: OnlineInitiativeResult | undefined;
  isSelected: boolean;
  isExpanded: boolean;
  isMenuOpen: boolean;
  manualValue: string;
  isBusy: boolean;
  canRoll: boolean;
  cardWidth: '48.8%' | '100%';
  isEnded?: boolean;
  onToggleSelected: () => void;
  onToggleExpanded: () => void;
  onToggleMenu: () => void;
  onManualValueChange: (value: string) => void;
  onRoll: () => void;
  onEnterRoll: (rawRoll: number) => void;
  onReset: () => void;
}) {
  const isHorde = participant.initiative_mode === 'horde' && participant.member_count > 1;
  const parsedRoll = /^\d+$/.test(manualValue) ? Number(manualValue) : Number.NaN;
  const canEnterRoll = !isBusy && canRoll && Number.isInteger(parsedRoll) &&
    parsedRoll >= 1 && parsedRoll <= 20;
  const allEnded = participant.members.every((member) => isEndedStatus(member.status));
  return (
    <View style={[styles.enemyCard, { width: cardWidth }, isSelected && styles.enemyCardSelected]}>
      <PanelCorners />
      <View style={styles.enemyCardTop}>
        {canRoll && !result && !isEnded ? (
          <Pressable
            accessibilityLabel={`${isSelected ? 'Deselect' : 'Select'} ${participant.name}`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected }}
            onPress={onToggleSelected}
            style={({ pressed }) => [
              styles.checkbox,
              isSelected && styles.checkboxSelected,
              pressed && styles.buttonPressed,
            ]}
          >
            {isSelected && <LobbyIcon name="check" size={19} color="#11100C" />}
          </Pressable>
        ) : (
          <View style={styles.enemySelectionSpacer} />
        )}
        {isHorde ? (
          <View style={styles.hordePortraitStack}>
            <View style={styles.hordePortraitBack}>
              <ParticipantPortrait
                name={participant.name}
                image={getCombatantPortrait(participant.image_id)}
              />
            </View>
            <View style={styles.hordePortraitFront}>
              <ParticipantPortrait
                name={participant.name}
                image={getCombatantPortrait(participant.image_id)}
                large
              />
            </View>
          </View>
        ) : (
          <ParticipantPortrait
            name={participant.name}
            image={getCombatantPortrait(participant.image_id)}
            large
          />
        )}
        <View style={styles.participantInfo}>
          <Text style={styles.participantName}>{participant.name}</Text>
          <Text style={styles.participantSubtext}>
            {isHorde
              ? `${participant.member_count} members · Shared Initiative`
              : participant.participant_type === 'ally' ? 'NPC · Individual' : 'Enemy · Individual'}
          </Text>
          <Text style={styles.participantSubtext}>
            Initiative bonus {participant.initiative_bonus >= 0 ? '+' : ''}
            {participant.initiative_bonus}
          </Text>
          <View style={styles.badgeWrap}>
            {participant.hidden_count > 0 && (
              <View style={styles.hiddenBadge}>
                <View style={styles.buttonContent}>
                  <LobbyIcon name="hidden" size={15} color="#D4C2EF" />
                  <Text style={styles.hiddenBadgeText}>
                    Hidden · {participant.hidden_count}
                  </Text>
                </View>
              </View>
            )}
            {participant.scheduled_count > 0 && (
              <View style={styles.scheduledBadge}>
                <View style={styles.buttonContent}>
                  <LobbyIcon name="clock" size={15} color="#E9C57E" />
                  <Text style={styles.scheduledBadgeText}>
                    Scheduled · {participant.scheduled_count} · Round {participant.arrival_round}
                  </Text>
                </View>
              </View>
            )}
            {allEnded && (
              <View style={styles.inactiveBadge}>
                <Text style={styles.inactiveBadgeText}>Inactive / Defeated</Text>
              </View>
            )}
          </View>
        </View>
        {result ? (
          <View style={styles.resultBox}>
            <Text style={styles.resultTotal}>{result.total}</Text>
            <Text style={styles.resultCalculation}>
              {result.raw_roll} {result.bonus >= 0 ? '+' : '−'} {Math.abs(result.bonus)}
            </Text>
          </View>
        ) : (
          <View style={styles.waitingBadge}>
            <Text style={styles.waitingBadgeText}>Not rolled</Text>
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Actions for ${participant.name}`}
          onPress={onToggleMenu}
          style={({ pressed }) => [styles.moreButton, pressed && styles.buttonPressed]}
        >
          <LobbyIcon name="more" size={22} />
        </Pressable>
      </View>

      <View style={styles.enemyCardActions}>
        {canRoll && !result && !isEnded && (
          <Pressable
            accessibilityRole="button"
            disabled={isBusy}
            onPress={onRoll}
            style={({ pressed }) => [
              styles.rollOneButton,
              isBusy && styles.disabled,
              pressed && styles.buttonPressed,
            ]}
          >
            <View style={styles.buttonContent}>
              <LobbyIcon name="dice" size={18} color="#17130B" />
              <Text style={styles.rollOneText}>
                Roll {isHorde ? 'Horde' : 'Initiative'}
              </Text>
            </View>
          </Pressable>
        )}
        {isHorde && (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: isExpanded }}
            onPress={onToggleExpanded}
            style={({ pressed }) => [styles.expandButton, pressed && styles.buttonPressed]}
          >
            <View style={styles.buttonContent}>
              <Text style={styles.expandButtonText}>
                {isExpanded ? 'Hide members' : `Members (${participant.member_count})`}
              </Text>
              <View style={isExpanded ? styles.expandedIcon : undefined}>
                <LobbyIcon name="expand" size={18} />
              </View>
            </View>
          </Pressable>
        )}
      </View>

      {isExpanded && isHorde && (
        <View style={styles.hordeMembers}>
          {participant.members.map((member) => (
            <View key={member.participant_id} style={styles.hordeMemberRow}>
              <Text style={styles.hordeMemberName}>{member.name}</Text>
              <View style={[
                styles.statusBadge,
                member.status === 'defeated' || member.status === 'inactive'
                  ? styles.inactiveBadge
                  : member.status === 'scheduled' ? styles.scheduledBadge : styles.waitingBadge,
              ]}>
                <Text style={styles.hordeMemberStatus}>
                  {member.is_hidden ? 'Hidden · ' : ''}
                  {member.status === 'active' && !member.is_active
                    ? 'Inactive'
                    : member.status.charAt(0).toUpperCase() + member.status.slice(1)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {isMenuOpen && (
        <View style={styles.actionMenu}>
          {!result && canRoll && !isEnded && (
            <>
              <Text style={styles.fieldLabel}>Enter raw d20 result</Text>
              <Text style={styles.fieldHelp}>The saved initiative bonus is added automatically.</Text>
              <View style={styles.manualRollRow}>
                <TextInput
                  accessibilityLabel={`Raw d20 result for ${participant.name}`}
                  keyboardType="number-pad"
                  maxLength={2}
                  onChangeText={onManualValueChange}
                  placeholder="1–20"
                  placeholderTextColor="#887A64"
                  style={styles.manualRollInput}
                  value={manualValue}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={!canEnterRoll}
                  onPress={() => onEnterRoll(parsedRoll)}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    !canEnterRoll && styles.disabled,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.secondaryButtonText}>Save Roll</Text>
                </Pressable>
              </View>
            </>
          )}
          {result && (
            <Pressable
              accessibilityRole="button"
              disabled={isBusy}
              onPress={onReset}
              style={({ pressed }) => [
                styles.resetButton,
                isBusy && styles.disabled,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.resetButtonText}>Reset Initiative</Text>
            </Pressable>
          )}
          {!canRoll && !result && (
            <Text style={styles.fieldHelp}>This participant is not available for a new initiative roll.</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fontLoadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#020812',
  },
  fontLoadError: {
    color: '#E9A18C',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 16,
    textAlign: 'center',
  },
  panelCorners: {
    ...StyleSheet.absoluteFill,
    zIndex: 2,
  },
  panelCorner: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderColor: 'rgba(218, 176, 99, 0.68)',
  },
  panelCornerTopLeft: {
    top: 3,
    left: 3,
    borderTopWidth: 1,
    borderLeftWidth: 1,
  },
  panelCornerTopRight: {
    top: 3,
    right: 3,
    borderTopWidth: 1,
    borderRightWidth: 1,
  },
  panelCornerBottomLeft: {
    bottom: 3,
    left: 3,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
  },
  panelCornerBottomRight: {
    right: 3,
    bottom: 3,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  keyboardAvoiding: {
    flex: 1,
    backgroundColor: '#020812',
  },
  screen: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#020812',
  },
  sceneBackground: {
    ...StyleSheet.absoluteFill,
  },
  sceneBackgroundImage: {
    opacity: 0.68,
  },
  bottomSceneArtwork: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    height: 220,
  },
  bottomSceneImage: {
    opacity: 0.34,
  },
  bottomSceneShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(2, 12, 22, 0.48)',
  },
  sceneShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(2, 12, 22, 0.72)',
  },
  leftDragonCorner: {
    position: 'absolute',
    top: -12,
    left: -18,
    width: 236,
    height: 236,
    opacity: 0.2,
  },
  rightDragonCorner: {
    position: 'absolute',
    top: -12,
    right: -18,
    width: 236,
    height: 236,
    opacity: 0.2,
  },
  compactDragonCorner: {
    top: -8,
    width: 148,
    height: 148,
    opacity: 0.16,
  },
  acanthusCorner: {
    position: 'absolute',
    bottom: -8,
    left: -12,
    width: 228,
    height: 200,
    opacity: 0.18,
  },
  compactAcanthusCorner: {
    width: 148,
    height: 130,
    opacity: 0.14,
  },
  contentFrame: {
    flex: 1,
    width: '100%',
    maxWidth: 960,
    paddingHorizontal: 18,
  },
  header: {
    position: 'relative',
    minHeight: 94,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(196, 151, 76, 0.56)',
  },
  compactHeader: {
    minHeight: 90,
    gap: 6,
    paddingVertical: 10,
  },
  backButton: {
    zIndex: 1,
    minWidth: 56,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 7,
  },
  backButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  backText: {
    color: '#F0C66F',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 16,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  compactHeaderTitle: {
    paddingHorizontal: 2,
  },
  title: {
    color: '#F5D18A',
    fontFamily: 'Cinzel_700Bold',
    fontSize: 27,
    lineHeight: 35,
    letterSpacing: 0.7,
    textAlign: 'center',
  },
  compactTitle: {
    fontSize: 23,
    lineHeight: 30,
  },
  encounterName: {
    marginTop: 1,
    color: '#D1C5B4',
    fontFamily: 'Cinzel_400Regular',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  roleBadge: {
    zIndex: 1,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#82909A',
    borderRadius: 5,
    backgroundColor: 'rgba(7, 17, 27, 0.96)',
  },
  dmBadge: {
    borderColor: '#D4A94F',
  },
  roleBadgeText: {
    color: '#F6D895',
    fontFamily: 'SourceSans3_600SemiBold',
    fontSize: 13,
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  joinContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: 14,
    paddingBottom: 30,
  },
  mainScroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 12,
    paddingBottom: 30,
    gap: 15,
  },
  panel: {
    position: 'relative',
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(191, 148, 76, 0.86)',
    borderRadius: 6,
    backgroundColor: 'rgba(4, 14, 23, 0.97)',
    shadowColor: '#02070D',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 3,
  },
  panelTitle: {
    marginBottom: 8,
    color: '#F0C66F',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 21,
    lineHeight: 29,
  },
  description: {
    marginBottom: 20,
    color: '#BDAE98',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 16,
    lineHeight: 23,
  },
  fieldLabel: {
    color: '#E8B95F',
    fontFamily: 'SourceSans3_600SemiBold',
    fontSize: 15,
  },
  fieldHelp: {
    marginTop: 4,
    color: '#BDAE98',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    minHeight: 48,
    marginTop: 6,
    marginBottom: 16,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#8F7040',
    borderRadius: 6,
    backgroundColor: '#071522',
    color: '#F4DDAE',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 17,
  },
  hint: {
    color: '#BDAE98',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 15,
    lineHeight: 21,
  },
  error: {
    marginTop: 10,
    color: '#E9A18C',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 14,
    lineHeight: 19,
  },
  successText: {
    marginTop: 6,
    color: '#8DD7A8',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 12,
    textAlign: 'right',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  primaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E0B75E',
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderRadius: 6,
    backgroundColor: '#A77C37',
    shadowColor: '#D8A845',
    shadowOpacity: 0.22,
    shadowRadius: 7,
    elevation: 2,
  },
  primaryText: {
    color: '#17130B',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 16,
    letterSpacing: 0.2,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  inviteCard: {
    position: 'relative',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: 'rgba(196, 151, 76, 0.9)',
    borderRadius: 5,
    backgroundColor: 'rgba(3, 13, 22, 0.96)',
    shadowColor: '#02070D',
    shadowOpacity: 0.42,
    shadowRadius: 8,
  },
  inviteInfo: {
    flex: 1,
    width: '100%',
    minWidth: 0,
  },
  eyebrow: {
    color: '#D9C8A8',
    fontFamily: 'SourceSans3_600SemiBold',
    fontSize: 12,
    letterSpacing: 1.4,
  },
  joinCode: {
    alignSelf: 'flex-start',
    marginVertical: 5,
    color: '#FFF1D4',
    fontFamily: 'SourceSans3_700Bold',
    fontSize: 30,
    letterSpacing: 2.8,
  },
  compactJoinCode: {
    fontSize: 24,
    letterSpacing: 2,
  },
  openStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#43D38A',
  },
  closedStatusDot: {
    backgroundColor: '#A96B58',
  },
  openStatus: {
    color: '#8DD7A8',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 15,
  },
  closedStatus: {
    color: '#D39A88',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 15,
  },
  inviteActions: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  inviteReadiness: {
    width: '100%',
    gap: 7,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(198, 154, 80, 0.38)',
  },
  inviteReadinessLabel: {
    color: '#E4D9C8',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 15,
  },
  progressTrack: {
    height: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(144, 160, 171, 0.5)',
    borderRadius: 6,
    backgroundColor: 'rgba(61, 77, 90, 0.72)',
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: '#E7B855',
    shadowColor: '#F0C66F',
    shadowOpacity: 0.6,
    shadowRadius: 5,
  },
  secondaryButton: {
    minHeight: 44,
    minWidth: 124,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(196, 151, 76, 0.86)',
    borderRadius: 5,
    backgroundColor: 'rgba(5, 14, 22, 0.98)',
  },
  rollSelectedButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#E0B253',
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderTopColor: '#F6D17D',
    borderBottomColor: '#8F672E',
    borderLeftColor: '#D5A44A',
    borderRightColor: '#D5A44A',
    borderRadius: 5,
    backgroundColor: '#D7A94D',
    shadowColor: '#E6B956',
    shadowOpacity: 0.22,
    shadowRadius: 6,
  },
  rollSelectedText: {
    color: '#17120A',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 14,
  },
  secondaryButtonText: {
    color: '#F4DDAE',
    fontFamily: 'Cinzel_400Regular',
    fontSize: 14,
  },
  joinedCount: {
    color: '#C6B79F',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 15,
  },
  section: {
    width: '100%',
    gap: 7,
  },
  sectionHeading: {
    minHeight: 42,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 3,
  },
  sectionHeadingTitle: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  sectionDivider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    minWidth: 20,
    backgroundColor: 'rgba(196, 151, 76, 0.48)',
  },
  sectionTitle: {
    color: '#F0BC55',
    fontFamily: 'Cinzel_700Bold',
    fontSize: 23,
    lineHeight: 31,
    letterSpacing: 0.8,
  },
  sectionMeta: {
    color: '#C6B79F',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 15,
  },
  advanceRoundButton: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(196, 151, 76, 0.7)',
    borderRadius: 5,
    backgroundColor: 'rgba(12, 24, 34, 0.92)',
  },
  advanceRoundButtonText: {
    color: '#F0D69F',
    fontFamily: 'SourceSans3_600SemiBold',
    fontSize: 14,
  },
  reinforcementStatus: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 9,
    marginTop: 6,
    marginBottom: 8,
    paddingHorizontal: 10,
  },
  reinforcementStatusText: {
    flex: 1,
    color: '#C9B88F',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 14,
  },
  activateReinforcementButton: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(115, 169, 119, 0.82)',
    borderRadius: 5,
    backgroundColor: 'rgba(23, 59, 40, 0.88)',
  },
  activateReinforcementText: {
    color: '#D5E9D5',
    fontFamily: 'SourceSans3_600SemiBold',
    fontSize: 14,
  },
  partyGrid: {
    flexDirection: 'column',
    gap: 9,
  },
  partyCard: {
    position: 'relative',
    minHeight: 116,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    padding: 9,
    borderWidth: 1,
    borderColor: 'rgba(185, 140, 68, 0.72)',
    borderRadius: 4,
    backgroundColor: 'rgba(3, 13, 22, 0.96)',
    shadowColor: '#02070D',
    shadowOpacity: 0.42,
    shadowRadius: 6,
  },
  participantInfo: {
    flex: 1,
    minWidth: 140,
  },
  participantName: {
    color: '#FFF2DC',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 19,
    lineHeight: 26,
    flexShrink: 1,
  },
  participantSubtext: {
    marginTop: 3,
    color: '#C8C6C4',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 15,
    lineHeight: 21,
    flexShrink: 1,
  },
  claimantText: {
    marginTop: 3,
    color: '#DFC78E',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 14,
  },
  dmPartyRollControls: {
    width: '100%',
    marginTop: 8,
    gap: 7,
  },
  dmPartyRollToggle: {
    minHeight: 38,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: 'rgba(196, 151, 76, 0.72)',
    borderRadius: 5,
    backgroundColor: 'rgba(5, 14, 22, 0.96)',
  },
  dmPartyRollToggleText: {
    color: '#F0CE87',
    fontFamily: 'SourceSans3_600SemiBold',
    fontSize: 14,
  },
  dmPartyRollForm: {
    width: '100%',
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(196, 151, 76, 0.42)',
    borderRadius: 5,
    backgroundColor: 'rgba(2, 9, 16, 0.82)',
  },
  portrait: {
    width: 82,
    height: 94,
    flexShrink: 0,
    borderWidth: 1,
    borderColor: '#B58B49',
    borderRadius: 4,
    backgroundColor: '#10202B',
  },
  portraitInitial: {
    width: 82,
    height: 94,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#B58B49',
    borderRadius: 4,
    backgroundColor: '#10202B',
  },
  largePortrait: {
    width: 92,
    height: 104,
    flexShrink: 0,
    borderWidth: 1,
    borderColor: '#C69A50',
    borderRadius: 4,
    backgroundColor: '#10202B',
  },
  largeInitial: {
    width: 92,
    height: 104,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D2A34E',
    borderRadius: 4,
    backgroundColor: '#10202B',
  },
  portraitInitialText: {
    color: '#F4DDAE',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 27,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    marginTop: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 6,
  },
  availableBadge: {
    borderColor: '#6C8390',
    backgroundColor: 'rgba(36, 56, 68, 0.54)',
  },
  availableBadgeText: {
    color: '#D1DEE2',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 14,
  },
  waitingBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(119, 140, 153, 0.72)',
    borderRadius: 5,
    backgroundColor: 'rgba(31, 47, 58, 0.92)',
  },
  waitingBadgeText: {
    color: '#D6DDE0',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 14,
  },
  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(78, 166, 113, 0.8)',
    borderRadius: 5,
    backgroundColor: 'rgba(16, 63, 43, 0.52)',
  },
  readyBadgeText: {
    color: '#A6E8BB',
    fontFamily: 'SourceSans3_600SemiBold',
    fontSize: 15,
  },
  partyResultRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  resultBox: {
    minWidth: 78,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(177, 129, 62, 0.8)',
    borderRadius: 5,
    backgroundColor: 'rgba(2, 9, 15, 0.94)',
  },
  resultTotal: {
    color: '#FFF2D9',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 26,
    lineHeight: 31,
  },
  resultCalculation: {
    color: '#C6B79F',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 14,
  },
  claimButton: {
    minWidth: 70,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#C69A50',
    borderRadius: 6,
    backgroundColor: 'rgba(167, 122, 49, 0.14)',
  },
  releaseButton: {
    borderColor: '#8C795B',
    backgroundColor: 'rgba(5, 14, 22, 0.82)',
  },
  claimButtonText: {
    color: '#F4DDAE',
    fontFamily: 'SourceSans3_600SemiBold',
    fontSize: 15,
  },
  myCharacterPanel: {
    position: 'relative',
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(190, 145, 71, 0.76)',
    borderRadius: 5,
    backgroundColor: 'rgba(4, 14, 23, 0.97)',
  },
  myCharacterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    marginBottom: 12,
  },
  myCharacterName: {
    color: '#FFF2D9',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 20,
    lineHeight: 28,
    flexShrink: 1,
  },
  rollControls: {
    gap: 12,
  },
  manualEntry: {
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(198, 154, 80, 0.48)',
    borderRadius: 7,
    backgroundColor: 'rgba(3, 11, 18, 0.78)',
  },
  manualRollRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 9,
    marginTop: 8,
  },
  manualRollInput: {
    width: 82,
    minHeight: 46,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#79613B',
    borderRadius: 6,
    backgroundColor: '#0B1924',
    color: '#F4DDAE',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 17,
    textAlign: 'center',
  },
  playerReadyResult: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(78, 166, 113, 0.8)',
    borderRadius: 5,
    backgroundColor: 'rgba(16, 63, 43, 0.42)',
  },
  playerReadyDetails: {
    alignItems: 'flex-start',
    gap: 5,
  },
  playerResultTotal: {
    color: '#F5FFEF',
    fontFamily: 'Cinzel_700Bold',
    fontSize: 37,
  },
  headingWithBadge: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  dmOnlyBadge: {
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#B96B54',
    borderRadius: 5,
    color: '#E7A38C',
    fontFamily: 'SourceSans3_600SemiBold',
    fontSize: 13,
  },
  rollUnrolledButton: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#D0A34C',
    borderRadius: 7,
    backgroundColor: 'rgba(5, 14, 22, 0.96)',
  },
  rollUnrolledText: {
    color: '#F0CE87',
    fontFamily: 'Cinzel_400Regular',
    fontSize: 14,
  },
  onlineCombatantHp: {
    color: '#F2D182',
    fontFamily: 'SourceSans3_600SemiBold',
    fontSize: 13,
  },
  onlineCombatantDefeatedContent: {
    opacity: 0.45,
  },
  hpSlider: {
    width: '100%',
    height: 36,
  },
  hpModalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  hpModalPanel: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '80%',
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#C69A50',
    borderRadius: 8,
    backgroundColor: '#0A141D',
  },
  hpModalTitle: {
    color: '#F3E9DA',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 22,
    textAlign: 'center',
  },
  hpAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  hpAmountLabel: {
    color: '#D7B66C',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 14,
  },
  hpAmountInput: {
    minWidth: 90,
    minHeight: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#C69A50',
    borderRadius: 6,
    backgroundColor: 'rgba(3, 13, 22, 0.95)',
    color: '#F2D182',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 20,
    textAlign: 'center',
  },
  hpMemberList: {
    flexGrow: 0,
  },
  hpMemberRow: {
    gap: 6,
    marginBottom: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(198, 154, 80, 0.4)',
    borderRadius: 6,
    backgroundColor: 'rgba(3, 13, 22, 0.9)',
  },
  hpMemberHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  hpMemberName: {
    flex: 1,
    color: '#F3E9DA',
    fontFamily: 'SourceSans3_600SemiBold',
    fontSize: 16,
  },
  hpMemberValue: {
    color: '#F2D182',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 15,
  },
  hpDefeatedText: {
    color: '#E78878',
  },
  hpBarTrack: {
    height: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(198, 154, 80, 0.5)',
    borderRadius: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  hpBarFill: {
    height: '100%',
    backgroundColor: '#4FA860',
  },
  hpBarFillLow: {
    backgroundColor: '#C9473A',
  },
  hpButtonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  hpDamageButton: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: '#8E3228',
  },
  hpHealButton: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: '#2F7A45',
  },
  hpButtonText: {
    color: '#FFF4DE',
    fontFamily: 'SourceSans3_700Bold',
    fontSize: 15,
  },
  hpCloseButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: '#C69A50',
  },
  hpCloseText: {
    color: '#17120A',
    fontFamily: 'SourceSans3_700Bold',
    fontSize: 16,
  },
  dmListTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  dmListTab: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: 'rgba(198, 154, 80, 0.45)',
    borderRadius: 5,
    backgroundColor: 'rgba(3, 13, 22, 0.8)',
  },
  dmListTabActive: {
    borderColor: '#E8B95F',
    backgroundColor: 'rgba(167, 122, 49, 0.28)',
  },
  dmListTabText: {
    color: '#C8BDAD',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 13,
  },
  dmListTabTextActive: {
    color: '#F2D182',
  },
  dmActionBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 4,
    padding: 9,
    borderWidth: 1,
    borderColor: 'rgba(198, 154, 80, 0.56)',
    borderRadius: 8,
    backgroundColor: 'rgba(4, 14, 23, 0.97)',
  },
  dmToolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  enemyGrid: {
    flexDirection: 'column',
    gap: 9,
  },
  enemyCard: {
    position: 'relative',
    padding: 9,
    borderWidth: 1,
    borderColor: 'rgba(185, 140, 68, 0.72)',
    borderRadius: 4,
    backgroundColor: 'rgba(3, 13, 22, 0.96)',
    shadowColor: '#02070D',
    shadowOpacity: 0.42,
    shadowRadius: 6,
  },
  enemyCardSelected: {
    borderColor: '#E7B85D',
    shadowColor: '#E8B95F',
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },
  enemyCardTop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  hordePortraitStack: {
    position: 'relative',
    width: 104,
    height: 108,
    flexShrink: 0,
    justifyContent: 'center',
  },
  hordePortraitBack: {
    position: 'absolute',
    top: 0,
    left: 6,
    opacity: 0.58,
  },
  hordePortraitFront: {
    zIndex: 1,
  },
  checkbox: {
    width: 32,
    height: 32,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C69A50',
    borderRadius: 4,
    backgroundColor: '#08131E',
  },
  checkboxSelected: {
    backgroundColor: '#D9AA4B',
    borderColor: '#F2D07C',
    shadowColor: '#E6B956',
    shadowOpacity: 0.24,
    shadowRadius: 4,
  },
  enemySelectionSpacer: {
    width: 32,
  },
  badgeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 5,
  },
  hiddenBadge: {
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#8771A7',
    borderRadius: 4,
    backgroundColor: 'rgba(40, 34, 60, 0.74)',
  },
  hiddenBadgeText: {
    color: '#D4C2EF',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 13,
  },
  scheduledBadge: {
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#987443',
    borderRadius: 4,
    backgroundColor: 'rgba(67, 51, 28, 0.68)',
  },
  scheduledBadgeText: {
    color: '#E9C57E',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 13,
  },
  inactiveBadge: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#65717A',
    borderRadius: 5,
    backgroundColor: 'rgba(35, 45, 52, 0.78)',
  },
  inactiveBadgeText: {
    color: '#B8C0C4',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 11,
  },
  enemyCardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 9,
    marginTop: 8,
    paddingLeft: 42,
  },
  rollOneButton: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#D0A24A',
    borderTopWidth: 2,
    borderTopColor: '#F1CC76',
    borderRadius: 5,
    backgroundColor: '#A77C37',
  },
  rollOneText: {
    color: '#17130B',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 14,
  },
  expandButton: {
    minHeight: 42,
    minWidth: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(198, 154, 80, 0.45)',
    borderRadius: 5,
    backgroundColor: 'rgba(5, 14, 22, 0.85)',
  },
  expandButtonText: {
    color: '#E7C47D',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 15,
  },
  expandedIcon: {
    transform: [{ rotate: '180deg' }],
  },
  moreButton: {
    width: 44,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hordeMembers: {
    marginTop: 10,
    marginLeft: 42,
    paddingLeft: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(198, 154, 80, 0.4)',
  },
  hordeMemberRow: {
    minHeight: 38,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(198, 154, 80, 0.24)',
  },
  hordeMemberName: {
    flex: 1,
    minWidth: 120,
    color: '#E5D8C2',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 15,
  },
  hordeMemberStatus: {
    color: '#D1C3AA',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 13,
  },
  actionMenu: {
    marginTop: 10,
    marginLeft: 42,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(198, 154, 80, 0.46)',
    borderRadius: 5,
    backgroundColor: 'rgba(3, 10, 17, 0.98)',
  },
  resetButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#987443',
    borderRadius: 6,
  },
  resetButtonText: {
    color: '#E8C782',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 14,
  },
  inactiveSection: {
    marginTop: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(101, 113, 122, 0.62)',
    borderRadius: 8,
    backgroundColor: 'rgba(7, 15, 22, 0.96)',
    gap: 9,
  },
  inactiveTitle: {
    color: '#B8C0C4',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 16,
  },
  readinessRow: {
    minHeight: 48,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(198, 154, 80, 0.35)',
    borderRadius: 7,
    backgroundColor: 'rgba(5, 15, 24, 0.85)',
  },
  readinessName: {
    flex: 1,
    minWidth: 100,
    color: '#E9DFCF',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 15,
  },
  combatRow: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(198, 154, 80, 0.56)',
    borderRadius: 8,
    backgroundColor: 'rgba(5, 15, 24, 0.9)',
  },
  combatRowCurrentTurn: {
    backgroundColor: 'rgba(53, 39, 17, 0.96)',
    position: 'relative',
  },
  activeTurnFrame: {
    width: '100%',
    height: '100%',
  },
  activeTurnFrameLayer: {
    position: 'absolute',
    top: '-25%',
    right: -10,
    bottom: '-25%',
    left: -22,
    zIndex: 4,
    elevation: 4,
  },
  currentTurnRowLabel: {
    color: '#F5CF75',
    fontFamily: 'SourceSans3_700Bold',
    fontSize: 11,
    letterSpacing: 1.4,
    textShadowColor: 'rgba(255, 195, 72, 0.7)',
    textShadowRadius: 6,
  },
  combatTrackerContent: {
    gap: Platform.OS === 'ios' ? 10 : 13,
  },
  combatRoundPanel: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(196, 151, 76, 0.8)',
    borderRadius: 4,
    backgroundColor: 'rgba(3, 13, 22, 0.94)',
  },
  combatRoundTitle: {
    color: '#F1E8DD',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 21,
    letterSpacing: 1.1,
  },
  combatPanelDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(196, 151, 76, 0.72)',
  },
  combatLiveStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  combatLiveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#42D587',
  },
  combatLiveStatusText: {
    color: '#7EE3A6',
    fontFamily: 'SourceSans3_600SemiBold',
    fontSize: 17,
  },
  combatInitiativeHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 3,
  },
  combatInitiativeTitle: {
    color: '#F0BC55',
    fontFamily: 'Cinzel_700Bold',
    fontSize: 18,
    letterSpacing: 1.6,
  },
  combatSectionDivider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    minWidth: 20,
    backgroundColor: 'rgba(196, 151, 76, 0.72)',
  },
  onlineCombatantCard: {
    width: '100%',
    minHeight: Platform.OS === 'ios' ? 64 : 116,
    borderWidth: 1,
    borderColor: 'rgba(198, 154, 80, 0.5)',
    borderRadius: 5,
    backgroundColor: 'rgba(3, 13, 22, 0.95)',
  },
  onlineCombatantCardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Platform.OS === 'ios' ? 8 : 14,
    padding: Platform.OS === 'ios' ? 6 : 10,
    position: 'relative',
    zIndex: 3,
    elevation: 3,
  },
  onlineCombatantCardCompact: {
    flexWrap: 'nowrap',
    gap: 8,
    padding: 5,
  },
  onlineCombatantCardShort: {
    minHeight: 66,
  },
  compactPortrait: {
    width: 52,
    height: 52,
  },
  activeTurnFrameLayerCompact: {
    top: Platform.OS === 'ios' ? -17 : -12,
    bottom: Platform.OS === 'ios' ? -17 : -12,
    ...(Platform.OS === 'ios' && { left: -10, right: -4 }),
  },
  onlineCombatantNameCompact: {
    fontSize: 17,
    lineHeight: 21,
  },
  onlineCombatantDetailsCompact: {
    fontSize: 13,
    lineHeight: 16,
  },
  onlineCombatantStatCompact: {
    minWidth: 40,
    flexDirection: 'row',
    gap: 6,
  },
  onlineCombatantStatValueCompact: {
    fontSize: 17,
    lineHeight: 21,
  },
  onlineCombatantStatDividerCompact: {
    height: 30,
  },
  onlineCombatantFrameWrapper: {
    alignSelf: 'stretch',
    marginHorizontal: 24,
    position: 'relative',
    overflow: 'visible',
  },
  onlineCombatantCurrentTurn: {
    backgroundColor: 'rgba(42, 32, 15, 0.98)',
    position: 'relative',
  },
  onlineCombatantInfo: {
    flex: 1,
    minWidth: Platform.OS === 'ios' ? 90 : 120,
    gap: Platform.OS === 'ios' ? 0 : 3,
  },
  onlineCombatantName: {
    color: '#F3E9DA',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: Platform.OS === 'ios' ? 15 : 20,
    lineHeight: Platform.OS === 'ios' ? 19 : 27,
  },
  onlineCombatantEnemyName: {
    color: '#E99082',
  },
  onlineCombatantDetails: {
    color: '#C8BDAD',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: Platform.OS === 'ios' ? 12 : 15,
    lineHeight: Platform.OS === 'ios' ? 16 : 21,
  },
  onlineCombatantEnemyLabel: {
    color: '#E78878',
    fontFamily: 'SourceSans3_600SemiBold',
    letterSpacing: 0.5,
  },
  onlineCombatantStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Platform.OS === 'ios' ? 8 : 12,
    minWidth: Platform.OS === 'ios' ? 120 : 170,
    paddingLeft: 8,
  },
  onlineCombatantCardCompactStats: {
    width: 'auto',
    justifyContent: 'flex-end',
    minWidth: 0,
    gap: 6,
    paddingLeft: 0,
  },
  onlineCombatantStat: {
    minWidth: Platform.OS === 'ios' ? 40 : 55,
    alignItems: 'center',
  },
  onlineCombatantStatValue: {
    color: '#F2D182',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: Platform.OS === 'ios' ? 18 : 25,
    lineHeight: Platform.OS === 'ios' ? 22 : 30,
    textAlign: 'center',
  },
  onlineCombatantStatLabel: {
    color: '#D7B66C',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: Platform.OS === 'ios' ? 9 : 12,
    letterSpacing: 1,
  },
  onlineCombatantCalculation: {
    marginTop: 1,
    color: '#C8BDAD',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: Platform.OS === 'ios' ? 10 : 12,
  },
  onlineCombatantStatDivider: {
    width: 1,
    height: Platform.OS === 'ios' ? 32 : 50,
    backgroundColor: 'rgba(196, 151, 76, 0.58)',
  },
  combatNoParticipants: {
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(198, 154, 80, 0.4)',
    borderRadius: 5,
    backgroundColor: 'rgba(3, 13, 22, 0.94)',
    color: '#D4C9B9',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 16,
    textAlign: 'center',
  },
  combatTrackerFooter: {
    gap: 8,
    paddingTop: 8,
    paddingHorizontal: 8,
    paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(218, 177, 99, 0.72)',
    backgroundColor: 'rgba(2, 8, 18, 0.72)',
  },
  combatNextRoundButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderTopWidth: 2,
    borderColor: '#E4B95B',
    borderTopColor: '#F5D281',
    borderBottomColor: '#886128',
    borderRadius: 5,
    backgroundColor: '#A77C37',
  },
  combatNextRoundText: {
    color: '#17130B',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 15,
    textAlign: 'center',
  },
  combatReturnButton: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 5,
  },
  combatFinishButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(231, 136, 120, 0.7)',
    borderRadius: 5,
    backgroundColor: 'rgba(120, 28, 28, 0.35)',
  },
  combatFinishText: {
    color: '#F0A596',
    fontFamily: 'SourceSans3_700Bold',
    fontSize: 16,
  },
  combatReturnText: {
    color: '#D8C7AA',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 15,
    textDecorationLine: 'underline',
  },
  combatReopenButton: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(196, 151, 76, 0.72)',
    borderRadius: 5,
    backgroundColor: 'rgba(9, 21, 31, 0.88)',
  },
  combatReopenText: {
    color: '#E8C782',
    fontFamily: 'SourceSans3_600SemiBold',
    fontSize: 15,
  },
  footer: {
    paddingTop: 6,
    paddingHorizontal: 8,
    paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(218, 177, 99, 0.72)',
    backgroundColor: 'transparent',
  },
  footerStatus: {
    color: '#F0E4D2',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  footerHint: {
    marginTop: 1,
    marginBottom: 5,
    color: '#D0C4B3',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
  },
  startButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E4B95B',
    borderTopWidth: 2,
    borderTopColor: '#F5D281',
    borderBottomWidth: 2,
    borderBottomColor: '#886128',
    borderRadius: 5,
    backgroundColor: '#A77C37',
    shadowColor: '#E5B755',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
  },
  startButtonText: {
    color: '#17130B',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 14,
    letterSpacing: 0.2,
  },
  optionsButton: {
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    borderRadius: 5,
  },
  optionsButtonText: {
    color: '#E2D0B3',
    fontFamily: 'Cinzel_400Regular',
    fontSize: 12,
  },
  optionsPanel: {
    gap: 10,
    marginTop: 4,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(198, 154, 80, 0.45)',
    borderRadius: 5,
    backgroundColor: '#08131E',
  },
  optionsDescription: {
    color: '#BDAE98',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 13,
    lineHeight: 18,
  },
  optionsLeaveButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(196, 151, 76, 0.72)',
    borderRadius: 5,
    backgroundColor: 'rgba(5, 14, 22, 0.98)',
  },
  optionsLeaveButtonText: {
    color: '#F0CE87',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 14,
  },
  closeLobbyButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#A45E4F',
    borderRadius: 6,
    backgroundColor: 'rgba(91, 37, 30, 0.35)',
  },
  closeLobbyButtonText: {
    color: '#F1B6A4',
    fontFamily: 'SourceSans3_600SemiBold',
    fontSize: 14,
  },
  leaveLobbyButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#A45E4F',
    borderRadius: 6,
    backgroundColor: 'rgba(91, 37, 30, 0.35)',
  },
  leaveLobbyButtonText: {
    color: '#F1B6A4',
    fontFamily: 'SourceSans3_600SemiBold',
    fontSize: 14,
  },
  confirmBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
  },
  confirmCard: {
    width: '100%',
    maxWidth: 440,
    padding: 20,
    borderWidth: 1,
    borderColor: '#C69A50',
    borderRadius: 5,
    backgroundColor: '#07111B',
  },
  confirmTitle: {
    color: '#F4DDAE',
    fontFamily: 'Cinzel_600SemiBold',
    fontSize: 20,
    lineHeight: 28,
  },
  confirmText: {
    marginTop: 9,
    color: '#C6B79F',
    fontFamily: 'SourceSans3_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  confirmActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 9,
    marginTop: 18,
  },
  disabled: {
    opacity: 0.42,
  },
  buttonPressed: {
    opacity: 0.88,
    borderColor: '#F2CE83',
    transform: [{ scale: 0.985 }],
  },
  buttonHovered: {
    borderColor: '#F2CE83',
    shadowColor: '#E8B95F',
    shadowOpacity: 0.3,
    shadowRadius: 7,
    elevation: 3,
  },
});
