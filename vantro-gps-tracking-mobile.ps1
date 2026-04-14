Write-Host "=== VANTRO MOBILE - GPS BREADCRUMB TRACKING ===" -ForegroundColor Cyan
Write-Host ""

# ─── 1. CREATE BACKGROUND LOCATION TASK ──────────────────────────────
New-Item -ItemType Directory -Force -Path "C:\vantro-mobile\lib" | Out-Null

$locationTracker = @'
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { getToken } from './api';
import { API_BASE } from '@/constants/api';

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
    timeInterval: 3600000,      // every 60 minutes
    distanceInterval: 500,      // or every 500 metres
    deferredUpdatesInterval: 3600000,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Vantro',
      notificationBody: 'Tracking your location while on site',
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
'@
[System.IO.File]::WriteAllText("C:\vantro-mobile\lib\locationTracker.ts", $locationTracker, [System.Text.UTF8Encoding]::new($false))
Write-Host "1/3 Background location tracker created" -ForegroundColor Green

# ─── 2. UPDATE JOBS SCREEN — start/stop tracking on sign-in/out ──────
# Read existing jobs.tsx and patch it
$jobsPath = "C:\vantro-mobile\app\(installer)\jobs.tsx"
$jobs = [System.IO.File]::ReadAllText($jobsPath, [System.Text.UTF8Encoding]::new($false))

# Add import for location tracker
if ($jobs -notmatch "locationTracker") {
  $jobs = $jobs -replace "import \{ authFetch \} from '@/lib/api';", @"
import { authFetch } from '@/lib/api';
import { startBackgroundTracking, stopBackgroundTracking } from '@/lib/locationTracker';
"@

  # Start tracking after successful sign-in
  $jobs = $jobs -replace "setGpsMsg\(\{ id: job\.id, msg: 'Signed in - ' \+ data\.distanceMetres \+ 'm from site', ok: true \}\);", @"
setGpsMsg({ id: job.id, msg: 'Signed in - ' + data.distanceMetres + 'm from site', ok: true });
          // Start GPS breadcrumb tracking
          startBackgroundTracking().catch(e => console.error('Failed to start tracking:', e));
"@

  # Also start tracking for offline sign-in
  $jobs = $jobs -replace "setGpsMsg\(\{ id: job\.id, msg: 'Offline .+ sign-in queued, will sync when online', ok: true \}\);", @"
setGpsMsg({ id: job.id, msg: 'Offline - sign-in queued, will sync when online', ok: true });
        startBackgroundTracking().catch(e => console.error('Failed to start tracking:', e));
"@

  # Update sign-out to send GPS and stop tracking
  $jobs = $jobs -replace "await authFetch\('/api/signout', \{ method: 'POST', body: JSON\.stringify\(\{ jobId: job\.id \}\) \}\);", @"
await authFetch('/api/signout', { method: 'POST', body: JSON.stringify({ jobId: job.id, lat: latitude, lng: longitude, accuracy: Math.round(loc.coords.accuracy || 0) }) });
            // Stop GPS breadcrumb tracking
            stopBackgroundTracking().catch(e => console.error('Failed to stop tracking:', e));
"@

  [System.IO.File]::WriteAllText($jobsPath, $jobs, [System.Text.UTF8Encoding]::new($false))
  Write-Host "2/3 Jobs screen updated (start/stop background tracking)" -ForegroundColor Green
} else {
  Write-Host "2/3 Jobs screen already has locationTracker import - skipping" -ForegroundColor Yellow
}

# ─── 3. UPDATE APP CONFIG — add background location permissions ──────
$appJsonPath = "C:\vantro-mobile\app.json"
$appJson = [System.IO.File]::ReadAllText($appJsonPath, [System.Text.UTF8Encoding]::new($false))
$app = $appJson | ConvertFrom-Json

# Add expo-location background mode plugin if not present
$plugins = $app.expo.plugins
$hasLocationPlugin = $false
for ($i = 0; $i -lt $plugins.Count; $i++) {
  if ($plugins[$i] -is [System.Array] -or ($plugins[$i] -is [System.Object] -and $plugins[$i] -match "expo-location")) {
    $hasLocationPlugin = $true
  }
}

# Add background location permission to iOS
if (-not $app.expo.ios.infoPlist.NSLocationAlwaysAndWhenInUseUsageDescription) {
  $app.expo.ios.infoPlist | Add-Member -NotePropertyName "NSLocationAlwaysAndWhenInUseUsageDescription" -NotePropertyValue "Vantro tracks your location while you are signed in to a job site to verify attendance." -Force
}
if (-not $app.expo.ios.infoPlist.NSLocationAlwaysUsageDescription) {
  $app.expo.ios.infoPlist | Add-Member -NotePropertyName "NSLocationAlwaysUsageDescription" -NotePropertyValue "Vantro needs background location access to track attendance while you are on site." -Force
}

# Add UIBackgroundModes
if (-not $app.expo.ios.infoPlist.UIBackgroundModes) {
  $app.expo.ios.infoPlist | Add-Member -NotePropertyName "UIBackgroundModes" -NotePropertyValue @("location") -Force
}

# Add ACCESS_BACKGROUND_LOCATION to Android
$androidPerms = [System.Collections.ArrayList]@($app.expo.android.permissions)
if ("ACCESS_BACKGROUND_LOCATION" -notin $androidPerms) {
  $androidPerms.Add("ACCESS_BACKGROUND_LOCATION") | Out-Null
  $app.expo.android.permissions = $androidPerms.ToArray()
}

# Update expo-location plugin for background
$newPlugins = @()
foreach ($p in $plugins) {
  if ($p -is [System.Array] -and $p[0] -eq "expo-location") {
    $newPlugins += ,@("expo-location", @{
      "locationAlwaysAndWhenInUsePermission" = "Vantro needs your location to verify you are on site."
      "locationAlwaysPermission" = "Vantro tracks your location while signed in to verify attendance."
      "isAndroidBackgroundLocationEnabled" = $true
      "isAndroidForegroundServiceEnabled" = $true
    })
  } else {
    $newPlugins += ,$p
  }
}
$app.expo.plugins = $newPlugins

# Add expo-task-manager plugin if missing
$hasTaskManager = $false
foreach ($p in $app.expo.plugins) {
  if ($p -eq "expo-task-manager" -or ($p -is [System.Array] -and $p[0] -eq "expo-task-manager")) {
    $hasTaskManager = $true
  }
}
if (-not $hasTaskManager) {
  $app.expo.plugins += "expo-task-manager"
}

$appJsonOut = $app | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($appJsonPath, $appJsonOut, [System.Text.UTF8Encoding]::new($false))
Write-Host "3/3 App config updated (background location permissions)" -ForegroundColor Green

# ─── INSTALL DEPENDENCIES ────────────────────────────────────────────
Write-Host ""
Write-Host "Installing expo-task-manager..." -ForegroundColor Yellow
cd C:\vantro-mobile
npx expo install expo-task-manager

# ─── COMMIT ─────────────────────────────────────────────────────────
git add .
git commit -m "Feature: GPS breadcrumb tracking - background location every 5 mins while signed in"

Write-Host ""
Write-Host "=== MOBILE APP UPDATED ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Yellow
Write-Host "1. Build preview APK to test:  eas build --platform android --profile preview" -ForegroundColor White
Write-Host "2. Test: sign in to a job, walk around, sign out, check Supabase location_logs table" -ForegroundColor White
Write-Host "3. Once confirmed working, build production:  eas build:version:set --platform android  then  eas build --platform android --profile production" -ForegroundColor White
