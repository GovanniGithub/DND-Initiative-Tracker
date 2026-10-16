import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="campaigns"
          options={{
            animation: 'fade',
            animationDuration: 250,
          }}
        />
        <Stack.Screen
          name="campaign/[id]"
          options={{
            presentation: 'fullScreenModal',
            animation: 'none',
            contentStyle: { backgroundColor: '#030A12' },
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}
