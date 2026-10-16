import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type SupabaseIdentity = {
  userId: string;
  isAnonymous: boolean;
};

let client: SupabaseClient | null = null;
let identityPromise: Promise<SupabaseIdentity> | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.EXPO_PUBLIC_SUPABASE_URL &&
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) {
    throw new Error(
      'Online lobbies need EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local.',
    );
  }
  try {
    new URL(url);
  } catch {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL must be a valid HTTPS Supabase project URL.');
  }
  if (!url.startsWith('https://')) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL must be a valid HTTPS Supabase project URL.');
  }

  client = createClient(url, publishableKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}

export function ensureSupabaseIdentity(): Promise<SupabaseIdentity> {
  if (identityPromise) return identityPromise;
  identityPromise = resolveSupabaseIdentity().catch((error: unknown) => {
    identityPromise = null;
    throw error;
  });
  return identityPromise;
}

async function resolveSupabaseIdentity(): Promise<SupabaseIdentity> {
  const supabase = getSupabaseClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(`Supabase session could not be restored: ${sessionError.message}`);
  if (sessionData.session) {
    return {
      userId: sessionData.session.user.id,
      isAnonymous: sessionData.session.user.is_anonymous ?? false,
    };
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    if (error.message.toLowerCase().includes('anonymous')) {
      throw new Error(
        'Supabase rejected device sign-in. In your Supabase dashboard, enable Anonymous Sign-Ins under Authentication → Sign In / Providers.',
      );
    }
    throw new Error(`Device identity could not be created: ${error.message}`);
  }
  if (!data.user) throw new Error('Supabase did not return a device identity.');
  return { userId: data.user.id, isAnonymous: data.user.is_anonymous ?? false };
}
