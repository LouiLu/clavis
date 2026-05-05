import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api/client';

interface Organization {
  id: string;
  name: string;
  role: string;
}

interface CurrentUser {
  id: string;
  email: string;
  display_name: string;
  user_type: string;
  status: string;
  organizations: Organization[];
}

interface AuthState {
  token: string | null;
  user: CurrentUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('platform_access_token'));
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (token) {
      api.get<CurrentUser>('/v1/me')
        .then(setUser)
        .catch(() => {
          localStorage.removeItem('platform_access_token');
          setToken(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.post<{ access_token: string }>('/v1/auth/login', { email, password });
    localStorage.setItem('platform_access_token', result.access_token);
    setToken(result.access_token);
    const me = await api.get<CurrentUser>('/v1/me');
    setUser(me);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('platform_access_token');
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(() => ({
    token,
    user,
    isAuthenticated: !!token && !!user,
    isLoading,
    login,
    logout,
  }), [token, user, isLoading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
