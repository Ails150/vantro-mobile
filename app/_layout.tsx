import { useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/context/AuthContext';
import { registerTrackingScheduler } from '@/lib/trackingScheduler';
import { hydrateActiveShift } from '@/lib/activeShift';
import { evaluateTrackingState } from '@/lib/locationTracker';
import * as Sentry from '@sentry/react-native';
import { initSentry } from '@/lib/sentry';
import { startQueueAutoSync } from '@/lib/offline';
import { authFetch } from '@/lib/api';

initSentry();

export default Sentry.wrap(function RootLayout() {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    // Register the background fetch scheduler once at app startup
    registerTrackingScheduler().catch(() => {});

    // Drain queued sign ins and sign outs as soon as the connection returns,
    // rather than waiting for someone to open the jobs list.
    const stopAutoSync = startQueueAutoSync(authFetch);

    // Initial hydrate + evaluate
    (async () => {
      try {
        await hydrateActiveShift();
        await evaluateTrackingState();
      } catch {}
    })();

    // Re-evaluate whenever the app comes to foreground
    const sub = AppState.addEventListener('change', async (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        try {
          await hydrateActiveShift();
          await evaluateTrackingState();
        } catch {}
      }
      appState.current = next;
    });
    return () => { sub.remove(); stopAutoSync(); };
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </SafeAreaProvider>
  );
});