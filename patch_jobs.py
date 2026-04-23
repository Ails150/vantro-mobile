content = open("app/(installer)/jobs.tsx", encoding="utf-8").read()

# 1. Add logCurrentLocation to the import
old_import = "import { startBackgroundTracking, stopBackgroundTracking } from '@/lib/locationTracker';"
new_import = "import { startBackgroundTracking, stopBackgroundTracking, logCurrentLocation } from '@/lib/locationTracker';"
content = content.replace(old_import, new_import)

# 2. After successful sign-in response, log an immediate breadcrumb (before background task even fires)
old_signin_success = "          startBackgroundTracking(bgGpsEnabled).catch(e => console.error('Failed to start tracking:', e));\n          loadJobs();"
new_signin_success = "          startBackgroundTracking(bgGpsEnabled).catch(e => console.error('Failed to start tracking:', e));\n          logCurrentLocation('signin').catch(() => {});\n          loadJobs();"
content = content.replace(old_signin_success, new_signin_success)

# 3. On every loadJobs call, if the user has any signed-in job, fire a foreground breadcrumb
old_load_end = "    setLoading(false);\n    setRefreshing(false);\n  }, []);"
new_load_end = """    setLoading(false);
    setRefreshing(false);
    // Foreground heartbeat: if signed in, log a breadcrumb so the map has data even if the background task is throttled
    try {
      const currentJobs = await getCachedJobs();
      if (currentJobs?.some((j: any) => j.signed_in)) {
        logCurrentLocation('foreground').catch(() => {});
      }
    } catch {}
  }, []);"""
content = content.replace(old_load_end, new_load_end)

open("app/(installer)/jobs.tsx", "w", encoding="utf-8").write(content)

print("Import updated:", "logCurrentLocation" in content.split("\n")[10])
print("Sign-in breadcrumb added:", "logCurrentLocation('signin')" in content)
print("Foreground heartbeat added:", "logCurrentLocation('foreground')" in content)