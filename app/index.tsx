import { Redirect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { View, ActivityIndicator } from 'react-native';

export default function Index() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0f1923', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#00d4a0" />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;
  if (user.role === 'admin' || user.role === 'foreman') return <Redirect href="/(admin)/dashboard" />;
  return <Redirect href="/(installer)/jobs" />;
}
