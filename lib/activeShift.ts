import * as SecureStore from 'expo-secure-store';
import { authFetch } from './api';

const STORAGE_KEY = 'vantro_active_shift';

export interface ActiveShift {
  signinId: string;
  jobId: string;
  jobName: string | null;
  jobLat: number | null;
  jobLng: number | null;
  signedInAt: string;       // ISO UTC
  expectedSignOutTime: string | null;  // "HH:MM" UK local
  companyId: string;
}

// Read cached shift from local storage. Returns null if none.
export async function getActiveShift(): Promise<ActiveShift | null> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ActiveShift;
  } catch (e) {
    console.error('[activeShift] read failed', e);
    return null;
  }
}

// Save shift to local storage
export async function setActiveShift(shift: ActiveShift | null): Promise<void> {
  try {
    if (shift === null) {
      await SecureStore.deleteItemAsync(STORAGE_KEY);
      console.log('[activeShift] cleared');
    } else {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(shift));
      console.log('[activeShift] saved, job:', shift.jobName, 'signout:', shift.expectedSignOutTime);
    }
  } catch (e) {
    console.error('[activeShift] write failed', e);
  }
}

// Clear local shift
export async function clearActiveShift(): Promise<void> {
  await setActiveShift(null);
}

// Hydrate from server - fetches current open signin from /api/installer/active-shift
// and caches locally. Returns the shift or null.
export async function hydrateActiveShift(): Promise<ActiveShift | null> {
  try {
    const res = await authFetch('/api/installer/active-shift', { method: 'GET' });
    if (!res.ok) {
      console.log('[activeShift] hydrate http error', res.status);
      return await getActiveShift(); // fall back to cached
    }
    const data = await res.json();
    const shift = data.activeShift as ActiveShift | null;
    await setActiveShift(shift);
    return shift;
  } catch (e) {
    console.error('[activeShift] hydrate failed', e);
    return await getActiveShift(); // fall back to cached
  }
}

// Tracking window calculation - used by locationTracker
// Returns whether we should currently be tracking based on shift's expected sign-out time
export interface TrackingWindow {
  shouldTrack: boolean;
  signOutDate: Date | null;
  windowStartDate: Date | null;
  reason: string;
  shift: ActiveShift | null;
}

const WINDOW_HOURS_BEFORE = 3;

export async function getTrackingWindow(): Promise<TrackingWindow> {
  const shift = await getActiveShift();

  if (!shift) {
    return { shouldTrack: false, signOutDate: null, windowStartDate: null, reason: 'not_signed_in', shift: null };
  }

  if (!shift.expectedSignOutTime) {
    return { shouldTrack: false, signOutDate: null, windowStartDate: null, reason: 'no_signout_time', shift };
  }

  const [h, m] = shift.expectedSignOutTime.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) {
    return { shouldTrack: false, signOutDate: null, windowStartDate: null, reason: 'invalid_signout_time', shift };
  }

  const now = new Date();

  // Interpret expectedSignOutTime in device local time, on the same calendar date as signedInAt
  // This handles shifts that start late and end past midnight, or legitimate overnight shifts
  const signedInAt = new Date(shift.signedInAt);
  const signOutDate = new Date(signedInAt);
  signOutDate.setHours(h, m, 0, 0);

  // If computed sign-out is before sign-in (shift spans midnight), add a day
  if (signOutDate <= signedInAt) {
    signOutDate.setDate(signOutDate.getDate() + 1);
  }

  // If sign-out is way past (more than 2h ago), treat as orphan - hydrate from server should pick it up
  const msPastSignOut = now.getTime() - signOutDate.getTime();
  if (msPastSignOut > 2 * 3600000) {
    return { shouldTrack: false, signOutDate, windowStartDate: null, reason: 'signout_passed', shift };
  }

  const windowStartDate = new Date(signOutDate.getTime() - WINDOW_HOURS_BEFORE * 3600000);
  const shouldTrack = now >= windowStartDate && now <= signOutDate;

  const reason = shouldTrack
    ? 'in_window'
    : now < windowStartDate
      ? 'before_window'
      : 'after_window';

  return { shouldTrack, signOutDate, windowStartDate, reason, shift };
}