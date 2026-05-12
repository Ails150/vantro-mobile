import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getToken } from './api';
import { getActiveShift, getTrackingWindow } from './activeShift';

const API_BASE = 'https://app.getvantro.com';
const GEOFENCE_TASK = 'vantro-site-geofence';
const GEOFENCE_RADIUS_M = 150;

async function reportPermissionLevel(level: 'always' | 'whenInUse' | 'denied') {
  try { await AsyncStorage.setItem('gps_permission_level', level); } catch {}
  const token = await getToken();
  if (!token) return;
  fetch(`${API_BASE}/api/installer/gps-permission`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ level }),
  }).catch((e) => console.warn('[location] permission report failed:', e));
}

async function postLocation(lat: number, lng: number, accuracy: number, source: string) {
  const token = await getToken();
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/api/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ lat, lng, accuracy: Math.round(accuracy || 0), source }),
    });
    console.log('[location] post', source, res.status);
  } catch (e) {
    console.log('[location] offline', source);
  }
}

async function postGeofenceExit(jobId: string, lat: number, lng: number) {
  const token = await getToken();
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/api/installer/geofence-exit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ jobId, lat, lng, exitedAt: new Date().toISOString() }),
    });
    console.log('[geofence] exit posted', res.status);
  } catch (e) {
    console.log('[geofence] exit post failed, queued for retry', e);
  }
}

TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }: any) => {
  if (error) { console.error('[geofence] task error:', error); return; }
  if (!data) return;

  const { eventType, region } = data;
  console.log('[geofence] event', eventType, region?.identifier);

  const shift = await getActiveShift();
  if (!shift) {
    console.log('[geofence] no active shift, ignoring');
    return;
  }

  let lat = region?.latitude ?? shift.jobLat ?? 0;
  let lng = region?.longitude ?? shift.jobLng ?? 0;
  try {
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    lat = loc.coords.latitude;
    lng = loc.coords.longitude;
  } catch {}

  if (eventType === Location.GeofencingEventType.Enter) {
    await postLocation(lat, lng, 0, 'geofence-enter');
  } else if (eventType === Location.GeofencingEventType.Exit) {
    await postLocation(lat, lng, 0, 'geofence-exit');
    await postGeofenceExit(shift.jobId, lat, lng);
  }
});

export async function startSiteGeofence() {
  const window = await getTrackingWindow();
  if (!window.shouldTrack) {
    console.log('[geofence] not starting - outside window:', window.reason);
    return false;
  }

  const shift = window.shift;
  if (!shift || shift.jobLat == null || shift.jobLng == null) {
    console.log('[geofence] no shift coords');
    return false;
  }

  const { status: fg } = await Location.requestForegroundPermissionsAsync();
  if (fg !== 'granted') {
    await reportPermissionLevel('denied');
    return false;
  }

  const { status: bg } = await Location.requestBackgroundPermissionsAsync();
  if (bg !== 'granted') {
    console.log('[geofence] bg perm denied - foreground only');
    await reportPermissionLevel('whenInUse');
  } else {
    await reportPermissionLevel('always');
  }

  await stopSiteGeofence().catch(() => {});

  await Location.startGeofencingAsync(GEOFENCE_TASK, [{
    identifier: `site-${shift.jobId}`,
    latitude: shift.jobLat,
    longitude: shift.jobLng,
    radius: GEOFENCE_RADIUS_M,
    notifyOnEnter: true,
    notifyOnExit: true,
  }]);

  console.log('[geofence] started', shift.jobName, shift.jobLat, shift.jobLng);
  return true;
}

export async function stopSiteGeofence() {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK).catch(() => false);
  if (isRegistered) {
    await Location.stopGeofencingAsync(GEOFENCE_TASK);
    console.log('[geofence] stopped');
  }
}

export async function isGeofenceActive() {
  return TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK).catch(() => false);
}

let lastForegroundLogAt = 0;
const THROTTLE_MS = 5 * 60 * 1000;

export async function logCurrentLocation(source: string = 'foreground', force: boolean = false) {
  try {
    if (!force) {
      const since = Date.now() - lastForegroundLogAt;
      if (since < THROTTLE_MS) return;
    }
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    await postLocation(loc.coords.latitude, loc.coords.longitude, loc.coords.accuracy || 0, source);
    lastForegroundLogAt = Date.now();
  } catch (e) {
    console.log('[location] manual log failed', e);
  }
}

// Backward-compat exports
export const startBackgroundTracking = startSiteGeofence;
export const stopBackgroundTracking = stopSiteGeofence;
export const isTrackingActive = isGeofenceActive;

export async function evaluateTrackingState() {
  const window = await getTrackingWindow();
  const isActive = await isGeofenceActive();

  if (window.shouldTrack && !isActive) {
    console.log('[evaluate] window open, starting geofence');
    await startSiteGeofence();
  } else if (!window.shouldTrack && isActive) {
    console.log('[evaluate] window closed, stopping');
    await stopSiteGeofence();
  } else {
    await logCurrentLocation('evaluate-tick', false);
  }
}
