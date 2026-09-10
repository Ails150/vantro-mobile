import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const JOBS_KEY = 'vantro_cached_jobs';
const QUEUE_KEY = 'vantro_offline_queue';

export type QueuedType = 'signin' | 'signout' | 'diary';

export type QueuedAction = {
  id: string;
  type: QueuedType;
  payload: any;
  createdAt: string;
  /** Times we have tried to post this and the server refused or was unreachable. */
  attempts: number;
};

export type SyncState = {
  pending: number;
  syncing: boolean;
  online: boolean;
  /** ISO time of the last run that cleared at least one action. */
  lastSyncedAt: string | null;
};

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

// ---------------------------------------------------------------------------
// Observable state
//
// A queued sign-in is invisible: the installer taps, sees a line of text, walks
// away, and has no way to tell hours later whether the shift ever reached us.
// The queue publishes its depth so the header can carry that answer without
// each screen polling AsyncStorage on its own.
// ---------------------------------------------------------------------------

let state: SyncState = { pending: 0, syncing: false, online: true, lastSyncedAt: null };
const listeners = new Set<(s: SyncState) => void>();

export function getSyncState(): SyncState {
  return state;
}

export function subscribeSync(fn: (s: SyncState) => void): () => void {
  listeners.add(fn);
  fn(state);
  return () => { listeners.delete(fn); };
}

function setState(patch: Partial<SyncState>) {
  const next = { ...state, ...patch };
  if (
    next.pending === state.pending &&
    next.syncing === state.syncing &&
    next.online === state.online &&
    next.lastSyncedAt === state.lastSyncedAt
  ) return;
  state = next;
  for (const fn of listeners) { try { fn(state); } catch {} }
}

/** Re-read the queue from storage and publish its depth. */
export async function refreshSyncState(): Promise<SyncState> {
  const queue = await getQueue();
  setState({ pending: queue.length });
  return state;
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

// Date.now() alone collides when two actions are queued inside the same
// millisecond, and a duplicate id makes a failed item indistinguishable from
// the one that succeeded.
let seq = 0;
function actionId(): string {
  seq += 1;
  return `${Date.now()}-${seq}`;
}

export async function queueAction(action: { type: QueuedType; payload: any }) {
  try {
    const queue = await getQueue();
    queue.push({ ...action, id: actionId(), createdAt: new Date().toISOString(), attempts: 0 });
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    setState({ pending: queue.length });
  } catch {}
}

export async function getQueue(): Promise<QueuedAction[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export async function clearQueue() {
  try { await AsyncStorage.removeItem(QUEUE_KEY); } catch {}
  setState({ pending: 0 });
}

const PATHS: Record<QueuedType, string> = {
  signin: '/api/signin',
  signout: '/api/signout',
  diary: '/api/diary',
};

// Two callers can reach syncQueue at once - a foreground event and the NetInfo
// listener firing together - and posting the same shift twice is worse than
// posting it late.
let inFlight: Promise<number> | null = null;

export async function syncQueue(authFetch: Function): Promise<number> {
  if (inFlight) return inFlight;
  inFlight = runSync(authFetch).finally(() => { inFlight = null; });
  return inFlight;
}

async function runSync(authFetch: Function): Promise<number> {
  const online = await isOnline();
  setState({ online });
  if (!online) return 0;

  const queue = await getQueue();
  if (queue.length === 0) { setState({ pending: 0 }); return 0; }

  setState({ syncing: true, pending: queue.length });

  let synced = 0;
  const failed: QueuedAction[] = [];

  try {
    for (const action of queue) {
      const path = PATHS[action.type];
      if (!path) continue; // unknown type from an older build: drop it rather than retry forever
      try {
        const res = await authFetch(path, { method: 'POST', body: JSON.stringify(action.payload) });
        if (res?.ok) {
          synced++;
        } else if (res && res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 408 && res.status !== 429) {
          // The server understood and refused - out of the geofence, shift already
          // closed. Retrying cannot change the answer, so drop it instead of
          // wedging the queue behind an action that will never clear.
          console.warn('[offline] dropping %s, server refused with %s', action.type, res.status);
        } else {
          failed.push({ ...action, attempts: (action.attempts ?? 0) + 1 });
        }
      } catch {
        failed.push({ ...action, attempts: (action.attempts ?? 0) + 1 });
      }
    }

    if (failed.length > 0) {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(failed));
    } else {
      await AsyncStorage.removeItem(QUEUE_KEY);
    }

    setState({
      pending: failed.length,
      lastSyncedAt: synced > 0 ? new Date().toISOString() : state.lastSyncedAt,
    });
  } finally {
    setState({ syncing: false });
  }

  return synced;
}

// ---------------------------------------------------------------------------
// Auto sync
//
// The queue used to drain only when the installer happened to open the jobs
// list. Someone who signed in offline and put the phone away kept the shift on
// the device until the next launch. Drain it the moment the connection returns.
// ---------------------------------------------------------------------------

let unsubscribeNet: (() => void) | null = null;

export function startQueueAutoSync(authFetch: Function): () => void {
  if (unsubscribeNet) return unsubscribeNet;

  let wasOnline = false;

  const sub = NetInfo.addEventListener(netState => {
    const nowOnline = !!(netState.isConnected && netState.isInternetReachable);
    setState({ online: nowOnline });
    // Only on the transition: NetInfo re-emits on unrelated changes and a sync
    // per emission would hammer the API on a flaky connection.
    if (nowOnline && !wasOnline) {
      syncQueue(authFetch).catch(() => {});
    }
    wasOnline = nowOnline;
  });

  refreshSyncState().catch(() => {});

  unsubscribeNet = () => { sub(); unsubscribeNet = null; };
  return unsubscribeNet;
}
