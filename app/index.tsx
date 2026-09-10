import { Redirect } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useLanguage } from '@/context/LanguageContext';
import { colors } from '@/theme';

export default function Index() {
  const { language, ready } = useLanguage();

  // Redirecting before the stored choice has been read sends a returning
  // installer through the language screen again on every cold start.
  if (!ready) {
    return (
      <View style={s.wait}>
        <ActivityIndicator color={colors.teal} />
      </View>
    );
  }

  return <Redirect href={language ? '/login' : '/language'} />;
}

const s = StyleSheet.create({
  wait: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.base },
});
