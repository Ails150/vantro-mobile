content = open('lib/locationTracker.ts', encoding='utf-8').read()
content = content.replace(
    "import { API_BASE } from '@/constants/api';",
    "const API_BASE = 'https://app.getvantro.com';"
)
content = content.replace(
    "notificationBody: 'Tracking your location while on site',",
    "notificationBody: 'You are signed in - tap to open Vantro',"
)
open('lib/locationTracker.ts', 'w', encoding='utf-8').write(content)
print('Fixed:', 'https://app.getvantro.com' in content)