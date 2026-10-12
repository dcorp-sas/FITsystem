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
  login: (email: string, password: string) => Promise<void>;
  registerOrg: (input: RegisterInput) => Promise<void>;
  logout: () => void;
  setActiveBranchId: (id: string | null) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchIdState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setReady(true);
      return;
    }
    api<{ user: AuthUser; organization: Organization; branches: Branch[] }>('/auth/me')
      .then((data) => {
        setUser(data.user);
        setOrganization(data.organization);
        setBranches(data.branches);
        if (typeof window !== 'undefined') {
          const saved = window.localStorage.getItem('fit_branch');
          if (saved && data.branches.some((b) => b.id === saved)) setActiveBranchIdState(saved);
          else setActiveBranchIdState(data.user.branchId || data.branches[0]?.id || null);
        }
      })
      .catch(() => {
        setToken(null);
      })
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<{
      token: string;
      user: AuthUser;
      organization: Organization;
      branches: Branch[];
    }>('/auth/login', { method: 'POST', body: { email, password } });
    setToken(data.token);
    setUser(data.user);
    setOrganization(data.organization);
    setBranches(data.branches || []);
    setActiveBranchIdState(data.user.branchId || data.branches?.[0]?.id || null);
  }, []);

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
      registerOrg,
      logout,
      setActiveBranchId,
    }),
    [user, organization, branches, activeBranchId, ready, login, registerOrg, logout, setActiveBranchId],
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