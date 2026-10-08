import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { getMe, type MobileUser } from '@/lib/api';
import { registerForPushNotifications } from '@/lib/push';

interface AuthContextValue {
  user: MobileUser | null;
  loading: boolean;
  refresh: () => Promise<MobileUser | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MobileUser | null>(null);
  const [loading, setLoading] = useState(true);

  const checkRevokedSession = useCallback(async (): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return false;
      const { data, error } = await supabase.rpc('is_current_auth_session_active');
      // Missing migration or temporary connection failures must not sign users out.
      if (error || data !== false) return false;
      const { data: latest } = await supabase.auth.getSession();
      // A response for an older session must not clear a newly signed-in account.
      if (latest.session?.access_token !== session.access_token) return false;
      await supabase.auth.signOut({ scope: 'local' });
      setUser(null);
      return true;
    } catch {
      return false;
    }
  }, []);

  const refresh = useCallback(async (): Promise<MobileUser | null> => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setUser(null);
      return null;
    }
    try {
      if (await checkRevokedSession()) return null;
      const profile = await getMe();
      setUser(profile);
      if (profile.role === 'WORKER' || profile.role === 'SUPERVISOR') {
        void registerForPushNotifications(profile.id).catch(() => undefined);
      }
      return profile;
    } catch {
      setUser(null);
      return null;
    }
  }, [checkRevokedSession]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    const pendingRefreshes = new Set<ReturnType<typeof setTimeout>>();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      // Supabase calls made directly inside onAuthStateChange can deadlock the
      // client. Defer profile loading until the auth callback has completed.
      const timer = setTimeout(() => {
        pendingRefreshes.delete(timer);
        void refresh();
      }, 0);
      pendingRefreshes.add(timer);
    });
    return () => {
      for (const timer of pendingRefreshes) clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    let checking = false;
    const check = async () => {
      if (checking || AppState.currentState === 'background' || AppState.currentState === 'inactive') return;
      checking = true;
      try {
        if (!await checkRevokedSession()) {
          const profile = await getMe();
          setUser((current) => current?.id === profile.id ? profile : current);
        }
      } catch {
        // Retain the saved account during temporary connectivity failures.
      } finally {
        checking = false;
      }
    };
    const timer = setInterval(() => void check(), 15_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    const onFocus = () => void check();
    if (Platform.OS === 'web') window.addEventListener('focus', onFocus);
    void check();
    return () => {
      clearInterval(timer);
      subscription.remove();
      if (Platform.OS === 'web') window.removeEventListener('focus', onFocus);
    };
  }, [user?.id, checkRevokedSession]);

  const value = useMemo(
    () => ({ user, loading, refresh, signOut }),
    [user, loading, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
