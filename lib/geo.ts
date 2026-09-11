// Geofence maths shared by the Jobs list and the job hub. The server is the
// authority (see /api/signin), this is the client side mirror used to decide
// what to offer the installer before they press anything.

export const DEFAULT_GEOFENCE_M = 150;

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function geofenceRadius(job: { geofence_radius_metres?: number | null } | null | undefined): number {
  return job?.geofence_radius_metres ?? DEFAULT_GEOFENCE_M;
}

// Metres between the device and the job, or null when either side has no fix.
export function distanceToJob(
  coords: { latitude: number; longitude: number } | null,
  job: { lat?: number | null; lng?: number | null } | null | undefined,
): number | null {
  if (!coords || job?.lat == null || job?.lng == null) return null;
  return haversine(coords.latitude, coords.longitude, job.lat, job.lng);
}

/**
 * Metres from the device to the site BOUNDARY, not to the pin.
 *
 * This is the number a worker can act on. "You are 180 m from the site" while
 * standing inside a 200 m fence reads as a refusal that has not happened;
 * "30 m outside the boundary" tells them how far to walk. Zero means inside.
 */
export function distanceToEdge(
  coords: { latitude: number; longitude: number } | null,
  job: { lat?: number | null; lng?: number | null; geofence_radius_metres?: number | null } | null | undefined,
): number | null {
  const distance = distanceToJob(coords, job);
  if (distance == null) return null;
  return Math.max(0, distance - geofenceRadius(job));
}

/**
 * The accuracy past which a fix is not worth acting on.
 *
 * 50 m because the smallest fence we default to is 150 m: a fix worse than
 * this can put someone standing in the site office outside the boundary, or
 * someone in the car park inside it. Both are wrong, and the first one is the
 * kind of wrong that gets a worker shouted at for not signing in.
 */
export const ACCURACY_LIMIT_M = 50;

export function isAccurateEnough(accuracyMetres: number | null | undefined): boolean {
  // An unknown accuracy is not treated as bad: some devices report null and
  // refusing them would lock those workers out entirely. The server re-checks
  // the distance either way.
  if (accuracyMetres == null) return true;
  return accuracyMetres <= ACCURACY_LIMIT_M;
}
