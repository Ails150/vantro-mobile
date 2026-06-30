import { useEffect } from 'react';
import { Stack, Redirect, type ErrorBoundaryProps } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { startUploader, stopUploader } from '@/lib/walktalk-uploader';

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
  container: { flex: 1, backgroundColor: '#0f1923', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#ffffff', fontSize: 18, fontWeight: '600', marginBottom: 8 },
  message: { color: '#4d6478', fontSize: 14, textAlign: 'center', marginBottom: 20 },
  button: { backgroundColor: '#00d4a0', paddingVertical: 12, paddingHorizontal: 28, borderRadius: 12 },
  buttonText: { color: '#0f1923', fontSize: 15, fontWeight: '600' },
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
    <View style={{ flex: 1, backgroundColor: '#0f1923', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="#00d4a0" />
    </View>
  );

  if (!user) return <Redirect href="/login" />;

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0f1923' } }} />;
}
