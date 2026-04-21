content = open('app/login.tsx', encoding='utf-8').read()
content = content.replace(
    "import * as SecureStore from 'expo-secure-store';",
    "import * as SecureStore from 'expo-secure-store';\nimport AsyncStorage from '@react-native-async-storage/async-storage';"
)
content = content.replace(
    "else { router.replace('/'); }",
    "else {\n          const ack = await AsyncStorage.getItem('gps_acknowledged');\n          if (ack === 'true') { router.replace('/(installer)/jobs'); }\n          else { router.replace('/gps-consent'); }\n        }"
)
open('app/login.tsx', 'w', encoding='utf-8').write(content)
print('Login fixed:', "gps-consent" in content)