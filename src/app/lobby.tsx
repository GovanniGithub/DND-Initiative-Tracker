import {
  claimOnlineLobbyCharacter,
  joinOnlineCombatLobby,
  loadOnlineLobbySnapshot,
  subscribeToOnlineCombatLobby,
  type OnlineLobbySnapshot,
} from '@/storage/online-lobbies';
import { ensureSupabaseIdentity, isSupabaseConfigured, type SupabaseIdentity } from '@/lib/supabase';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

function getCharacterPortrait(presetId: string | null): number | undefined {
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

export default function OnlineLobbyScreen() {
  const [identity, setIdentity] = useState<SupabaseIdentity | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [lobby, setLobby] = useState<OnlineLobbySnapshot | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    if (!isSupabaseConfigured()) return;
    void ensureSupabaseIdentity()
      .then((resolvedIdentity) => {
        if (isActive) setIdentity(resolvedIdentity);
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
  }, []);

  useEffect(() => {
    if (!identity || !lobby) return;
    let isActive = true;
    const unsubscribe = subscribeToOnlineCombatLobby(
      identity,
      lobby.lobby_id,
      () => {
        void loadOnlineLobbySnapshot(identity, lobby.lobby_id)
          .then((snapshot) => {
            if (isActive) setLobby(snapshot);
          })
          .catch((error: unknown) => {
            if (isActive) {
              setErrorMessage(
                error instanceof Error ? error.message : 'Online lobby could not be refreshed.',
              );
            }
          });
      },
      (message) => {
        if (isActive) setErrorMessage(message);
      },
    );
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
      setLobby(await joinOnlineCombatLobby(deviceIdentity, joinCode, displayName));
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

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Online Combat Lobby</Text>
      </View>
      {!lobby ? (
        <ScrollView
          contentContainerStyle={styles.joinContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.description}>
            Enter the 12-character code from your DM. This device signs in anonymously so the lobby can remember your player and character claim.
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
          {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}
          <Pressable
            accessibilityRole="button"
            disabled={!isSupabaseConfigured() || isBusy}
            onPress={() => void handleJoinLobby()}
            style={[styles.primaryButton, (!isSupabaseConfigured() || isBusy) && styles.disabled]}
          >
            <Text style={styles.primaryText}>{isBusy ? 'Joining…' : 'Join Lobby'}</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <View style={styles.lobbyContent}>
          <Text style={styles.encounterName}>{lobby.encounter_name}</Text>
          <Text style={styles.description}>
            {lobby.role === 'dm'
              ? 'You are the DM. Share the join code with players.'
              : 'Select an available character to claim it for this device.'}
          </Text>
          {lobby.join_code && (
            <View style={styles.codePanel}>
              <Text style={styles.fieldLabel}>PLAYER JOIN CODE</Text>
              <Text selectable style={styles.code}>{lobby.join_code}</Text>
            </View>
          )}
          <Text style={styles.status}>
            {lobby.status === 'open' ? 'Lobby open · live updates on' : 'Lobby closed'}
            {'  ·  '}{lobby.members.length} participant{lobby.members.length === 1 ? '' : 's'}
          </Text>
          <ScrollView style={styles.roster}>
            <Text style={styles.sectionTitle}>PLAYERS</Text>
            {lobby.members.map((member) => {
              const character = lobby.characters.find(
                (item) => item.character_id === member.claimed_character_id,
              );
              return (
                <View key={member.user_id} style={styles.member}>
                  <View style={styles.memberText}>
                    <Text numberOfLines={1} style={styles.memberName}>
                      {member.display_name}{member.user_id === identity?.userId ? ' · You' : ''}
                    </Text>
                    <Text numberOfLines={1} style={styles.memberDetail}>
                      {member.role === 'dm'
                        ? 'Dungeon Master'
                        : character
                          ? `Playing ${character.name}`
                          : 'No character selected'}
                    </Text>
                  </View>
                </View>
              );
            })}
            <Text style={[styles.sectionTitle, styles.characterHeading]}>CHARACTERS</Text>
            {lobby.characters.map((character) => {
              const claimant = lobby.members.find(
                (member) => member.claimed_character_id === character.character_id,
              );
              const isMine = claimant?.user_id === identity?.userId && lobby.role === 'player';
              const isDisabled =
                lobby.role !== 'player' ||
                lobby.status !== 'open' ||
                isBusy ||
                Boolean(claimant && !isMine);
              const portrait = getCharacterPortrait(character.portrait_preset_id);
              return (
                <View key={character.character_id} style={styles.character}>
                  {portrait ? (
                    <Image source={portrait} resizeMode="cover" style={styles.portrait} />
                  ) : (
                    <View style={styles.portraitInitial}>
                      <Text style={styles.portraitInitialText}>
                        {character.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.memberText}>
                    <Text numberOfLines={1} style={styles.memberName}>{character.name}</Text>
                    <Text numberOfLines={1} style={styles.memberDetail}>
                      {character.race ? `${character.race} · ` : ''}{character.class_name}
                      {claimant ? ` · ${claimant.display_name}` : ' · Available'}
                    </Text>
                  </View>
                  {lobby.role === 'player' && lobby.status === 'open' && (
                    <Pressable
                      accessibilityRole="button"
                      disabled={isDisabled}
                      onPress={() => void handleClaimCharacter(
                        isMine ? null : character.character_id,
                      )}
                      style={[
                        styles.claimButton,
                        isMine && styles.releaseButton,
                        isDisabled && !isMine && styles.disabled,
                      ]}
                    >
                      <Text style={styles.claimText}>{isMine ? 'Release' : 'Claim'}</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
            {lobby.characters.length === 0 && (
              <Text style={styles.hint}>The DM has not added active party characters.</Text>
            )}
          </ScrollView>
          {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.secondaryButton}>
            <Text style={styles.secondaryText}>Done</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: 54,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#030A12',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(196, 151, 76, 0.5)',
  },
  backButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  backText: {
    color: '#E8B95F',
    fontFamily: 'serif',
    fontSize: 16,
  },
  title: {
    flex: 1,
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 22,
    fontWeight: '700',
  },
  joinContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 28,
  },
  lobbyContent: {
    flex: 1,
    paddingTop: 18,
  },
  encounterName: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 24,
    fontWeight: '700',
  },
  description: {
    color: '#BDAE98',
    fontFamily: 'serif',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 20,
  },
  fieldLabel: {
    color: '#E8B95F',
    fontFamily: 'serif',
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    minHeight: 48,
    marginTop: 6,
    marginBottom: 16,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#79613B',
    borderRadius: 6,
    backgroundColor: '#0B1924',
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 16,
  },
  hint: {
    color: '#BDAE98',
    fontFamily: 'serif',
    fontSize: 13,
    lineHeight: 19,
  },
  error: {
    color: '#E9A18C',
    fontFamily: 'serif',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
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
    marginTop: 18,
    borderWidth: 1,
    borderColor: '#C69A50',
    borderRadius: 6,
    backgroundColor: 'rgba(167, 122, 49, 0.2)',
  },
  primaryText: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 16,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.45,
  },
  codePanel: {
    alignItems: 'center',
    marginBottom: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#C69A50',
    borderRadius: 7,
    backgroundColor: 'rgba(167, 122, 49, 0.12)',
  },
  code: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 6,
  },
  status: {
    color: '#E8B95F',
    fontFamily: 'serif',
    fontSize: 12,
    marginBottom: 6,
  },
  roster: {
    flexGrow: 0,
    maxHeight: 440,
  },
  sectionTitle: {
    color: '#E8B95F',
    fontFamily: 'serif',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 5,
  },
  member: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(196, 151, 76, 0.3)',
  },
  memberText: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 9,
  },
  memberName: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 14,
  },
  memberDetail: {
    color: '#BDA476',
    fontFamily: 'serif',
    fontSize: 11,
    marginTop: 1,
  },
  characterHeading: {
    marginTop: 14,
  },
  character: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(196, 151, 76, 0.3)',
  },
  portrait: {
    width: 40,
    height: 40,
    flexShrink: 0,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#987443',
    borderRadius: 5,
  },
  portraitInitial: {
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
  portraitInitialText: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 18,
  },
  claimButton: {
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
  releaseButton: {
    borderColor: '#987443',
    backgroundColor: 'rgba(5, 14, 22, 0.78)',
  },
  claimText: {
    color: '#F4DDAE',
    fontFamily: 'serif',
    fontSize: 12,
    fontWeight: '600',
  },
  secondaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#79613B',
    borderRadius: 6,
  },
  secondaryText: {
    color: '#BDAE98',
    fontFamily: 'serif',
    fontSize: 14,
  },
});
