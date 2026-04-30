import json

# 1. Strip dev logs from diary.tsx
diary_path = "C:\\vantro-mobile\\app\\(installer)\\diary.tsx"
with open(diary_path, "r", encoding="utf-8") as f:
    c = f.read()
c = c.replace("console.log('[DIARY-TAP] submit() called, showing modal');\n      ", "")
c = c.replace("console.log('[DIARY-TAP] tapped status:', status);\n      ", "")
with open(diary_path, "w", encoding="utf-8") as f:
    f.write(c)
print("1. Dev logs stripped from diary.tsx")

# 2. Bump version + versionCode + iOS buildNumber in app.json
app_json = "C:\\vantro-mobile\\app.json"
with open(app_json, "r", encoding="utf-8") as f:
    raw = f.read()

raw = raw.replace('"version": "1.0.0"', '"version": "1.1.0"')
raw = raw.replace('"versionCode": 2', '"versionCode": 3')

# Add iOS buildNumber if missing, bump if present
import re
ios_match = re.search(r'"ios":\s*\{[^}]*\}', raw, re.DOTALL)
if ios_match:
    ios_block = ios_match.group(0)
    if '"buildNumber"' in ios_block:
        new_ios = re.sub(r'"buildNumber":\s*"(\d+)"',
                         lambda m: f'"buildNumber": "{int(m.group(1)) + 1}"',
                         ios_block)
    else:
        # Insert buildNumber after bundleIdentifier
        new_ios = ios_block.replace(
            '"bundleIdentifier": "com.getvantro.app"',
            '"bundleIdentifier": "com.getvantro.app",\n      "buildNumber": "2"'
        )
    raw = raw.replace(ios_block, new_ios)

with open(app_json, "w", encoding="utf-8") as f:
    f.write(raw)
print("2. Version bumped: 1.0.0 -> 1.1.0, versionCode: 2 -> 3, iOS buildNumber bumped")
