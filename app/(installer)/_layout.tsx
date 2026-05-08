import { useEffect } from 'react';
import { Stack, Redirect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { View, ActivityIndicator } from 'react-native';
import { startUploader, stopUploader } from '@/lib/walktalk-uploader';

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
