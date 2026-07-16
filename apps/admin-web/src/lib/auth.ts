import { UserRole } from '@mc-labor/shared';
import { api, type AuthUser } from './api-client';
import { createClient } from './supabase/client';

export function getRedirectPath(role: string): string {
  switch (role) {
    case UserRole.CUSTOMER:
      return '/customer/dashboard';
    case UserRole.SUPERVISOR:
      return '/supervisor/dashboard';
    case UserRole.WORKER:
      return '/login?message=worker-mobile';
    case UserRole.ADMIN:
    case UserRole.SUPER_ADMIN:
    default:
      return '/assignments';
  }
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    throw new Error(error.message);
  }

  if (!data.session?.access_token) {
    throw new Error('Login failed');
  }

  const user = await api.getMe();
  return user;
}

export async function logout() {
  const supabase = createClient();
  await supabase.auth.signOut();
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    return await api.getMe();
  } catch {
    return null;
  }
}

export function isAdminRole(role: string) {
  return role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
}

export function isCustomerRole(role: string) {
  return role === UserRole.CUSTOMER;
}
