import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { getToken } from './api';
const API_BASE = 'https://app.getvantro.com';

const LOCATION_TASK = 'vantro-background-location';

// Define the background task
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }: any) => {
  if (error) { console.error('Background location error:', error); return; }
  if (!data) return;

  const { locations } = data;
  const token = await getToken();
  if (!token || !locations || locations.length === 0) return;

  const loc = locations[locations.length - 1]; // most recent
  try {
    await fetch(`${API_BASE}/api/location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        accuracy: Math.round(loc.coords.accuracy || 0),
      }),
    });
  } catch (e) {
    console.error('Failed to log location:', e);
  }
});

export async function startBackgroundTracking() {
  const { status: fg } = await Location.requestForegroundPermissionsAsync();
  if (fg !== 'granted') return false;

  const { status: bg } = await Location.requestBackgroundPermissionsAsync();
  if (bg !== 'granted') return false;

  const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
  if (isTracking) return true;

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 1800000,      // every 30 minutes
    distanceInterval: 500,      // or every 500 metres
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


