import React, { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import * as SecureStore from 'expo-secure-store'

const COLORS = { bg: '#0f1923', card: '#1a2a22', green: '#00C896', text: '#e8f5f0', muted: '#6b8f7e' }

export default function SetupPin() {
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [stage, setStage] = useState<'enter' | 'confirm'>('enter')
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const router = useRouter()
  const params = useLocalSearchParams()

  useEffect(() => {
    if (params.email) setEmail(decodeURIComponent(params.email as string))
  }, [params])

  const handleKey = (key: string) => {
    if (stage === 'enter') {
      const next = pin + key
      setPin(next)
      if (next.length === 4) setTimeout(() => setStage('confirm'), 300)
    } else {
      const next = confirm + key
      setConfirm(next)
      if (next.length === 4) setTimeout(() => submitPin(pin, next), 300)
    }
  }

  const handleDelete = () => {
    if (stage === 'enter') setPin(p => p.slice(0, -1))
    else setConfirm(p => p.slice(0, -1))
  }

  const submitPin = async (p1: string, p2: string) => {
    if (p1 !== p2) {
      Alert.alert('PINs do not match', 'Please try again.')
      setPin(''); setConfirm(''); setStage('enter')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('https://app.getvantro.com/api/installer/setup-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, pin: p1 })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to set PIN')
      await SecureStore.setItemAsync('installer_email', email)
      await SecureStore.setItemAsync('installer_pin', p1)
      router.replace('/(installer)/jobs')
    } catch (e: any) {
      Alert.alert('Error', e.message)
      setPin(''); setConfirm(''); setStage('enter')
    } finally {
      setLoading(false)
    }
  }

  const current = stage === 'enter' ? pin : confirm
  const keys = ['1','2','3','4','5','6','7','8','9','','0','del']

  return (
    <View style={s.container}>
      <View style={s.logo}><Text style={s.logoText}>V</Text></View>
      <Text style={s.title}>{stage === 'enter' ? 'Choose your PIN' : 'Confirm your PIN'}</Text>
      <Text style={s.sub}>{stage === 'enter' ? 'This 4-digit PIN is how you sign in each day' : 'Enter your PIN again to confirm'}</Text>
      <View style={s.dots}>
        {[0,1,2,3].map(i => (
          <View key={i} style={[s.dot, current.length > i && s.dotFilled]} />
        ))}
      </View>
      {loading ? <ActivityIndicator color={COLORS.green} style={{ marginTop: 40 }} /> : (
        <View style={s.keypad}>
          {keys.map((k, i) => (
            <TouchableOpacity
              key={i}
              style={[s.key, k === '' && s.keyEmpty]}
              onPress={() => k === 'del' ? handleDelete() : k !== '' ? handleKey(k) : null}
              disabled={k === ''}
            >
              <Text style={k === 'del' ? s.keyDel : s.keyText}>{k === 'del' ? '⌫' : k}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', padding: 32 },
  logo: { width: 48, height: 48, borderRadius: 12, backgroundColor: COLORS.green, alignItems: 'center', justifyContent: 'center', marginBottom: 32 },
  logoText: { color: '#07100D', fontWeight: '800', fontSize: 20 },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  sub: { fontSize: 14, color: COLORS.muted, textAlign: 'center', marginBottom: 32, maxWidth: 260 },
  dots: { flexDirection: 'row', gap: 16, marginBottom: 48 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: COLORS.muted },
  dotFilled: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', width: 264, justifyContent: 'space-between', rowGap: 16 },
  key: { width: 76, height: 76, borderRadius: 38, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center' },
  keyEmpty: { backgroundColor: 'transparent' },
  keyText: { fontSize: 26, fontWeight: '300', color: COLORS.text },
  keyDel: { fontSize: 20, color: COLORS.muted },
})
