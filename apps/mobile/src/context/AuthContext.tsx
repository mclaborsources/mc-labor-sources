import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { getMe, mobileApi, type MobileUser } from '@/lib/api';
import { registerForPushNotifications } from '@/lib/push';

const ASSIGNMENT_SESSION_HOURS = 12;
const INACTIVE_ASSIGNMENT_STATUSES = new Set(['CANCELLED', 'COMPLETED', 'DECLINED']);

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function assignmentExpiryToday(
  assignment: { assignedDate: string; endDate: string | null; startTime: string | null; status: string },
  now: Date,
): Date | null {
  const today = localDateKey(now);
  if (
    INACTIVE_ASSIGNMENT_STATUSES.has(assignment.status.toUpperCase())
    || assignment.assignedDate > today
    || (assignment.endDate && assignment.endDate < today)
    || !assignment.startTime
  ) {
    return null;
  }

  const match = assignment.startTime.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? 0);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;

  const expiry = new Date(now);
  expiry.setHours(hours + ASSIGNMENT_SESSION_HOURS, minutes, seconds, 0);
  return expiry;
}

function nextLocalDay(now: Date): Date {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(0, 0, 1, 0);
  return next;
}

interface AuthContextValue {
  user: MobileUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MobileUser | null>(null);
  const [loading, setLoading] = useState(true);
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setUser(null);
      return;
    }
    try {
      const profile = await getMe();
      setUser(profile);
      if (profile.role === 'WORKER' || profile.role === 'SUPERVISOR') {
        void registerForPushNotifications(profile.id).catch(() => undefined);
      }
    } catch {
      setUser(null);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      refresh();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const clearExpiryTimer = () => {
      if (expiryTimer.current) {
        clearTimeout(expiryTimer.current);
        expiryTimer.current = null;
      }
    };

    const scheduleWorkerExpiryCheck = async () => {
      clearExpiryTimer();
      if (!user || user.role !== 'WORKER') return;

      try {
        const now = new Date();
        const assignments = await mobileApi.getAssignments();
        if (cancelled) return;

        const expiries = assignments
          .map((assignment) => assignmentExpiryToday(assignment, now))
          .filter((expiry): expiry is Date => expiry !== null)
          .sort((a, b) => a.getTime() - b.getTime());
        const expiry = expiries[0] ?? nextLocalDay(now);
        const delay = expiry.getTime() - now.getTime();

        if (expiries.length > 0 && delay <= 0) {
          await supabase.auth.signOut({ scope: 'local' });
          if (!cancelled) setUser(null);
          return;
        }

        expiryTimer.current = setTimeout(() => {
          void scheduleWorkerExpiryCheck();
        }, Math.max(1_000, delay));
      } catch {
        // A temporary assignment lookup failure should not unexpectedly sign a worker out.
        // Check again when the app returns to the foreground or the auth session changes.
      }
    };

    void scheduleWorkerExpiryCheck();
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void scheduleWorkerExpiryCheck();
    });

    return () => {
      cancelled = true;
      clearExpiryTimer();
      appStateSubscription.remove();
    };
  }, [user?.id, user?.role]);

  const value = useMemo(
    () => ({ user, loading, refresh, signOut }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
