content = open('app/gps-consent.tsx', encoding='utf-8').read()
content = content.replace(
    "import { authFetch } from '@/lib/api';",
    "import { authFetch } from '@/lib/api';\nimport AsyncStorage from '@react-native-async-storage/async-storage';"
)
content = content.replace(
    "await authFetch('/api/installer/acknowledge', { method: 'POST', body: JSON.stringify({}) });\n      router.replace('/(installer)/jobs');",
    "await authFetch('/api/installer/acknowledge', { method: 'POST', body: JSON.stringify({}) });\n      await AsyncStorage.setItem('gps_acknowledged', 'true');\n      router.replace('/(installer)/jobs');"
)
open('app/gps-consent.tsx', 'w', encoding='utf-8').write(content)
print('Fixed:', 'gps_acknowledged' in content)