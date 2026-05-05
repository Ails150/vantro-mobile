import { useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState } from 'react-native';
import { AuthProvider } from '@/context/AuthContext';
import { registerTrackingScheduler } from '@/lib/trackingScheduler';
import { hydrateActiveShift } from '@/lib/activeShift';
import { evaluateTrackingState } from '@/lib/locationTracker';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://8d46d924fa77ce817367dcd92e4ff885@o4511309963591680.ingest.de.sentry.io/4511336232321104',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

export default Sentry.wrap(function RootLayout() {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    // Register the background fetch scheduler once at app startup
    registerTrackingScheduler().catch(() => {});

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
    return () => sub.remove();
  }, []);

  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
});