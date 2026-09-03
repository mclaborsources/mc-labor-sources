import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase configuration. Set EXPO_PUBLIC_SUPABASE_URL and ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY in the root .env or your EAS environment.',
  );
}

try {
  const url = new URL(supabaseUrl);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) {
    throw new Error('Unexpected Supabase project URL');
  }
} catch {
  throw new Error('EXPO_PUBLIC_SUPABASE_URL must be a valid https://*.supabase.co URL.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    storageKey: 'mc-labor-mobile-auth-session',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: processLock,
  },
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}

export async function signIn(identifier: string, password: string) {
  const normalized = identifier.trim().toLowerCase();
  if (/^[a-z]{1,3}$/.test(normalized)) {
    const response = await fetch(`${supabaseUrl}/functions/v1/worker-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey! },
      body: JSON.stringify({ username: normalized, password }),
    });
    const result = await response.json();
    if (response.ok) {
      if (!result.access_token || !result.refresh_token) throw new Error('Unable to sign in.');
      const { data, error } = await supabase.auth.setSession({
        access_token: result.access_token, refresh_token: result.refresh_token,
      });
      if (error) throw error;
      return data;
    }
    if (response.status !== 401) throw new Error(result.error || 'Unable to sign in.');
    // Retain existing email-alias/training logins; never fall back on a server
    // configuration error or rate limit.
  }
  const email = normalized.includes('@')
    ? normalized
    : `${normalized}@workers.mc-labor.local`;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Preserve the existing training-account sign-in convention.
    if (!normalized.includes('@') && error.code === 'invalid_credentials') {
      const training = await supabase.auth.signInWithPassword({
        email: `training.${password.replace(/\D/g, '')}@mc-labor.local`, password,
      });
      if (!training.error) {
        const trainingName = String(training.data.user?.user_metadata?.name ?? '').trim().toLowerCase();
        if (trainingName === normalized) return training.data;
        await supabase.auth.signOut();
      }
    }
    throw error;
  }
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
