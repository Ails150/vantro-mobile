import { Tabs } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { Redirect } from 'expo-router';
import { View, Text, ActivityIndicator } from 'react-native';

const C = { bg: '#0f1923', teal: '#00d4a0', muted: '#4d6478', border: 'rgba(255,255,255,0.07)' };

export default function AdminLayout() {
  const { user, loading } = useAuth();
  if (loading) return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={C.teal} />
    </View>
  );
  if (!user) return <Redirect href="/login" />;
  if (user.role !== 'admin' && user.role !== 'foreman') return <Redirect href="/(installer)/jobs" />;

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: C.bg, borderTopColor: C.border, borderTopWidth: 1 },
      tabBarActiveTintColor: C.teal,
      tabBarInactiveTintColor: C.muted,
      tabBarLabelStyle: { fontSize: 11, marginBottom: 2 },
    }}>
      <Tabs.Screen name="dashboard" options={{ title: 'Overview', tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>â¬›</Text> }} />
      <Tabs.Screen name="map" options={{ title: 'Live Map', tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>ðŸ“</Text> }} />
      <Tabs.Screen name="jobs" options={{ title: 'Jobs', tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>ðŸ—ï¸</Text> }} />
      <Tabs.Screen name="team" options={{ title: 'Team', tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>ðŸ‘·</Text> }} />
      <Tabs.Screen name="alerts" options={{ title: 'Alerts', tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>ðŸ””</Text> }} />
    </Tabs>
  );
}
