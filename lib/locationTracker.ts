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
      console.error('[location] post failed', source, res.status, text);
    } else {
      console.log('[location] post success', source);
    }
  } catch (e) {
    console.error('[location] network error', source, e);
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
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 1800000,       // 30 min
    distanceInterval: 500,
    deferredUpdatesInterval: 1800000,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Vantro',
      notificationBody: 'Tracking active - final hours of shift',
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

// Manual foreground breadcrumb - fires regardless of window (useful for sign-in verification)
export async function logCurrentLocation(source: string = 'foreground') {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.log('[location] no foreground permission for manual log');
      return;
    }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    await postLocation(loc.coords.latitude, loc.coords.longitude, loc.coords.accuracy || 0, source);
  } catch (e) {
    console.error('[location] manual log failed', e);
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