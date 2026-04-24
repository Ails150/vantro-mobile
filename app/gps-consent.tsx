import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { authFetch } from '@/lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const C = { bg: '#0f1923', card: '#1a2635', teal: '#00d4a0', muted: '#4d6478', text: '#ffffff', border: 'rgba(255,255,255,0.05)', red: '#f87171' };

export default function GPSAcknowledgmentScreen() {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleAccept() {
    setSubmitting(true);
    // Save locally and navigate FIRST - API call is fire-and-forget
    // so the user is never stuck on this screen even if network fails
    try { await AsyncStorage.setItem('gps_acknowledged', 'true'); } catch (e) { console.warn('AsyncStorage failed:', e); }
    // Fire the server acknowledgment in background - don't block navigation
    authFetch('/api/installer/acknowledge', { method: 'POST', body: JSON.stringify({}) })
      .catch((e) => console.warn('Server acknowledgment failed (non-blocking):', e));
    // Navigate immediately
    router.replace('/(installer)/jobs');
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.iconWrap}>
          <View style={s.icon}>
            <Text style={{ fontSize: 28 }}>GPS</Text>
          </View>
        </View>

        <Text style={s.title}>GPS location tracking</Text>
        <Text style={s.subtitle}>Please read and acknowledge before continuing</Text>

        <View style={s.card}>
          <Text style={s.sectionTitle}>What we track</Text>
          <Text style={s.body}>When you sign in to a job site, Vantro records your GPS location to verify you are on site. Your location is recorded at sign-in and sign-out to verify you were on site. No continuous background tracking occurs.</Text>
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>When we track</Text>
          <Text style={s.body}>Location is checked when you sign in and when you sign out. This is used solely to confirm you are within the job site boundary at those moments.</Text>
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>Why we track</Text>
          <Text style={s.body}>GPS data is used solely for accurate payroll calculation and attendance verification. It ensures you are paid for the hours you work and provides evidence of your on-site presence.</Text>
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>Your rights</Text>
          <Text style={s.body}>You can request a copy of all data held about you at any time through the app. Location data is automatically deleted after your employer's retention period (default 90 days). You have the right to access, correct, or request deletion of your data under UK GDPR.</Text>
        </View>

        <TouchableOpacity style={s.policyLink} onPress={() => Linking.openURL('https://app.getvantro.com/privacy')}>
          <Text style={s.policyLinkText}>Read full privacy policy</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.checkRow} onPress={() => setAccepted(!accepted)}>
          <View style={[s.checkbox, accepted && s.checkboxActive]}>
            {accepted && <Text style={s.checkmark}>Y</Text>}
          </View>
          <Text style={s.checkLabel}>I understand and acknowledge that my GPS location will be tracked during active work sessions for payroll and attendance purposes.</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.acceptBtn, !accepted && s.acceptBtnDisabled]}
          onPress={handleAccept}
          disabled={!accepted || submitting}
        >
          <Text style={s.acceptBtnText}>{submitting ? 'Saving...' : 'Continue to Vantro'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 20, paddingBottom: 40 },
  iconWrap: { alignItems: 'center', marginBottom: 20, marginTop: 10 },
  icon: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,212,160,0.1)', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: C.text, textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 14, color: C.muted, textAlign: 'center', marginBottom: 24 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: C.teal, marginBottom: 8 },
  body: { fontSize: 13, color: C.text, lineHeight: 20, opacity: 0.85 },
  policyLink: { alignItems: 'center', marginVertical: 16 },
  policyLinkText: { fontSize: 14, color: C.teal, textDecorationLine: 'underline' },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 20, paddingHorizontal: 4 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: C.muted, alignItems: 'center', justifyContent: 'center', marginTop: 2, flexShrink: 0 },
  checkboxActive: { borderColor: C.teal, backgroundColor: 'rgba(0,212,160,0.15)' },
  checkmark: { color: C.teal, fontSize: 14, fontWeight: '700' },
  checkLabel: { fontSize: 13, color: C.text, lineHeight: 20, flex: 1, opacity: 0.85 },
  acceptBtn: { backgroundColor: C.teal, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  acceptBtnDisabled: { opacity: 0.4 },
  acceptBtnText: { color: '#0f1923', fontWeight: '700', fontSize: 15 },
});