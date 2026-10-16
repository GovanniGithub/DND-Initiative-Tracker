import * as Device from 'expo-device';
import { useRef } from 'react';
import { Animated, Image, Platform, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

function getDevMenuHint() {
  if (Platform.OS === 'web') {
    return <ThemedText type="small">use browser devtools</ThemedText>;
  }
  if (Device.isDevice) {
    return (
      <ThemedText type="small">
        shake device or press <ThemedText type="code">m</ThemedText> in terminal
      </ThemedText>
    );
  }
  const shortcut = Platform.OS === 'android' ? 'cmd+m (or ctrl+m)' : 'cmd+d';
  return (
    <ThemedText type="small">
      press <ThemedText type="code">{shortcut}</ThemedText>
    </ThemedText>
  );
}
function GlowButton({label}: {label: string}) {
  const glow = useRef(new Animated.Value(0)).current;

  function fadeGlow(value: number){
    Animated.timing(glow, {
      toValue: value,
      duration: 100,
      useNativeDriver: false,
    }).start();
  }

  return (
    <Pressable
      accessibilityRole="button"
      onHoverIn={() => fadeGlow(1)}
      onHoverOut={() => fadeGlow(0)}
      onFocus={() => fadeGlow(1)}
      onBlur={() => fadeGlow(0)}
      onPressIn={() => fadeGlow(1)}
      onPressOut={() => fadeGlow(0)}
      onPress={() => console.log(`${label} clicked`)}
      style={styles.menuButton}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.buttonGlow, { opacity: glow }]}
      />

      <Animated.Text
        style={[
          styles.menuButtonText,
          {
            textShadowColor: '#FFBD59',
            textShadowOffset: { width: 0, height: 0 },
            textShadowRadius: glow.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 10],
            }),
          },
        ]}>
        {label}
      </Animated.Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  return (
    <ThemedView style={styles.container}>
      <Animated.View
          pointerEvents="none"
          style={styles.pageFrame}
      />
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.heroSection}>
          
          <ThemedText type="title" style={styles.title}>
            Initiative Tracker
          </ThemedText>
          
          <Image 
            source={require('../../assets/images/dragons-d20.png')}
            style={styles.dragonImage}
            resizeMode="contain"
          />
        </ThemedView>

        <GlowButton label="Campaigns" />
        <GlowButton label="Settings" />

      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080F18',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: 600,
    paddingHorizontal: 24,
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  heroSection: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    gap: 24,
  },
  title: {
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    textAlign: 'center',
    color: '#F5DEAA',
    lineHeight: 44,
    fontSize: 36,
  },
  code: {
    textTransform: 'uppercase',
  },
  stepContainer: {
    gap: Spacing.three,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.four,
  },
    menuButton: {
    width: '100%',
    maxWidth: 340,
    paddingVertical: 18,
    alignItems: 'center',
    backgroundColor: '#171C25',
    borderWidth: 2,
    borderColor: '#C9A45C',
    borderRadius: 12,
  },
  menuButtonPressed: {
    transform: [{ scale: 0.97 }],
    backgroundColor: '#302719',
  },
  menuButtonText: {
    color: '#F5DEAA',
    fontSize: 24,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  dragonImage: {
    width: '100%',
    maxWidth: 500,
    height: 240,
    alignSelf: 'center',
  },
  buttonGlow: {
  ...StyleSheet.absoluteFillObject,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: '#FFE0A0',
  backgroundColor: 'rgba(218, 146, 40, 0.12)',
  shadowColor: '#FFB640',
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.8,
  shadowRadius: 12,
},
pageFrame: {
  position: 'absolute',
  top: 16,
  bottom: 16,
  left: 16,
  right: 16,
  borderWidth: 1,
  borderColor: '#C9A45C',
  borderRadius: 16,
},
});
