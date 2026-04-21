import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { registerForPushNotifications, savePushToken } from '@/lib/notifications';

interface AuthUser {
  userId: string;
  companyId: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (pin: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => ({}),
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStoredUser();
  }, []);

  async function loadStoredUser() {
    try {
      const stored = await SecureStore.getItemAsync('vantro_user');
      const token = await SecureStore.getItemAsync('vantro_token');
      if (stored && token) {
        const parsed = JSON.parse(stored);
        // Check token expiry
        const tokenPayload = JSON.parse(
          Buffer.from(token, 'base64').toString()
        );
        if (tokenPayload.exp * 1000 > Date.now()) {
          setUser(parsed);
        } else {
          await clearAuth();
        }
      }
    } catch {}
    setLoading(false);
  }

  async function login(pin: string): Promise<{ error?: string }> {
    try {
      const res = await fetch('https://app.getvantro.com/api/installer/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || 'Incorrect PIN' };

      const authUser: AuthUser = {
        userId: data.userId,
        companyId: data.companyId,
        name: data.name,
        role: data.role,
      };

      await SecureStore.setItemAsync('vantro_token', data.token);
      await SecureStore.setItemAsync('vantro_user', JSON.stringify(authUser));
      setUser(authUser);

      // Register push notification token
      try {
        const pushToken = await registerForPushNotifications();
        if (pushToken) await savePushToken(pushToken);
      } catch {}

      return {};
    } catch {
      return { error: 'Connection error. Check your internet.' };
    }
  }

  async function clearAuth() {
    await SecureStore.deleteItemAsync('vantro_token');
    await SecureStore.deleteItemAsync('vantro_user');
    setUser(null);
  }

  async function logout() {
    await clearAuth();
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
