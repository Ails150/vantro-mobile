import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const JOBS_KEY = 'vantro_cached_jobs';
const QUEUE_KEY = 'vantro_offline_queue';

export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return !!(state.isConnected && state.isInternetReachable);
}

export async function cacheJobs(jobs: any[]) {
  try {
    await AsyncStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
  } catch {}
}

export async function getCachedJobs(): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(JOBS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function queueAction(action: { type: 'signin' | 'signout' | 'diary'; payload: any }) {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const queue = raw ? JSON.parse(raw) : [];
    queue.push({ ...action, id: Date.now().toString(), createdAt: new Date().toISOString() });
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {}
}

export async function getQueue(): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function clearQueue() {
  try { await AsyncStorage.removeItem(QUEUE_KEY); } catch {}
}

export async function syncQueue(authFetch: Function): Promise<number> {
  const online = await isOnline();
  if (!online) return 0;

  const queue = await getQueue();
  if (queue.length === 0) return 0;

  let synced = 0;
  const failed: any[] = [];

  for (const action of queue) {
    try {
      let res;
      if (action.type === 'signin') {
        res = await authFetch('/api/signin', { method: 'POST', body: JSON.stringify(action.payload) });
      } else if (action.type === 'signout') {
        res = await authFetch('/api/signout', { method: 'POST', body: JSON.stringify(action.payload) });
      } else if (action.type === 'diary') {
        res = await authFetch('/api/diary', { method: 'POST', body: JSON.stringify(action.payload) });
      }
      if (res?.ok) { synced++; } else { failed.push(action); }
    } catch { failed.push(action); }
  }

  if (failed.length > 0) {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(failed));
  } else {
    await clearQueue();
  }

  return synced;
}