import { Stack, Redirect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export default function InstallerLayout() {
  const { user, loading } = useAuth();
  const [ackChecked, setAckChecked] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('gps_acknowledged').then(val => {
      setAcknowledged(val === 'true');
      setAckChecked(true);
    });
  }, []);

  if (loading || !ackChecked) return (
    <View style={{ flex: 1, backgroundColor: '#0f1923', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="#00d4a0" />
    </View>
  );

  if (!user) return <Redirect href="/login" />;
  if (!acknowledged) return <Redirect href="/(installer)/gps-acknowledgment" />;

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0f1923' } }} />;
}