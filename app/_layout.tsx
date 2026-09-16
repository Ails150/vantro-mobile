import { useEffect, useRef, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/context/AuthContext';
import { LanguageProvider } from '@/context/LanguageContext';
import { registerTrackingScheduler } from '@/lib/trackingScheduler';
import { hydrateActiveShift } from '@/lib/activeShift';
import { evaluateTrackingState } from '@/lib/locationTracker';
import * as Sentry from '@sentry/react-native';
import { initSentry } from '@/lib/sentry';
import { startQueueAutoSync } from '@/lib/offline';
import { authFetch } from '@/lib/api';
import { checkDeviceIntegrity, type IntegrityResult } from '@/lib/deviceIntegrity';

initSentry();

export default Sentry.wrap(function RootLayout() {
  const appState = useRef(AppState.currentState);

  // Device integrity. Checked once at startup, before anything else renders.
  //
  // Not anti-tamper -- somebody determined patches this out of the APK in an
  // afternoon. It is for the far more common case: a worker who rooted their
  // own phone years ago for something unrelated and has no idea their
  // employer's site records are now readable by every app they install.
  const [integrity, setIntegrity] = useState<IntegrityResult | null>(null);
  useEffect(() => {
    checkDeviceIntegrity().then(setIntegrity).catch(() => setIntegrity(null));
  }, []);

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

  if (integrity?.blocked) {
    // Deliberately outside the providers: no navigation, no auth, nothing that
    // could read the keystore. The screen is the whole app while it is shown.
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <View style={styles.blockedScreen}>
          <Text style={styles.blockedTitle}>{integrity.title}</Text>
          <Text style={styles.blockedBody}>{integrity.message}</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }} />
        </AuthProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
});

const styles = StyleSheet.create({
  blockedScreen: {
    flex: 1,
    backgroundColor: '#0B0F14',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  blockedTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
  },
  blockedBody: {
    color: '#9BA8B4',
    fontSize: 15,
    lineHeight: 23,
  },
});
