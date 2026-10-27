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
import { api, ApiError, getToken, setToken } from './api';
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
  sessionError: string | null;
  login: (email: string, password: string) => Promise<TwoFactorPrompt | void>;
  completeTwoFactorLogin: (challenge: string, code: string, method?: 'totp' | 'email' | 'backup') => Promise<void>;
  registerOrg: (input: RegisterInput) => Promise<void>;
  logout: () => void;
  setActiveBranchId: (id: string | null) => void;
  refresh: () => Promise<void>;
  retrySession: () => void;
}

export interface TwoFactorPrompt {
  twoFactorRequired: true;
  challenge: string;
  methods: string[];
  email?: string;
}

const AuthContext = createContext<AuthState | null>(null);

// ID de instalación que el panel de escritorio pasa por la URL (modo nube). Se
// guarda para no perderlo al navegar entre pantallas del panel.
const INSTALLATION_KEY = 'fit_installation_id';

function readInstallationId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('installationId');
    if (fromUrl) {
      window.localStorage.setItem(INSTALLATION_KEY, fromUrl);
      return fromUrl;
    }
    return window.localStorage.getItem(INSTALLATION_KEY);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchIdState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const applySession = useCallback(
    (data: { token: string; user: AuthUser; organization: Organization; branches: Branch[] }) => {
      setToken(data.token);
      setUser(data.user);
      setOrganization(data.organization);
      setBranches(data.branches || []);
      setActiveBranchIdState(data.branches?.[0]?.id || null);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const token = getToken();
    const bootstrap = async () => {
      if (token) {
        try {
          const data = await api<{ user: AuthUser; organization: Organization; branches: Branch[] }>('/auth/me', {
            timeoutMs: 15000,
          });
          if (cancelled) return;
          setUser(data.user);
          setOrganization(data.organization);
          setBranches(data.branches);
          if (typeof window !== 'undefined') {
            setActiveBranchIdState(data.branches[0]?.id || null);
          }
          if (!cancelled) setReady(true);
          return;
        } catch {
          // Token viejo o inválido: se descarta y se reintenta la sesión local.
          setToken(null);
        }
      }
      // El panel del gimnasio entra directo como administrador en la PC del
      // gimnasio (API local). En la nube no hay auto-ingreso: la API responde
      // 404 y se muestra la pantalla de login (admin/admin123).
      const installationId = readInstallationId();
      const MAX_ATTEMPTS = 8;
      let lastError: unknown = null;
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        if (cancelled) return;
        try {
          const data = await api<{ token: string; user: AuthUser; organization: Organization; branches: Branch[] }>(
            '/auth/desktop-session',
            { method: 'POST', timeoutMs: 12000, body: installationId ? { installationId } : undefined },
          );
          if (!cancelled) applySession(data);
          if (!cancelled) setReady(true);
          return;
        } catch (err) {
          lastError = err;
          // 404 = no hay auto-ingreso (panel en la nube): se muestra el login.
          // Cualquier 4xx es definitivo; solo se reintenta si la API aún no
          // responde (arranque del escritorio) o hay un error de red/servidor.
          if (err instanceof ApiError && err.status >= 400 && err.status < 500) break;
          if (i < MAX_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, 1500));
        }
      }
      if (!cancelled) {
        const status = lastError instanceof ApiError ? lastError.status : 0;
        if (status !== 404) {
          setSessionError(
            lastError instanceof Error ? lastError.message : 'No se pudo iniciar la sesión.',
          );
        }
        setReady(true);
      }
    };
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [applySession, attempt]);

  const retrySession = useCallback(() => {
    setReady(false);
    setSessionError(null);
    setAttempt((n) => n + 1);
  }, []);

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
    }>('/auth/login', {
      method: 'POST',
      body: { email, password, installationId: readInstallationId() ?? undefined },
    });

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

  // Relee la sesion para reflejar cambios en la organizacion (nombre, logo...).
  const refresh = useCallback(async () => {
    try {
      const data = await api<{ user: AuthUser; organization: Organization; branches: Branch[] }>('/auth/me');
      setUser(data.user);
      setOrganization(data.organization);
      setBranches(data.branches);
    } catch {
      /* sin sesion valida: se ignora */
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      organization,
      branches,
      activeBranchId,
      ready,
      sessionError,
      login,
      completeTwoFactorLogin,
      registerOrg,
      logout,
      setActiveBranchId,
      refresh,
      retrySession,
    }),
    [user, organization, branches, activeBranchId, ready, login, completeTwoFactorLogin, registerOrg, logout, setActiveBranchId, refresh, retrySession],
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
