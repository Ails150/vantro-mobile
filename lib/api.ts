import * as SecureStore from 'expo-secure-store';
import { API_BASE } from '@/constants/api';

export async function getToken(): Promise<string | null> {
  return await SecureStore.getItemAsync('vantro_token');
}

// A request with no token is a guaranteed 401 that looks identical to a
// rejected token, which is how a missing SecureStore read gets misread as a
// server problem. Say so at the point it happens.
export async function hasToken(): Promise<boolean> {
  return !!(await getToken());
}

export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  if (!token) console.warn('[api] no token in SecureStore, %s will 401', path);
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

export async function authFormFetch(path: string, body: FormData): Promise<Response> {
  const token = await getToken();
  return fetch(`${API_BASE}${path}`, {
    method: 'POST',
    body,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}
