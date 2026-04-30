import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const C = {
  bg: '#0f1923', card: '#1a2635', teal: '#00d4a0',
  muted: '#4d6478', text: '#ffffff', border: 'rgba(255,255,255,0.05)',
};

const TYPES = [
  { id: 'annual_leave', label: 'Annual leave', emoji: '🏖️', subtitle: 'Holiday or rest day' },
  { id: 'sick', label: 'Sick', emoji: '🤒', subtitle: 'Unwell, off work' },
  { id: 'personal', label: 'Personal', emoji: '👪', subtitle: 'Family or appointments' },
  { id: 'training', label: 'Training', emoji: '🎓', subtitle: 'Course or qualification' },
];

export default function TypeSelectScreen() {
  const router = useRouter();

  function selectType(typeId: string) {
    router.push({ pathname: '/schedule-request/calendar' as any, params: { type: typeId } });
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBack}>
          <Ionicons name="close" size={28} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Request time off</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.intro}>What kind of time off?</Text>
        <Text style={styles.introSub}>Choose one to continue.</Text>

        <View style={styles.grid}>
          {TYPES.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={styles.tile}
              onPress={() => selectType(t.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.emoji}>{t.emoji}</Text>
              <Text style={styles.tileLabel}>{t.label}</Text>
              <Text style={styles.tileSubtitle}>{t.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerBack: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { color: C.text, fontSize: 18, fontWeight: '500' },

  body: { flex: 1, padding: 20 },
  intro: { color: C.text, fontSize: 24, fontWeight: '500', marginTop: 12 },
  introSub: { color: C.muted, fontSize: 14, marginTop: 4, marginBottom: 28 },

  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-between', gap: 12,
  },
  tile: {
    width: '48%',
    aspectRatio: 1,
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    justifyContent: 'space-between',
    borderWidth: 1, borderColor: 'transparent',
  },
  emoji: { fontSize: 36 },
  tileLabel: { color: C.text, fontSize: 17, fontWeight: '500' },
  tileSubtitle: { color: C.muted, fontSize: 12, lineHeight: 16 },
});
