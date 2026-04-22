content = open('app/login.tsx', encoding='utf-8').read()

# Add forgot PIN handler before handleKey
forgot_fn = """
  async function handleForgotPin() {
    const email = await new Promise<string|null>(resolve => {
      Alert.prompt(
        'Reset PIN',
        'Enter your email address to receive a reset link',
        [
          { text: 'Cancel', onPress: () => resolve(null), style: 'cancel' },
          { text: 'Send', onPress: (text) => resolve(text || null) }
        ],
        'plain-text',
        '',
        'email-address'
      )
    })
    if (!email) return
    try {
      await fetch('https://app.getvantro.com/api/installer/reset-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() })
      })
      Alert.alert('Check your email', 'If your email is registered, you will receive a PIN reset link shortly.')
    } catch {
      Alert.alert('Error', 'Could not connect. Please check your internet connection.')
    }
  }

"""
content = content.replace('  async function handleEmailSubmit()', forgot_fn + '  async function handleEmailSubmit()')

# Add Forgot PIN link below the New installer link
content = content.replace(
    "          <TouchableOpacity onPress={() => { setShowEmailEntry(true); setError(''); setPin(''); }}>\n            <Text style={s.hint}>New installer? Tap here to set up</Text>\n          </TouchableOpacity>",
    "          <TouchableOpacity onPress={() => { setShowEmailEntry(true); setError(''); setPin(''); }}>\n            <Text style={s.hint}>New installer? Tap here to set up</Text>\n          </TouchableOpacity>\n          <TouchableOpacity onPress={handleForgotPin} style={{ marginTop: 8 }}>\n            <Text style={s.hint}>Forgot PIN? Reset via email</Text>\n          </TouchableOpacity>"
)

open('app/login.tsx', 'w', encoding='utf-8').write(content)
print('Login forgot PIN added:', 'handleForgotPin' in content)