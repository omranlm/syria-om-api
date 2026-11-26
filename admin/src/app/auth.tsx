import {useQueryClient} from '@tanstack/react-query';
import {createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode} from 'react';
import {login as apiLogin, tokenStore, UNAUTHORIZED_EVENT} from '../api/client';

interface Auth {
  signedIn: boolean;
  expired: boolean;
  signIn: (phone: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({children}: {children: ReactNode}) {
  const client = useQueryClient();
  const [token, setToken] = useState(tokenStore.get);
  const [expired, setExpired] = useState(false);

  const signOut = useCallback(() => {
    tokenStore.set('');
    setToken('');
    client.clear();
  }, [client]);

  // Any 401/403 from the API ends the session.
  useEffect(() => {
    const onUnauthorized = () => {
      if (!tokenStore.get()) return;
      setExpired(true);
      signOut();
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [signOut]);

  const signIn = useCallback(async (phone: string, password: string) => {
    const t = await apiLogin(phone, password);
    tokenStore.set(t);
    setExpired(false);
    setToken(t);
  }, []);

  const value = useMemo(() => ({signedIn: !!token, expired, signIn, signOut}), [token, expired, signIn, signOut]);
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): Auth {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
