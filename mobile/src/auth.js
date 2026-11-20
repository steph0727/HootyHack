import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { api, setAuthToken, setUnauthorizedHandler } from './api';

const KEY = 'hooty_token';

// SecureStore on iOS/Android (Keychain / Keystore); localStorage on web.
const store = {
  get: async () => {
    if (Platform.OS !== 'web') return SecureStore.getItemAsync(KEY);
    try { return window.localStorage.getItem(KEY); } catch { return null; }
  },
  set: async (v) => {
    if (Platform.OS !== 'web') return SecureStore.setItemAsync(KEY, v);
    try { window.localStorage.setItem(KEY, v); } catch {}
  },
  clear: async () => {
    if (Platform.OS !== 'web') return SecureStore.deleteItemAsync(KEY);
    try { window.localStorage.removeItem(KEY); } catch {}
  },
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const signOut = useCallback(async () => {
    setAuthToken(null);
    setUser(null);
    await store.clear();
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(signOut);
    (async () => {
      const token = await store.get();
      if (token) {
        setAuthToken(token);
        try { setUser(await api.me()); } catch { await signOut(); }
      }
      setReady(true);
    })();
  }, [signOut]);

  const finish = async ({ token, user: u }) => {
    setAuthToken(token);
    await store.set(token);
    setUser(u);
  };

  const value = useMemo(() => ({
    user,
    ready,
    setUser,
    signIn: async (email, password) => finish(await api.login({ email, password })),
    register: async (body) => finish(await api.register(body)),
    // Changing the password signs out other sessions; keep this one with the token it returns.
    changePassword: async (current_password, new_password) =>
      finish(await api.changePassword({ current_password, new_password })),
    signOut,
  }), [user, ready, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

// Admins manage every event; club accounts manage their own club's events.
export const isManager = (user) => user?.role === 'admin' || user?.role === 'club';
export const homePath = (user) => (!user ? '/sign-in' : isManager(user) ? '/admin' : '/discover');
export const roleLabel = (user) => ({ admin: 'Admin', club: 'Club' }[user?.role] || 'Student');
