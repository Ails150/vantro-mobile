import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, Vibration, ActivityIndicator, SafeAreaView, KeyboardAvoidingView, Platform, Modal, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const COLORS = { bg: '#0f1923', card: '#1a2635', teal: '#00d4a0', muted: '#4d6478', text: '#ffffff', error: '#f87171' };

export default function LoginScreen() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'loading' | 'setup' | 'login'>('loading');
  const [setupEmail, setSetupEmail] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [showEmailEntry, setShowEmailEntry] = useState(false);
  const [forgotPinModal, setForgotPinModal] = useState(false);
  const [forgotPinEmail, setForgotPinEmail] = useState('');
  const [forgotPinSending, setForgotPinSending] = useState(false);
  const [forgotPinSent, setForgotPinSent] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const { login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    async function init() {
      const storedEmail = await SecureStore.getItemAsync('installer_email');
      const storedPin = await SecureStore.getItemAsync('installer_pin');
      if (storedEmail && storedPin) {
        setMode('login');
      } else {
        setMode('login');
      }
    }
    init();
  }, []);

  function shake() {
    Vibration.vibrate(200);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }


  async function submitForgotPin() {
    const email = forgotPinEmail.trim().toLowerCase();
    if (!email) { Alert.alert('Email required', 'Please enter your email address.'); return; }
    setForgotPinSending(true);
    try {
      await fetch('https://app.getvantro.com/api/installer/reset-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      setForgotPinSent(true);
    } catch {
      Alert.alert('Error', 'Could not connect. Please check your internet connection.');
    }
    setForgotPinSending(false);
  }
  async function handleEmailSubmit() {
    if (!emailInput.trim() || !emailInput.includes('@')) { setError('Enter a valid email address'); return }
    setLoading(true); setError('');
    try {
      const res = await fetch('https://app.getvantro.com/api/installer/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput.trim().toLowerCase(), pin: '0000', checkOnly: true })
      });
      const data = await res.json();
      if (data.exists === false) { setError('Email not found. Check with your manager.'); setLoading(false); return }
      if (data.hasPin) { setError('Account already set up. Enter your PIN below.'); setShowEmailEntry(false); setLoading(false); return }
      setSetupEmail(emailInput.trim().toLowerCase());
      setMode('setup');
      setShowEmailEntry(false);
    } catch(e) {
      setError('Could not connect. Check your internet connection.');
    }
    setLoading(false);
  }

  async function handleKey(key: string) {
    if (loading) return;
    if (key === 'del') { setPin(p => p.slice(0, -1)); setError(''); return; }
    const newPin = pin + key;
    setPin(newPin);
    setError('');
    if (newPin.length === 4) {
      setLoading(true);
      if (mode === 'setup') {
        try {
          const res = await fetch('https://app.getvantro.com/api/installer/setup-pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: setupEmail, pin: newPin })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to set PIN');
          await SecureStore.setItemAsync('installer_email', setupEmail);
          await SecureStore.setItemAsync('installer_pin', newPin);
          router.replace('/(installer)/jobs');
        } catch (e: any) {
          shake(); setError(e.message); setPin('');
        }
      } else {
        const result = await login(newPin);
        if (result.error) { shake(); setError(result.error); setPin(''); }
        else {
          const ack = await AsyncStorage.getItem('gps_acknowledged');
          if (ack === 'true') { router.replace('/(installer)/jobs'); }
          else { router.replace('/gps-consent'); }
        }
      }
      setLoading(false);
    }
  }

  const keys = [['1','2','3'],['4','5','6'],['7','8','9'],['','0','del']];

  if (mode === 'loading') {
    return <SafeAreaView style={s.safe}><View style={[s.container]}><ActivityIndicator color={COLORS.teal} size="large"/></View></SafeAreaView>;
  }

  if (showEmailEntry) {
    return (
      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.container}>
          <View style={s.logo}>
            <View style={s.logoIcon}>
              <View style={s.dot1}/><View style={s.dot2}/><View style={s.dot3}/><View style={s.dot4}/>
            </View>
            <Text style={s.logoText}>Van<Text style={{ color: COLORS.teal }}>tro</Text></Text>
          </View>
          <Text style={s.heading}>First time? Enter your email</Text>
          <Text style={[s.hint, { marginBottom: 24 }]}>Use the email your manager invited you with</Text>
          <TextInput
            value={emailInput}
            onChangeText={setEmailInput}
            placeholder="your@email.com"
            placeholderTextColor={COLORS.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoFocus
            style={s.emailInput}
          />
          {error ? <Text style={s.error}>{error}</Text> : null}
          <TouchableOpacity style={s.emailBtn} onPress={handleEmailSubmit} disabled={loading}>
            {loading ? <ActivityIndicator color="#0f1923"/> : <Text style={s.emailBtnText}>Continue →</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setShowEmailEntry(false); setError(''); }}>
            <Text style={[s.hint, { marginTop: 16 }]}>← Back to PIN login</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <View style={s.logo}>
          <View style={s.logoIcon}>
            <Text style={s.logoV}>V</Text>
          </View>
          <Text style={s.logoText}>Van<Text style={{ color: COLORS.teal }}>tro</Text></Text>
          <Text style={s.logoSub}>Field Operations</Text>
        </View>
        <Text style={s.heading}>{mode === 'setup' ? 'Choose your PIN' : 'Enter your PIN'}</Text>
        {mode === 'setup' && <Text style={s.hint}>Setting up for {setupEmail}</Text>}
        <Animated.View style={[s.dots, { transform: [{ translateX: shakeAnim }] }]}>
          {[0,1,2,3].map(i => <View key={i} style={[s.dot, pin.length > i && s.dotFilled]}/>)}
        </Animated.View>
        {error ? <Text style={s.error}>{error}</Text> : null}
        {loading ? <ActivityIndicator color={COLORS.teal} style={{ marginBottom: 16 }}/> : null}
        <View style={s.keypad}>
          {keys.map((row, ri) => (
            <View key={ri} style={s.row}>
              {row.map((key, ki) => (
                <TouchableOpacity key={ki} style={[s.key, key === '' && s.keyEmpty]} onPress={() => key && handleKey(key)} disabled={!key || loading} activeOpacity={0.6}>
                  {key === 'del' ? <Text style={s.keyDel}>⌫</Text> : <Text style={s.keyText}>{key}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
        {mode === 'login' && (
          <>
          <TouchableOpacity onPress={() => { setShowEmailEntry(true); setError(''); setPin(''); }}>
            <Text style={s.hint}>New installer? Tap here to set up</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setForgotPinEmail(''); setForgotPinSent(false); setForgotPinModal(true); }} style={{ marginTop: 8 }}>
            <Text style={s.hint}>Forgot PIN? Reset via email</Text>
          </TouchableOpacity>
          </>
        )}
      </View>
      <Modal visible={forgotPinModal} transparent animationType='fade' onRequestClose={() => setForgotPinModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 24 }}>
            {!forgotPinSent ? (
              <>
                <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Reset PIN</Text>
                <Text style={{ color: COLORS.muted, fontSize: 14, marginBottom: 16 }}>Enter your email to receive a reset link.</Text>
                <TextInput
                  value={forgotPinEmail}
                  onChangeText={setForgotPinEmail}
                  placeholder='you@example.com'
                  placeholderTextColor={COLORS.muted}
                  keyboardType='email-address'
                  autoCapitalize='none'
                  autoCorrect={false}
                  style={{ backgroundColor: COLORS.bg, color: COLORS.text, borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 16 }}
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={() => setForgotPinModal(false)} style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: COLORS.bg, alignItems: 'center' }}>
                    <Text style={{ color: COLORS.text, fontWeight: '600' }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={submitForgotPin} disabled={forgotPinSending} style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: COLORS.teal, alignItems: 'center', opacity: forgotPinSending ? 0.6 : 1 }}>
                    <Text style={{ color: '#0f1923', fontWeight: '700' }}>{forgotPinSending ? 'Sending...' : 'Send'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={{ color: COLORS.teal, fontSize: 40, textAlign: 'center', marginBottom: 12 }}>✓</Text>
                <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>Check your email</Text>
                <Text style={{ color: COLORS.muted, fontSize: 14, textAlign: 'center', marginBottom: 20 }}>If your email is registered, a reset link has been sent.</Text>
                <TouchableOpacity onPress={() => setForgotPinModal(false)} style={{ padding: 14, borderRadius: 12, backgroundColor: COLORS.teal, alignItems: 'center' }}>
                  <Text style={{ color: '#0f1923', fontWeight: '700' }}>Done</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  logo: { alignItems: 'center', marginBottom: 40 },
  logoIcon: { width: 48, height: 48, backgroundColor: COLORS.teal, borderRadius: 12, flexDirection: 'row', flexWrap: 'wrap', padding: 10, gap: 4, marginBottom: 10 },
  dot1: { width: 10, height: 10, backgroundColor: '#0f1923', borderRadius: 2, opacity: 1 },
  dot2: { width: 10, height: 10, backgroundColor: '#0f1923', borderRadius: 2, opacity: 0.7 },
  dot3: { width: 10, height: 10, backgroundColor: '#0f1923', borderRadius: 2, opacity: 0.7 },
  dot4: { width: 10, height: 10, backgroundColor: '#0f1923', borderRadius: 2, opacity: 0.4 },
  logoV: { color: '#07100D', fontWeight: '800', fontSize: 22 },
  logoText: { fontSize: 24, fontWeight: '700', color: COLORS.text },
  logoSub: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  heading: { fontSize: 18, color: COLORS.text, fontWeight: '600', marginBottom: 8 },
  dots: { flexDirection: 'row', gap: 16, marginBottom: 12, marginTop: 12 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: COLORS.muted },
  dotFilled: { backgroundColor: COLORS.teal, borderColor: COLORS.teal },
  error: { color: COLORS.error, fontSize: 13, marginBottom: 12, textAlign: 'center' },
  keypad: { width: '100%', maxWidth: 280, marginTop: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  key: { width: 76, height: 76, borderRadius: 38, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center' },
  keyEmpty: { backgroundColor: 'transparent' },
  keyText: { fontSize: 26, fontWeight: '300', color: COLORS.text },
  keyDel: { fontSize: 20, color: COLORS.muted },
  hint: { fontSize: 12, color: COLORS.muted, textAlign: 'center', marginTop: 8 },
  emailInput: { width: '100%', maxWidth: 320, backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, color: COLORS.text, fontSize: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 12 },
  emailBtn: { width: '100%', maxWidth: 320, backgroundColor: COLORS.teal, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  emailBtnText: { color: '#0f1923', fontWeight: '700', fontSize: 15 },
});

