import { useEffect } from 'react';
import { Tabs, Redirect, type ErrorBoundaryProps } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { startUploader, stopUploader } from '@/lib/walktalk-uploader';
import { colors, radius, space, type } from '@/theme';

// Expo Router automatically renders this for any uncaught render error thrown by
// a screen in the (installer) group, instead of a blank/dead screen. Without it,
// a throw only reaches Sentry (which reports but does not recover).
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={ebStyles.container}>
      <Text style={ebStyles.title}>Something went wrong</Text>
      <Text style={ebStyles.message} numberOfLines={4}>
        {error?.message || 'An unexpected error occurred.'}
      </Text>
      <TouchableOpacity style={ebStyles.button} onPress={() => retry()}>
        <Text style={ebStyles.buttonText}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

const ebStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.base, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { ...type.heading, marginBottom: space.sm },
  message: { ...type.sub, color: colors.textMuted, textAlign: 'center', marginBottom: space.xl },
  button: { backgroundColor: colors.teal, paddingVertical: space.md, paddingHorizontal: 28, borderRadius: radius.md },
  buttonText: { color: colors.base, fontSize: 15, fontWeight: '600' },
});

export default function InstallerLayout() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (user) {
      startUploader();
      return () => stopUploader();
    }
  }, [user]);

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: colors.base, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.teal} />
    </View>
  );

  if (!user) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.base },
        tabBarStyle: { backgroundColor: colors.base, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tabs.Screen name="jobs" options={{ title: 'Jobs',
        tabBarIcon: ({ color, size }) => <Ionicons name="briefcase-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="schedule" options={{ title: 'Schedule',
        tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="expenses" options={{ title: 'Expenses',
        tabBarIcon: ({ color, size }) => <Ionicons name="receipt-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="my-hours" options={{ title: 'Hours',
        tabBarIcon: ({ color, size }) => <Ionicons name="time-outline" size={size} color={color} /> }} />

      {/* Reachable from the Jobs list and the job hub, never from the tab bar. */}
      <Tabs.Screen name="job/[id]" options={{ href: null }} />
      <Tabs.Screen name="diary" options={{ href: null }} />
      <Tabs.Screen name="qa" options={{ href: null }} />
      <Tabs.Screen name="defects" options={{ href: null }} />
      <Tabs.Screen name="capture" options={{ href: null }} />
      <Tabs.Screen name="checklist-library" options={{ href: null }} />
      <Tabs.Screen name="checklist-run" options={{ href: null }} />
      <Tabs.Screen name="gps-acknowledgment" options={{ href: null }} />
      <Tabs.Screen name="schedule-request" options={{ href: null }} />
      <Tabs.Screen name="scan" options={{ href: null }} />
      <Tabs.Screen name="my-qr" options={{ href: null }} />
    </Tabs>
  );
}
