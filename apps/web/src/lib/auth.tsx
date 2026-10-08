'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: 'CITIZEN' | 'FIELD_WORKER' | 'OFFICER' | 'ADMIN';
  status: string;
};

type AuthState = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (input: { email: string; password: string; name: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Supersession counter: a slow background refresh must never overwrite the
  // result of a login/logout that completed while it was in flight.
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const gen = generation.current;
    try {
      const data = await apiFetch<{ accessToken: string; user: AuthUser }>('/api/auth/refresh', {
        method: 'POST',
      });
      if (gen !== generation.current) return;
      setToken(data.accessToken);
      setUser(data.user);
    } catch {
      if (gen !== generation.current) return;
      setToken(null);
      setUser(null);
    } finally {
      // The probe is over either way: only the user/token writes are guarded,
      // otherwise a login that supersedes this refresh leaves loading stuck.
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    generation.current += 1;
    const data = await apiFetch<{ accessToken: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(data.accessToken);
    setUser(data.user);
    setLoading(false);
    return data.user;
  }, []);

  const register = useCallback(async (input: { email: string; password: string; name: string }) => {
    await apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify(input) });
  }, []);

  const logout = useCallback(async () => {
    generation.current += 1;
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setToken(null);
    setUser(null);
    setLoading(false);
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, login, register, logout, refresh }),
    [user, token, loading, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function homeForRole(role: AuthUser['role']): string {
  if (role === 'ADMIN') return '/admin/dashboard';
  if (role === 'OFFICER') return '/officer/dashboard';
  if (role === 'FIELD_WORKER') return '/worker/dashboard';
  return '/dashboard';
}
