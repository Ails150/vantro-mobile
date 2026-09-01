# Vantro mobile UX fix pass

Task brief. Work through P0 first and stop for review before P1.
Repo: `C:\vantro`. Expo / React Native. Brand teal `#00C896`, dark base `#0B0F14`.

Run `npx expo start` in dev mode throughout. Do not trigger an EAS build.

---

## Rules

1. Never write emoji into source. Use `@expo/vector-icons` (Ionicons), which ships with Expo.
2. Every file must be saved UTF-8 without BOM.
3. Do not restyle screens beyond what is listed. This is a defect pass, not a redesign.
4. Import brand values from `theme.ts`. No new hex literals in screens.
5. Sentence case on all UI labels. No ALL CAPS.

---

## P0. Blocks marketing screenshots

### P0.1 Encoding corruption

Several screens render mojibake instead of icons: `ðŸ"·`, `🖼`, `🎙`, `â†`, `â†'`.
Cause: files saved as ANSI or UTF-16 by a PowerShell or Notepad edit loop.

1. Run `node scripts/fix-encoding.mjs --check` to list affected files.
2. Run `node scripts/fix-encoding.mjs --fix` to repair encoding and strip emoji.
3. Manually replace every stripped emoji with an Ionicon per the map below.

Icon map:

| Was | Ionicon | Colour |
|---|---|---|
| camera emoji | `camera-outline` | `colors.teal` |
| picture emoji | `images-outline` | `colors.teal` |
| microphone emoji | `mic-outline` | `colors.violet` |
| up arrow / send | `arrow-up` | `colors.base` |
| left arrow / back | `chevron-back` | `colors.teal` |
| clock | `time-outline` | `colors.teal` |
| calendar | `calendar-outline` | `colors.textPrimary` |
| sign out | `log-out-outline` | `colors.textMuted` |
| directions | `navigate-outline` | `colors.blue` |
| receipt | `receipt-outline` | `colors.teal` |
| warning / defect | `warning-outline` | `colors.amber` |
| tick / QA | `checkmark-circle-outline` | `colors.teal` |
| party popper (schedule) | `sunny-outline` | `colors.teal` |

Verify: `git grep -nP "[\x{1F300}-\x{1FAFF}]|ð\x9F|â†|â€" -- "*.tsx" "*.ts"` returns nothing.

### P0.2 Headers collide with the status bar

On every screen the title overlaps the system clock, and on Jobs the "Snap expense" button covers the battery icon. There is no safe area inset.

1. Add `components/ScreenHeader.tsx` (supplied).
2. Wrap the root in `SafeAreaProvider` and set `<StatusBar style="light" backgroundColor={colors.base} />` in `app/_layout.tsx`.
3. Replace the hand rolled header on all screens with `<ScreenHeader />`:
   Jobs, Site Diary, QA Checklists, Defects, My Expenses, Schedule, Job detail, Audit pack.
4. On Jobs, the header currently prints the user name as a subtitle and the row below prints it again. Remove it from the header, keep the row.

Verify on a device with a notch and on a Samsung with a punch hole. No text may sit within `insets.top` of the top edge.

### P0.3 Geofence refusal reads as a bug

Current: `You are 136494m from Murphy Skylight Replacement. You must be within 150m to sign in.`
The Sign in button stays full teal and enabled underneath it.

1. Format distance: under 1000 show `${Math.round(m)} m`, at or over 1000 show `${(m/1000).toFixed(1)} km`.
2. New copy: `You are 136.5 km away. Sign in opens within 150 m of the address.`
3. Disable the button when out of range. Background `colors.surface2`, label `Too far to sign in`, text `colors.textMuted`.
4. Keep "Get directions" enabled and promote it to the primary action while out of range.

---

## P1. Fix before the ad campaign goes live

### P1.1 Empty states

Site Diary with no entries renders a blank black screen. Same risk on Defects and Expenses.

1. Add `components/EmptyState.tsx` (supplied).
2. Site Diary: icon `document-text-outline`, title `No entries in the last 7 days`, body `Snap a photo or hit Walk and Talk to log what happened on site.`
3. Change the Site Diary default filter from `7d` to `Today`.
4. Defects: `No defects logged`, body `Log an issue with a photo and it lands in the audit pack.`
5. Expenses: `No receipts yet`, body `Tap Snap to capture one. It reads the amount for you.`

### P1.2 Buttons fire before their form is valid

1. Defects: `Log defect` is enabled with an empty description and looks disabled anyway. Gate on `description.trim().length > 0`. When blocked, label reads `Add a description first`.
2. QA Checklists: `Mark complete` is enabled while items are pending. Gate on every item having pass or fail. When blocked, label reads `${pendingCount} left`.
3. Severity pills on Defects are all grey. Fill the selected one: Minor `colors.surface3`, Major `colors.amber`, Critical `colors.red`, with `colors.base` text on the filled state.

### P1.3 Checklist item titles are meaningless

Items render as `HS 1`. Use the checklist item's own description as the title and demote `HS 1` to a small reference chip aligned right, next to the status pill.

### P1.4 Tab strip clips at the screen edge

On QA Checklists, `Fire Safety` is cut in half. Add `contentContainerStyle={{ paddingRight: 20 }}` to the horizontal ScrollView and set `showsHorizontalScrollIndicator={false}`.

---

## P2. After the campaign is live

1. Expenses shows the same `£859.14 Materials` twice, at 08:33 and 08:48. Add an idempotency key on the receipt image hash plus amount plus job id, reject the second write.
2. A CITY TECH STORE receipt is categorised `Food` on one row and `Tools` on another. Review the Gemini categorisation prompt, add the merchant name as an input signal.
3. Expenses header labels `SUBMITTED` and `APPROVED + PAID` are ALL CAPS. Change to `Submitted` and `Approved and paid`.
4. Job cards on the Jobs list carry only a name, an address and two buttons. Add a start time chip and a status dot so the list has hierarchy.

---

## Demo data for marketing screenshots

Current seed data reads as test junk (`Kentford`, `Kenny`). Reseed the demo tenant:

| Job | Address | Time |
|---|---|---|
| Murphy skylight replacement | 8 The Green, Guildford, GU1 3UA | 08:00 |
| Ashcroft House, second fix | 14 Ashcroft Rise, Woking, GU21 4TR | 11:30 |
| Riverside Retail Park, curtain wall survey | Riverside Way, Camberley, GU15 3YL | 14:00 |

Then capture three screenshots at 1290x2796: Jobs list, geofence refusal, audit pack.

---

## Definition of done

- No mojibake anywhere in the app or the source
- No text within the safe area inset on any screen, on notch and punch hole devices
- No blank screen state anywhere
- No enabled button that refuses the action when pressed
- `npx expo start` runs clean with no new warnings
