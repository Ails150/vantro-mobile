import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, Vibration, ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { alpha, colors } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '@/context/LanguageContext';
import { LANGUAGES } from '@/lib/i18n';

const COLORS = { bg: colors.base, card: colors.surface1, teal: colors.teal, muted: colors.textMuted, text: colors.textPrimary, error: colors.red };

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
  const { language, t } = useLanguage();
  const currentLanguage = LANGUAGES.find(l => l.code === language);

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
  /**
   * Take the email and go straight to choosing a PIN. NO SERVER CALL.
   *
   * This screen used to ask the server "does this address have an account, and
   * does it already have a PIN", then branch on the answer. Good experience,
   * bad idea: the same question, asked by anybody, told them whether a given
   * person works for a Vantro customer. One address at a time, a competitor
   * could confirm a whole crew.
   *
   * Everything else about signing in is built not to answer that -- one error
   * message however it fails, and a deliberate hash comparison on the
   * unknown-address path so that even the response time gives nothing away.
   * This screen was undoing all of it in order to pick the right heading.
   *
   * So it picks neither. It goes to "choose your PIN", and the set-PIN call is
   * what finds out: that route now refuses with ONE message whether the address
   * is unknown or already has a PIN, and the message names both of the things
   * the person can do next.
   *
   * The cost is that somebody who already has a PIN and taps "New installer"
   * learns it after typing four digits rather than before. That is the whole
   * price, and it buys not publishing the customer's staff list.
   */
  async function handleEmailSubmit() {
    const email = emailInput.trim().toLowerCase();
    if (!email || !email.includes('@')) { setError('Enter a valid email address'); return }
    setError('');
    setSetupEmail(email);
    setMode('setup');
    setShowEmailEntry(false);
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
          router.replace('/(installer)/home');
        } catch (e: any) {
          shake(); setError(e.message); setPin('');
        }
      } else {
        const result = await login(newPin);
        if (result.needsEmail) { setPin(''); setError(result.error || ''); setShowEmailEntry(true); }
        else if (result.error) { shake(); setError(result.error); setPin(''); }
        else {
          const ack = await AsyncStorage.getItem('gps_acknowledged');
          if (ack === 'true') { router.replace('/(installer)/home'); }
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
            {loading ? <ActivityIndicator color={colors.base}/> : <Text style={s.emailBtnText}>Continue →</Text>}
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
      {/* The only route back to the picker once the first run choice is made. */}
      <TouchableOpacity
        onPress={() => router.push('/language?change=1')}
        accessibilityRole="button"
        accessibilityLabel={t('language.name')}
        hitSlop={12}
        style={s.langBtn}
      >
        <Ionicons name="language-outline" size={16} color={COLORS.muted} />
        <Text style={s.langTxt}>{currentLanguage?.label ?? t('language.name')}</Text>
      </TouchableOpacity>
      <View style={s.container}>
        <View style={s.logo}>
          <View style={s.logoIcon}>
            <Text style={s.logoV}>V</Text>
          </View>
          <Text style={s.logoText}>Van<Text style={{ color: COLORS.teal }}>tro</Text></Text>
          <Text style={s.logoSub}>Field Operations</Text>
        </View>
        <Text style={s.heading}>{mode === 'setup' ? 'Choose your PIN' : t('login.enterPin')}</Text>
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
        {mode === 'setup' && (
          // Both routes out of this screen, and they are not optional now.
          //
          // Setting a PIN no longer checks the address first, so this screen is
          // where somebody who already HAS a PIN ends up if they tap "new
          // installer". The server tells them to use Forgot PIN -- which was
          // rendered only in login mode, so the advice pointed at a link that
          // was not on the screen. A dead end at the sign-in screen is how an
          // app gets uninstalled.
          <>
          <TouchableOpacity onPress={() => { setForgotPinEmail(setupEmail); setForgotPinSent(false); setForgotPinModal(true); }}>
            <Text style={s.hint}>Already have a PIN? Reset it via email</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setMode('login'); setPin(''); setError(''); }} style={{ marginTop: 8 }}>
            <Text style={s.hint}>← Back to PIN login</Text>
          </TouchableOpacity>
          </>
        )}
      </View>
      <Modal visible={forgotPinModal} transparent animationType='fade' onRequestClose={() => setForgotPinModal(false)}>
        <View style={{ flex: 1, backgroundColor: alpha(colors.black, 0.7), justifyContent: 'center', padding: 24 }}>
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
                    <Text style={{ color: colors.base, fontWeight: '700' }}>{forgotPinSending ? 'Sending...' : 'Send'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={{ color: COLORS.teal, fontSize: 40, textAlign: 'center', marginBottom: 12 }}>✓</Text>
                <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>Check your email</Text>
                <Text style={{ color: COLORS.muted, fontSize: 14, textAlign: 'center', marginBottom: 20 }}>If your email is registered, a reset link has been sent.</Text>
                <TouchableOpacity onPress={() => setForgotPinModal(false)} style={{ padding: 14, borderRadius: 12, backgroundColor: COLORS.teal, alignItems: 'center' }}>
                  <Text style={{ color: colors.base, fontWeight: '700' }}>Done</Text>
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
  langBtn: {
    position: 'absolute', top: 8, right: 16, zIndex: 2,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 12,
  },
  langTxt: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  logo: { alignItems: 'center', marginBottom: 40 },
  logoIcon: { width: 48, height: 48, backgroundColor: COLORS.teal, borderRadius: 12, flexDirection: 'row', flexWrap: 'wrap', padding: 10, gap: 4, marginBottom: 10 },
  dot1: { width: 10, height: 10, backgroundColor: colors.base, borderRadius: 2, opacity: 1 },
  dot2: { width: 10, height: 10, backgroundColor: colors.base, borderRadius: 2, opacity: 0.7 },
  dot3: { width: 10, height: 10, backgroundColor: colors.base, borderRadius: 2, opacity: 0.7 },
  dot4: { width: 10, height: 10, backgroundColor: colors.base, borderRadius: 2, opacity: 0.4 },
  logoV: { color: colors.base, fontWeight: '800', fontSize: 22 },
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
  emailInput: { width: '100%', maxWidth: 320, backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, color: COLORS.text, fontSize: 16, borderWidth: 1, borderColor: alpha(colors.textPrimary, 0.08), marginBottom: 12 },
  emailBtn: { width: '100%', maxWidth: 320, backgroundColor: COLORS.teal, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  emailBtnText: { color: colors.base, fontWeight: '700', fontSize: 15 },
});

