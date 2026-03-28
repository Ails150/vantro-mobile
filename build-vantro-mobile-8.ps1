Set-Location C:\vantro-mobile

# ─── README.md ───────────────────────────────────────────────
@'
# Vantro Mobile (Expo / React Native)

Same Supabase project and APIs as app.getvantro.com.

## Setup

```bash
cd C:\vantro-mobile
npm install
npx expo start
```

Scan the QR code with Expo Go on iOS/Android.

## Build for production

```bash
npx eas build --platform ios
npx eas build --platform android
```

## Structure

```
app/
  login.tsx              - PIN login screen (all users)
  index.tsx              - redirects based on role
  (installer)/
    _layout.tsx          - auth guard
    jobs.tsx             - job list + GPS sign in/out
    diary.tsx            - site diary with AI alerts
    qa.tsx               - QA checklist
    defects.tsx          - defect logging
  (admin)/
    _layout.tsx          - tab nav + auth guard
    dashboard.tsx        - KPI overview, live signins, alerts
    map.tsx              - live map of installers + job sites
    jobs.tsx             - jobs list with filter
    team.tsx             - team members + on-site status
    alerts.tsx           - alerts + QA approvals tab
context/
  AuthContext.tsx        - PIN auth, secure token storage
lib/
  api.ts                 - authFetch wrapper pointing at app.getvantro.com
constants/
  api.ts                 - API_BASE = https://app.getvantro.com
```

## Auth flow

- All users (installer, foreman, admin) log in with 4-digit PIN
- Token stored in Expo SecureStore (encrypted on device)
- Token is a base64 JSON payload with userId, companyId, 8h expiry
- Same token format as web app — same /api/installer/auth endpoint

## Admin API routes needed on app.getvantro.com

The admin mobile screens call these routes which need to be added
to the Next.js app (or the existing admin data can be proxied):

  GET  /api/admin/jobs       - all jobs for company
  GET  /api/admin/signins    - current active signins with user info
  GET  /api/admin/alerts     - unread alerts
  POST /api/admin/alerts     - { action: "dismiss", id }
  GET  /api/admin/team       - all team members

See add-admin-api-routes.ps1 to add these to C:\vantro.

## GPS enforcement

- Sign in: must be within 150m of job site (enforced server-side in /api/signin)
- Sign out: checked client-side with same 150m rule
- Installers blocked from signing into multiple jobs simultaneously

## Notes

- react-native-maps requires Google Maps API key for Android
  Add to app.json: { "android": { "config": { "googleMaps": { "apiKey": "YOUR_KEY" } } } }
- iOS uses Apple Maps by default (no key needed)
'@ | Set-Content "README.md" -Encoding UTF8

Write-Host "Part 8 done - README created" -ForegroundColor Green
Write-Host ""
Write-Host "============================" -ForegroundColor Cyan
Write-Host "ALL FILES CREATED" -ForegroundColor Cyan
Write-Host "============================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  cd C:\vantro-mobile" -ForegroundColor White
Write-Host "  npm install" -ForegroundColor White
Write-Host "  npx expo start" -ForegroundColor White
Write-Host ""
Write-Host "Then run add-admin-api-routes.ps1 to add the admin" -ForegroundColor Yellow
Write-Host "API routes to C:\vantro so the admin app screens work." -ForegroundColor Yellow
