Set-Location C:\vantro-mobile

New-Item -ItemType Directory -Force -Path app | Out-Null
New-Item -ItemType Directory -Force -Path "app/(installer)" | Out-Null
New-Item -ItemType Directory -Force -Path "app/(admin)" | Out-Null

# ─── app/_layout.tsx ─────────────────────────────────────────
@'
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/context/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
}
'@ | Set-Content "app/_layout.tsx" -Encoding UTF8

# ─── app/index.tsx (redirect) ────────────────────────────────
@'
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
'@ | Set-Content "app/index.tsx" -Encoding UTF8

# ─── app/login.tsx ───────────────────────────────────────────
@'
import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Vibration, ActivityIndicator, SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

const COLORS = {
  bg: '#0f1923',
  card: '#1a2635',
  teal: '#00d4a0',
  muted: '#4d6478',
  text: '#ffffff',
  error: '#f87171',
};

export default function LoginScreen() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const { login } = useAuth();
  const router = useRouter();

  function shake() {
    Vibration.vibrate(200);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }

  async function handleKey(key: string) {
    if (loading) return;
    if (key === 'del') {
      setPin(p => p.slice(0, -1));
      setError('');
      return;
    }
    const newPin = pin + key;
    setPin(newPin);
    setError('');
    if (newPin.length === 4) {
      setLoading(true);
      const result = await login(newPin);
      setLoading(false);
      if (result.error) {
        shake();
        setError(result.error);
        setPin('');
      } else {
        router.replace('/');
      }
    }
  }

  const keys = [
    ['1','2','3'],
    ['4','5','6'],
    ['7','8','9'],
    ['','0','del'],
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.logo}>
          <View style={styles.logoIcon}>
            <View style={styles.dot1} /><View style={styles.dot2} />
            <View style={styles.dot3} /><View style={styles.dot4} />
          </View>
          <Text style={styles.logoText}>Van<Text style={{ color: COLORS.teal }}>tro</Text></Text>
          <Text style={styles.logoSub}>Field Operations</Text>
        </View>

        <Text style={styles.heading}>Enter your PIN</Text>

        <Animated.View style={[styles.dots, { transform: [{ translateX: shakeAnim }] }]}>
          {[0,1,2,3].map(i => (
            <View key={i} style={[styles.dot, pin.length > i && styles.dotFilled]} />
          ))}
        </Animated.View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading ? <ActivityIndicator color={COLORS.teal} style={{ marginBottom: 16 }} /> : null}

        <View style={styles.keypad}>
          {keys.map((row, ri) => (
            <View key={ri} style={styles.row}>
              {row.map((key, ki) => (
                <TouchableOpacity
                  key={ki}
                  style={[styles.key, key === '' && styles.keyEmpty]}
                  onPress={() => key && handleKey(key)}
                  disabled={!key || loading}
                  activeOpacity={0.6}
                >
                  {key === 'del' ? (
                    <Text style={styles.keyDel}>⌫</Text>
                  ) : (
                    <Text style={styles.keyText}>{key}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>

        <Text style={styles.hint}>PIN set by your manager when your account was created</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  logo: { alignItems: 'center', marginBottom: 48 },
  logoIcon: { width: 48, height: 48, backgroundColor: COLORS.teal, borderRadius: 12, flexDirection: 'row', flexWrap: 'wrap', padding: 10, gap: 4, marginBottom: 10 },
  dot1: { width: 10, height: 10, backgroundColor: COLORS.bg, borderRadius: 2, opacity: 1 },
  dot2: { width: 10, height: 10, backgroundColor: COLORS.bg, borderRadius: 2, opacity: 0.7 },
  dot3: { width: 10, height: 10, backgroundColor: COLORS.bg, borderRadius: 2, opacity: 0.7 },
  dot4: { width: 10, height: 10, backgroundColor: COLORS.bg, borderRadius: 2, opacity: 0.4 },
  logoText: { fontSize: 24, fontWeight: '700', color: COLORS.text },
  logoSub: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  heading: { fontSize: 18, color: COLORS.text, fontWeight: '600', marginBottom: 28 },
  dots: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: COLORS.muted },
  dotFilled: { backgroundColor: COLORS.teal, borderColor: COLORS.teal },
  error: { color: COLORS.error, fontSize: 13, marginBottom: 12, textAlign: 'center' },
  keypad: { width: '100%', maxWidth: 280, marginTop: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  key: { width: 76, height: 76, borderRadius: 38, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center' },
  keyEmpty: { backgroundColor: 'transparent' },
  keyText: { fontSize: 26, fontWeight: '300', color: COLORS.text },
  keyDel: { fontSize: 20, color: COLORS.muted },
  hint: { fontSize: 12, color: COLORS.muted, textAlign: 'center', marginTop: 32, maxWidth: 240 },
});
'@ | Set-Content "app/login.tsx" -Encoding UTF8

Write-Host "Part 3 done - root layout and login screen created" -ForegroundColor Green
