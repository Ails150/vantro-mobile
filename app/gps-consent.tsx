import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { authFetch } from '@/lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { alpha, colors } from '@/theme';

const C = { bg: colors.base, card: colors.surface1, teal: colors.teal, muted: colors.textMuted, text: colors.textPrimary, border: alpha(colors.textPrimary, 0.05), red: colors.red };

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
    router.replace('/(installer)/home');
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

        {/* The headline promise, stated plainly and first. Everything below it
            has to remain true of the code -- see the audit in lib/locationTracker
            and the one-shot fixes on the Jobs and job screens. */}
        <View style={s.leadCard}>
          <Text style={s.lead}>Vantro reads your location at sign in and sign out, not all day.</Text>
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>When we read your location</Text>
          <Text style={s.body}>At sign in and at sign out, to confirm you are within the site boundary. While you are signed in, your phone reports its position about once an hour, and tells us if you leave the site. That is all. Once you sign out, nothing is read until your next sign in.</Text>
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>What we never do</Text>
          <Text style={s.body}>We do not follow you continuously, we do not read your location outside a shift, and we do not record where you go when you are not signed in to a job.</Text>
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
  icon: { width: 64, height: 64, borderRadius: 32, backgroundColor: alpha(colors.teal, 0.1), alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: C.text, textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 14, color: C.muted, textAlign: 'center', marginBottom: 24 },
  leadCard: {
    backgroundColor: alpha(colors.teal, 0.1),
    borderWidth: 1,
    borderColor: alpha(colors.teal, 0.35),
    borderRadius: 12,
    padding: 18,
    marginBottom: 16,
  },
  lead: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, lineHeight: 24 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: C.teal, marginBottom: 8 },
  body: { fontSize: 13, color: C.text, lineHeight: 20, opacity: 0.85 },
  policyLink: { alignItems: 'center', marginVertical: 16 },
  policyLinkText: { fontSize: 14, color: C.teal, textDecorationLine: 'underline' },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 20, paddingHorizontal: 4 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: C.muted, alignItems: 'center', justifyContent: 'center', marginTop: 2, flexShrink: 0 },
  checkboxActive: { borderColor: C.teal, backgroundColor: alpha(colors.teal, 0.15) },
  checkmark: { color: C.teal, fontSize: 14, fontWeight: '700' },
  checkLabel: { fontSize: 13, color: C.text, lineHeight: 20, flex: 1, opacity: 0.85 },
  acceptBtn: { backgroundColor: C.teal, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  acceptBtnDisabled: { opacity: 0.4 },
  acceptBtnText: { color: colors.base, fontWeight: '700', fontSize: 15 },
});