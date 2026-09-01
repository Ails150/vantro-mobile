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
