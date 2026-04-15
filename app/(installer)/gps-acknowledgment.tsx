import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const C = { bg: '#0f1923', card: '#1a2635', teal: '#00d4a0', muted: '#4d6478', text: '#ffffff', border: 'rgba(255,255,255,0.05)' };

export default function GPSAcknowledgmentScreen() {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);

  async function handleAccept() {
    await AsyncStorage.setItem('gps_acknowledged', 'true');
    router.replace('/(installer)/jobs');
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
  safe: { flex: 1, backgroundColor: '#0f1923' },
  scroll: { padding: 24, paddingTop: 56 },
  title: { fontSize: 26, fontWeight: '700', color: '#ffffff', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#4d6478', marginBottom: 32, lineHeight: 22 },
  card: { backgroundColor: '#1a2635', borderRadius: 12, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  heading: { fontSize: 12, fontWeight: '700', color: '#00d4a0', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 },
  body: { fontSize: 15, color: '#ffffff', lineHeight: 22 },
  checkbox: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 8, marginBottom: 32, gap: 12 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#4d6478', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  boxChecked: { backgroundColor: '#00d4a0', borderColor: '#00d4a0' },
  tick: { color: '#000', fontWeight: '700', fontSize: 14 },
  checkLabel: { flex: 1, fontSize: 15, color: '#ffffff', lineHeight: 22 },
  btn: { backgroundColor: '#00d4a0', borderRadius: 12, padding: 18, alignItems: 'center' },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#000', fontWeight: '700', fontSize: 16 },
});