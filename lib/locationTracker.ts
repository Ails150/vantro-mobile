import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { getToken } from './api';
import { getTrackingWindow } from './activeShift';

const API_BASE = 'https://app.getvantro.com';
const LOCATION_TASK = 'vantro-background-location';

async function postLocation(lat: number, lng: number, accuracy: number, source: string) {
  const token = await getToken();
  if (!token) {
    console.log('[location] no token, skipping post');
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/api/location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ lat, lng, accuracy: Math.round(accuracy || 0) }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.log('[location] post failed (will retry)', source, res.status);
    } else {
      console.log('[location] post success', source);
    }
  } catch (e) {
    console.log('[location] offline, breadcrumb not sent (will retry on next interval)', source);
  }
}

// Background location task - re-checks window before every post
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }: any) => {
  if (error) { console.error('Background location error:', error); return; }
  if (!data) return;

  // Check window - if we're past it, stop tracking
  const window = await getTrackingWindow();
  if (!window.shouldTrack) {
    console.log('[location] task fired outside window, stopping:', window.reason);
    await stopBackgroundTracking().catch(() => {});
    return;
  }

  const { locations } = data;
  if (!locations || locations.length === 0) return;
  const loc = locations[locations.length - 1];
  await postLocation(loc.coords.latitude, loc.coords.longitude, loc.coords.accuracy || 0, 'background');
});

export async function startBackgroundTracking() {
  // Check window before even starting
  const window = await getTrackingWindow();
  if (!window.shouldTrack) {
    console.log('[location] not starting - outside window:', window.reason);
    return false;
  }

  const { status: fg } = await Location.requestForegroundPermissionsAsync();
  if (fg !== 'granted') {
    console.log('[location] foreground permission denied');
    return false;
  }

  const { status: bg } = await Location.requestBackgroundPermissionsAsync();
  if (bg !== 'granted') {
    console.log('[location] background permission denied');
    return false;
  }

  const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
  if (isTracking) {
    console.log('[location] already tracking');
    return true;
  }

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 900000,        // 15 min
    distanceInterval: 0,         // time-only, no movement triggers (prevents duplicate pings)
    deferredUpdatesInterval: 900000,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Vantro',
      notificationBody: 'Shift in progress',
      notificationColor: '#00d4a0',
    },
  });

  console.log('[location] tracking started, window ends:', window.signOutDate?.toISOString());
  return true;
}

export async function stopBackgroundTracking() {
  const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
  if (isTracking) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    console.log('[location] tracking stopped');
  }
}

export async function isTrackingActive() {
  return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
}

// In-memory throttle: skip foreground heartbeats fired within the last
// THROTTLE_MS unless explicitly forced. Sign-in, sign-out, and explicit
// server-driven pings should pass force=true so they always log.
let lastForegroundLogAt = 0;
const THROTTLE_MS = 5 * 60 * 1000;

// Manual foreground breadcrumb - fires regardless of tracking window.
// Throttled to one log per 5 minutes by default; pass force=true for
// situations where a fresh log is required (sign-in, sign-out, ping).
export async function logCurrentLocation(source: string = 'foreground', force: boolean = false) {
  try {
    if (!force) {
      const since = Date.now() - lastForegroundLogAt;
      if (since < THROTTLE_MS) {
        console.log('[location] manual log throttled', source, 'since=' + Math.round(since / 1000) + 's');
        return;
      }
    }
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.log('[location] no foreground permission for manual log');
      return;
    }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    await postLocation(loc.coords.latitude, loc.coords.longitude, loc.coords.accuracy || 0, source);
    lastForegroundLogAt = Date.now();
  } catch (e) {
    console.log('[location] manual log failed (offline?)', e);
  }
}

// Main decision loop - evaluates current state and starts/stops tracking as needed
// Called by: scheduler (background fetch), app launch, sign-in, sign-out, screen focus
export async function evaluateTrackingState() {
  const window = await getTrackingWindow();
  const isTracking = await isTrackingActive();

  if (window.shouldTrack && !isTracking) {
    console.log('[evaluate] window open, starting tracking (reason:', window.reason, ')');
    await startBackgroundTracking();
  } else if (!window.shouldTrack && isTracking) {
    console.log('[evaluate] window closed, stopping tracking (reason:', window.reason, ')');
    await stopBackgroundTracking();
  } else {
    console.log('[evaluate] no action - shouldTrack:', window.shouldTrack, 'isTracking:', isTracking, 'reason:', window.reason);
  }
}