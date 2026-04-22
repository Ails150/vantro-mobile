# Fix consent screen wording
content = open('app/gps-consent.tsx', encoding='utf-8').read()
content = content.replace(
    "While signed in, your location is logged approximately every 30 minutes for attendance verification.",
    "Your location is recorded at sign-in and sign-out to verify you were on site. No continuous background tracking occurs."
)
content = content.replace(
    "Location tracking starts only when you sign in to a job and stops immediately when you sign out. No tracking occurs outside of work sessions, during breaks off-site, or when the app is closed.",
    "Location is checked when you sign in and when you sign out. This is used solely to confirm you are within the job site boundary at those moments."
)
open('app/gps-consent.tsx', 'w', encoding='utf-8').write(content)
print('Consent wording fixed')