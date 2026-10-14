'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, getToken, setToken } from './api';
import type { AuthUser, Branch, Organization } from './types';

interface RegisterInput {
  organizationName: string;
  slug: string;
  currency: string;
  userName: string;
  email: string;
  password: string;
}

interface AuthState {
  user: AuthUser | null;
  organization: Organization | null;
  branches: Branch[];
  activeBranchId: string | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<TwoFactorPrompt | void>;
  completeTwoFactorLogin: (challenge: string, code: string, method?: 'totp' | 'email' | 'backup') => Promise<void>;
  registerOrg: (input: RegisterInput) => Promise<void>;
  logout: () => void;
  setActiveBranchId: (id: string | null) => void;
}

export interface TwoFactorPrompt {
  twoFactorRequired: true;
  challenge: string;
  methods: string[];
  email?: string;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchIdState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const applySession = useCallback(
    (data: { token: string; user: AuthUser; organization: Organization; branches: Branch[] }) => {
      setToken(data.token);
      setUser(data.user);
      setOrganization(data.organization);
      setBranches(data.branches || []);
      setActiveBranchIdState(data.user.branchId || data.branches?.[0]?.id || null);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const token = getToken();
    const bootstrap = async () => {
      if (token) {
        try {
          const data = await api<{ user: AuthUser; organization: Organization; branches: Branch[] }>('/auth/me');
          if (cancelled) return;
          setUser(data.user);
          setOrganization(data.organization);
          setBranches(data.branches);
          if (typeof window !== 'undefined') {
            const saved = window.localStorage.getItem('fit_branch');
            if (saved && data.branches.some((b) => b.id === saved)) setActiveBranchIdState(saved);
            else setActiveBranchIdState(data.user.branchId || data.branches[0]?.id || null);
          }
        } catch {
          setToken(null);
        }
        if (!cancelled) setReady(true);
        return;
      }
      // Sin token: el panel de escritorio (single-tenant) entra directo como
      // administrador local. En la nube este endpoint no existe y queda sin sesión.
      try {
        const data = await api<{ token: string; user: AuthUser; organization: Organization; branches: Branch[] }>(
          '/auth/desktop-session',
          { method: 'POST' },
        );
        if (!cancelled) applySession(data);
      } catch {
        /* sin sesión automática */
      }
      if (!cancelled) setReady(true);
    };
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [applySession]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<{
      token?: string;
      user?: AuthUser;
      organization?: Organization;
      branches?: Branch[];
      twoFactorRequired?: boolean;
      challenge?: string;
      methods?: string[];
      email?: string;
    }>('/auth/login', { method: 'POST', body: { email, password } });

    if (data.twoFactorRequired && data.challenge) {
      return {
        twoFactorRequired: true as const,
        challenge: data.challenge,
        methods: data.methods ?? ['totp'],
        email: data.email,
      };
    }
    applySession(data as { token: string; user: AuthUser; organization: Organization; branches: Branch[] });
  }, [applySession]);

  const completeTwoFactorLogin = useCallback(
    async (challenge: string, code: string, method?: 'totp' | 'email' | 'backup') => {
      const data = await api<{ token: string; user: AuthUser; organization: Organization; branches: Branch[] }>(
        '/auth/login/2fa',
        { method: 'POST', body: { challenge, code, method } },
      );
      applySession(data);
    },
    [applySession],
  );

  const registerOrg = useCallback(async (input: RegisterInput) => {
    const data = await api<{
      token: string;
      user: AuthUser;
      organization: Organization;
      branch: Branch;
    }>('/auth/register', { method: 'POST', body: input });
    setToken(data.token);
    setUser(data.user);
    setOrganization(data.organization);
    setBranches([data.branch]);
    setActiveBranchIdState(data.branch?.id || null);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setOrganization(null);
    setBranches([]);
    setActiveBranchIdState(null);
  }, []);

  const setActiveBranchId = useCallback((id: string | null) => {
    setActiveBranchIdState(id);
    if (typeof window !== 'undefined') {
      if (id) window.localStorage.setItem('fit_branch', id);
      else window.localStorage.removeItem('fit_branch');
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      organization,
      branches,
      activeBranchId,
      ready,
      login,
      completeTwoFactorLogin,
      registerOrg,
      logout,
      setActiveBranchId,
    }),
    [user, organization, branches, activeBranchId, ready, login, completeTwoFactorLogin, registerOrg, logout, setActiveBranchId],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}

export function useIsAdmin() {
  const { user } = useAuth();
  return user ? ['OWNER', 'ADMIN'].includes(user.role) : false;
}