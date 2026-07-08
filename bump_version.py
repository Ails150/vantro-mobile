import sys, re

FILE_PATH = "app.json"

with open(FILE_PATH, "rb") as f:
    data = f.read()

replacements = [
    (b'"version": "1.2.1"', b'"version": "1.2.2"'),
    (b'"buildNumber": "9"', b'"buildNumber": "10"'),
    (b'"versionCode": 17', b'"versionCode": 18'),
]

for old, new in replacements:
    if old not in data:
        print(f"ERROR: not found: {old.decode()}"); sys.exit(2)
    data = data.replace(old, new)

with open(FILE_PATH, "wb") as f:
    f.write(data)

print("Bumped: 1.2.1 -> 1.2.2 | iOS build 9 -> 10 | Android code 17 -> 18")
