import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { alpha, colors } from '@/theme';

const C = { bg: colors.base, card: colors.surface1, teal: colors.teal, muted: colors.textMuted, text: colors.textPrimary, border: alpha(colors.textPrimary, 0.05) };

export default function GPSAcknowledgmentScreen() {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);

  async function handleAccept() {
    await AsyncStorage.setItem('gps_acknowledged', 'true');
    router.replace('/(installer)/home');
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.title}>Before you continue</Text>
        <Text style={s.subtitle}>Your employer uses Vantro to manage site attendance. Please read before continuing.</Text>
        <View style={s.card}>
          <Text style={s.heading}>What is tracked</Text>
          <Text style={s.body}>Your GPS location is recorded when you sign in and out of a job site to verify attendance and support accurate payroll.</Text>
        </View>
        <View style={s.card}>
          <Text style={s.heading}>What is NOT tracked</Text>
          <Text style={s.body}>You are not tracked outside of work hours. Tracking stops the moment you sign out of a job.</Text>
        </View>
        <View style={s.card}>
          <Text style={s.heading}>Your rights</Text>
          <Text style={s.body}>You can request a copy of your data at any time by emailing hello@getvantro.com. Location data is deleted after 90 days.</Text>
        </View>
        <TouchableOpacity style={s.checkbox} onPress={() => setAccepted(!accepted)} activeOpacity={0.7}>
          <View style={[s.box, accepted && s.boxChecked]}>
            {accepted && <Text style={s.tick}>✓</Text>}
          </View>
          <Text style={s.checkLabel}>I understand and agree to GPS location tracking during work hours</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btn, !accepted && s.btnDisabled]} onPress={accepted ? handleAccept : undefined} activeOpacity={accepted ? 0.8 : 1}>
          <Text style={s.btnText}>Continue to Vantro</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  scroll: { padding: 24, paddingTop: 56 },
  title: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: 15, color: colors.textMuted, marginBottom: 32, lineHeight: 22 },
  card: { backgroundColor: colors.surface1, borderRadius: 12, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: alpha(colors.textPrimary, 0.05) },
  heading: { fontSize: 12, fontWeight: '700', color: colors.teal, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 },
  body: { fontSize: 15, color: colors.textPrimary, lineHeight: 22 },
  checkbox: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 8, marginBottom: 32, gap: 12 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.textMuted, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  boxChecked: { backgroundColor: colors.teal, borderColor: colors.teal },
  tick: { color: colors.black, fontWeight: '700', fontSize: 14 },
  checkLabel: { flex: 1, fontSize: 15, color: colors.textPrimary, lineHeight: 22 },
  btn: { backgroundColor: colors.teal, borderRadius: 12, padding: 18, alignItems: 'center' },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: colors.black, fontWeight: '700', fontSize: 16 },
});