import * as SecureStore from 'expo-secure-store';
import { API_BASE } from '@/constants/api';

export async function getToken(): Promise<string | null> {
  return await SecureStore.getItemAsync('vantro_token');
}

export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getToken();
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
