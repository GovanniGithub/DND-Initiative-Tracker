import { ThemedView } from '@/components/themed-view';
import { useRef } from 'react';
import {
  Animated,
  Image,
  ImageBackground,
  Pressable,
  Platform,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';

function GlowButton({
  label,
  position,
}: {
  label: string;
  position: 'campaigns' | 'settings';
}) {
  const glow = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;
  const isHovered = useRef(false);
  const isPressed = useRef(false);

  function fadeGlow(value: number) {
    Animated.timing(glow, {
      toValue: value,
      duration: 100,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }

  function animatePress(value: number) {
    if (value < 1) {
      Animated.timing(pressScale, {
        toValue: value,
        duration: 80,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
      return;
    }

    Animated.spring(pressScale, {
      toValue: 1,
      useNativeDriver: Platform.OS !== 'web',
      speed: 20,
      bounciness: 6,
    }).start();
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onHoverIn={() => {
        isHovered.current = true;
        fadeGlow(1);
      }}
      onHoverOut={() => {
        isHovered.current = false;
        if (!isPressed.current) fadeGlow(0);
      }}
      onPressIn={() => {
        isPressed.current = true;
        fadeGlow(1);
        animatePress(0.96);
      }}
      onPressOut={() => {
        isPressed.current = false;
        fadeGlow(isHovered.current ? 1 : 0);
        animatePress(1);
      }}
      onPress={() => console.log(`${label} clicked`)}
      style={[styles.menuButton, styles[position]]}
    >
      <Animated.View
        style={[
          styles.hoverArtwork,
          {
            opacity: glow.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.45],
            }),
          },
        ]}
      >
        <Image
          source={
            position === 'campaigns'
              ? require('../../assets/images/campaigns-button-glow.png')
              : require('../../assets/images/settings-button-glow.png')
          }
          resizeMode="stretch"
          style={styles.fillImage}
        />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.hoverLabel,
          styles[`${position}Label`],
          {
            transform: [
              {
                scale: glow.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.045],
                }),
              },
              { scale: pressScale },
            ],
          },
        ]}
      >
        <Image
          source={
            position === 'campaigns'
              ? require('../../assets/images/campaigns-label.png')
              : require('../../assets/images/settings-label.png')
          }
          resizeMode="stretch"
          style={styles.fillImage}
        />
      </Animated.View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const { height, width } = useWindowDimensions();
  const artworkAspectRatio = 941 / 1672;
  const artworkWidth = Math.min(width, height * artworkAspectRatio);
  const artworkHeight = artworkWidth / artworkAspectRatio;

  return (
    <ThemedView style={styles.container}>
      <ImageBackground
        source={require('../../assets/images/menu-home-background.png')}
        resizeMode="contain"
        style={{
          width: artworkWidth,
          height: artworkHeight,
        }}
      >
        <GlowButton label="Campaigns" position="campaigns" />
        <GlowButton label="Settings" position="settings" />
      </ImageBackground>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030A12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButton: {
    position: 'absolute',
  },
  campaigns: {
    left: '10.2%',
    right: '10.1%',
    top: '55.32%',
    height: '10.89%',
  },
  settings: {
    left: '12.33%',
    right: '12.86%',
    top: '67.88%',
    height: '9.87%',
  },
  hoverArtwork: {
    ...StyleSheet.absoluteFill,
  },
  fillImage: {
    width: '100%',
    height: '100%',
  },
  hoverLabel: {
    position: 'absolute',
  },
  campaignsLabel: {
    left: '26%',
    top: '28.57%',
    width: '49.33%',
    height: '49.45%',
  },
  settingsLabel: {
    left: '34.23%',
    top: '29.7%',
    width: '32.95%',
    height: '47.88%',
  },
});
