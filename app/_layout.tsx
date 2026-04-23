import { useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState } from 'react-native';
import { AuthProvider } from '@/context/AuthContext';
import { registerTrackingScheduler } from '@/lib/trackingScheduler';
import { hydrateActiveShift } from '@/lib/activeShift';
import { evaluateTrackingState } from '@/lib/locationTracker';

export default function RootLayout() {
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
}