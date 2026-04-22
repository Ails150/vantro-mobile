import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { getToken } from './api';

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

// Define the background task
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }: any) => {
  if (error) { console.error('Background location error:', error); return; }
  if (!data) return;
  const { locations } = data;
  if (!locations || locations.length === 0) return;
  const loc = locations[locations.length - 1];
  await postLocation(loc.coords.latitude, loc.coords.longitude, loc.coords.accuracy || 0, 'background');
});

export async function startBackgroundTracking(enabled: boolean = true) {
  if (!enabled) {
    await stopBackgroundTracking();
    return false;
  }

  const { status: fg } = await Location.requestForegroundPermissionsAsync();
  if (fg !== 'granted') return false;

  const { status: bg } = await Location.requestBackgroundPermissionsAsync();
  if (bg !== 'granted') return false;

  const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
  if (isTracking) return true;

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 1800000,
    distanceInterval: 500,
    deferredUpdatesInterval: 1800000,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Vantro',
      notificationBody: 'You are signed in - tap to open Vantro',
      notificationColor: '#00d4a0',
    },
  });

  return true;
}

export async function stopBackgroundTracking() {
  const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
  if (isTracking) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}

export async function isTrackingActive() {
  return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
}

// Manual foreground breadcrumb - call this when the app opens or jobs screen refreshes
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