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

// `accuracy` is null when we could not read one. It is NOT 0.
//
// The server's auto sign-out rule requires every fix in a run to be outside the
// geofence with a KNOWN accuracy better than 100m, and treats an unknown
// accuracy as unusable. Sending 0 for "did not measure" makes the least
// trustworthy fix in the trail look like the most trustworthy one -- and this
// is the fix that decides whether someone's shift gets closed on them.
async function postLocation(lat: number, lng: number, accuracy: number | null, source: string) {
  const token = await getToken();
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/api/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        lat,
        lng,
        accuracy: accuracy == null ? null : Math.round(accuracy),
        source,
      }),
    });
    console.log('[location] post', source, res.status, 'acc', accuracy ?? 'unknown');
  } catch (e) {
    console.log('[location] offline', source);
  }
}

async function postGeofenceExit(
  jobId: string,
  lat: number,
  lng: number,
  accuracy: number | null,
) {
  const token = await getToken();
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/api/installer/geofence-exit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        jobId,
        lat,
        lng,
        accuracy,
        exitedAt: new Date().toISOString(),
      }),
    });
    console.log('[geofence] exit posted', res.status, 'acc', accuracy ?? 'unknown');
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
  // Stays null if the read below fails: the fallback coordinates are the
  // region centre, which is the site itself, and we know nothing about how
  // accurate the phone's own position is.
  let accuracy: number | null = null;
  try {
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    lat = loc.coords.latitude;
    lng = loc.coords.longitude;
    accuracy = typeof loc.coords.accuracy === 'number' ? loc.coords.accuracy : null;
  } catch {}

  if (eventType === Location.GeofencingEventType.Enter) {
    await postLocation(lat, lng, accuracy, 'geofence-enter');
  } else if (eventType === Location.GeofencingEventType.Exit) {
    await postLocation(lat, lng, accuracy, 'geofence-exit');
    await postGeofenceExit(shift.jobId, lat, lng, accuracy);
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

/**
 * The heartbeat, and the floor under every breadcrumb read.
 *
 * One hour. It was five minutes, which meant a signed-in worker's phone took a
 * GPS fix twelve times an hour all day, on top of the geofence. The breadcrumb
 * trail exists to show a site was attended, not to draw a route -- an hourly
 * point does that, and the two readings that actually matter for pay, sign in
 * and sign out, are taken exactly when they happen and are not throttled.
 *
 * Anything that genuinely cannot wait passes force: true -- currently only the
 * sign-in breadcrumb and an admin's GPS ping.
 */
const THROTTLE_MS = 60 * 60 * 1000;

export async function logCurrentLocation(source: string = 'foreground', force: boolean = false) {
  try {
    if (!force) {
      const since = Date.now() - lastForegroundLogAt;
      if (since < THROTTLE_MS) return;
    }
    // When called from background scheduler, foreground permission appears denied even when Always is granted.
    // Check background permission first (covers background ticks), fall back to foreground (covers in-app calls).
    const bgPerm = await Location.getBackgroundPermissionsAsync();
    const fgPerm = await Location.getForegroundPermissionsAsync();
    if (bgPerm.status !== 'granted' && fgPerm.status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    // `|| 0` here conflated "no reading" with "a perfect reading", same as the
    // geofence path did. These ticks are the main evidence the server's dwell
    // rule weighs, so the difference has to survive the wire.
    await postLocation(
      loc.coords.latitude,
      loc.coords.longitude,
      typeof loc.coords.accuracy === 'number' ? loc.coords.accuracy : null,
      source,
    );
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
