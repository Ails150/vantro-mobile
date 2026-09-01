# Vantro verticals, v1

Spec only. No code in this document.

Vantro reads as a construction install tool because the nouns are welded into
the UI. A cleaning firm sees Job, Installer, Defect and Site diary and bounces
off before they reach the product. This spec makes the noun layer a
per-company setting so one build serves install, cleaning, security and
facilities without a fork.

Scope of v1: terminology, the `companies.vertical` column behind it, per
vertical feature flags, and picking a vertical at onboarding. Sites, recurring
visits and crews are the separate, larger build described in `VANTRO-BUILD-V3.md`
section C and are **out of scope here**.

---

## 1. Principle

**Rename what a person reads. Never rename what a machine reads.**

| Layer | Vertical aware? |
|---|---|
| On screen copy, tab labels, headers, empty states, button labels, alert text | Yes |
| PDF and audit pack headings, notification and email copy | Yes |
| Route paths (`/(installer)/jobs`, `/job/[id]`) | No |
| API endpoints (`/api/installer/jobs`, `/api/defects`) | No |
| Table and column names (`jobs`, `defects`, `signins`) | No |
| Stored enum values, above all `users.role = 'installer'` | No |
| SecureStore keys (`installer_email`, `installer_pin`, `vantro_active_shift`) | No |
| Log prefixes (`[DIARY]`, `[QA-VIDEO]`), Sentry tags, analytics events | No |

Renaming a route or a stored role is a data migration with a logout blast
radius, and it buys nothing a customer can see. The install vertical keeps
today's wording exactly, so this change is a no-op for every existing tenant.

---

## 2. `companies.vertical`

### Migration

`migrations/<date>_companies_vertical.sql`

- Add `vertical text not null default 'install'` to `companies`.
- Constrain it to the known set: `install`, `cleaning`, `security`,
  `facilities`, `grounds`, `pest`.
- Backfill is implicit: every existing row takes the default, which is the
  wording they already see.
- Index is unnecessary. It is read once per session, by primary key.

Adding a vertical later means altering the constraint and adding a label set.
No other migration.

### Reaching the client

The mobile app already receives `company_settings` on `/api/installer/jobs`
(consumed at `app/(installer)/jobs.tsx:138`). That is the wrong carrier here:
it arrives after the first render, and the login and PIN screens need wording
before any job is fetched.

Carry the vertical two ways instead:

1. **In the installer auth response**, alongside `role`, so `AuthContext`
   (`context/AuthContext.tsx:68`) stores it with the rest of the user record
   and it survives a cold start from SecureStore.
2. **As a claim in the installer token**, so server rendered surfaces (audit
   PDFs, emails) can resolve wording without a second query.

Both default to `install` when absent, so an old token or a stale cached user
keeps working through the rollout.

---

## 3. `lib/terms.ts`

A single module owning every vertical noun, plus a React context so screens
read it without prop drilling.

### Shape

`Vertical` is the union of the six values above.

`Terms` is a flat record of nouns, each with the cases the UI actually uses.
Every screen either title-cases a noun at the start of a label or lower-cases
it mid sentence, so store both rather than transforming at the call site:
`Clean`/`clean`/`Cleans`/`cleans` are not derivable by a rule that also
handles `Occurrence book`.

Fields, driven by the inventory in section 4:

| Key | Used for |
|---|---|
| `job`, `jobLower`, `jobs`, `jobsLower` | Tab label, headers, card copy, sign in and sign out buttons |
| `worker`, `workers` | Role label under the user name, admin team screen, alert copy |
| `site`, `siteLower` | GPS consent copy, geofence copy, admin map |
| `diary` | Diary header subtitle, job hub row, notification copy |
| `defect`, `defectLower`, `defects` | Defects screen, job hub row and badge, audit pack |
| `checklist`, `checklists` | QA screen, checklist library, admin approvals |
| `visitLog` | Walk and Talk equivalent where a vertical wants different framing |

`TERMS: Record<Vertical, Terms>` holds the label sets. A `useTerms()` hook
returns the active set; a `TermsProvider` sits inside `AuthProvider` in
`app/_layout.tsx` and reads the vertical off the authenticated user.

### Rules

- `useTerms()` returns the `install` set when the vertical is unknown, null, or
  a value this build does not recognise. A newer server must never blank the UI
  of an older client.
- No screen imports `TERMS` directly. Only `useTerms()`.
- Terms are display strings, never keys. Nothing may switch behaviour on the
  text of a term, only on `vertical` itself (see section 5).
- Copy that names a term must be assembled from the term, not stored per
  vertical as a whole sentence. One sentence per string, one term per slot,
  otherwise the label sets become six copies of the whole product's copy deck.

---

## 4. Inventory of hardcoded nouns

Everything below is a string a user reads today. Line numbers are as of this
commit; treat them as a checklist to work through, not as permanent anchors.

### 4.1 Installer navigation and jobs

| File | Line | String | Term |
|---|---|---|---|
| `app/(installer)/_layout.tsx` | 63 | `Jobs` (tab title) | `jobs` |
| `app/(installer)/_layout.tsx` | 65 | `Schedule` | none, stays |
| `app/(installer)/_layout.tsx` | 67 | `Expenses` | none, stays |
| `app/(installer)/_layout.tsx` | 69 | `Hours` | none, stays |
| `app/(installer)/jobs.tsx` | 249 | `Jobs` header title | `jobs` |
| `app/(installer)/jobs.tsx` | 260 | `Installer` role label | `worker` |
| `app/(installer)/jobs.tsx` | 264 | `Snap expense` | none, stays |
| `app/(installer)/jobs.tsx` | 291 | `On site - {name}` | `siteLower` |
| `app/(installer)/jobs.tsx` | 299 | `Your jobs today` | `jobsLower` |
| `app/(installer)/jobs.tsx` | 304 | `Nothing scheduled today` | none, stays |
| `app/(installer)/jobs.tsx` | 319 | `View summary` | none, stays |
| `app/(installer)/jobs.tsx` | 320 | `Open job` | `jobLower` |
| `app/(installer)/jobs.tsx` | 325 | `Sign in to job` | `jobLower` |
| `app/(installer)/jobs.tsx` | 363 | `Sign in to job` / `Too far to sign in` | `jobLower` |
| `app/(installer)/jobs.tsx` | ~324 | `Sign out of current job first` | `jobLower` |

### 4.2 Job hub

| File | Line | String | Term |
|---|---|---|---|
| `app/(installer)/job/[id].tsx` | 202 | `Site diary` row label | `diary` |
| `app/(installer)/job/[id].tsx` | 206 | `QA checklist` row label | `checklist` |
| `app/(installer)/job/[id].tsx` | 212 | `Log a defect` row label | `defectLower` |
| `app/(installer)/job/[id].tsx` | 215 | `Snap expense` | none, stays |
| `app/(installer)/job/[id].tsx` | 216 | `Walk and Talk` | `visitLog` |
| `app/(installer)/job/[id].tsx` | 237 | `Signed in at {time}` | none, stays |
| `app/(installer)/job/[id].tsx` | 280 | `Sign out of job`, `Move closer to sign out` | `jobLower` |
| `app/(installer)/job/[id].tsx` | ~205 | `1 entry today` / `n entries today` badge | none, stays |
| `app/(installer)/job/[id].tsx` | ~213 | `n open` defect badge | none, stays |

### 4.3 Diary

| File | Line | String | Term |
|---|---|---|---|
| `app/(installer)/diary.tsx` | 286 | `Site diary` subtitle | `diary` |
| `app/(installer)/diary.tsx` | 366-368 | `No entries today` and window variants | none, stays |
| `app/(installer)/diary.tsx` | 373 | `Snap a photo or hit Walk and Talk to log what happened on site.` | `visitLog`, `siteLower` |
| `app/(installer)/diary.tsx` | 404 | `WALK & TALK` badge | `visitLog` |
| `app/(installer)/diary.tsx` | 515 | `Walk & Talk` button | `visitLog` |

### 4.4 Defects

| File | Line | String | Term |
|---|---|---|---|
| `app/(installer)/defects.tsx` | 177 | `Defects` header | `defects` |
| `app/(installer)/defects.tsx` | 181 | `Log a defect` | `defectLower` |
| `app/(installer)/defects.tsx` | 230 | `No defects logged` | `defectsLower` |
| `app/(installer)/defects.tsx` | ~231 | `Log an issue with a photo and it lands in the audit pack.` | `defectLower` |
| `app/(installer)/defects.tsx` | 237 | `Logged on this job ({n})` | `jobLower` |
| `app/(installer)/defects.tsx` | ~184 | `Add a description first` | none, stays |
| `app/(installer)/defects.tsx` | ~166 | Severity labels `Minor` `Major` `Critical` | see 5.2 |

### 4.5 QA and checklists

| File | Line | String | Term |
|---|---|---|---|
| `app/(installer)/qa.tsx` | 313 | `QA checklists` header | `checklists` |
| `app/(installer)/qa.tsx` | 409 | `Mark complete` per item | none, stays |
| `app/(installer)/qa.tsx` | 493 | `Submit for approval` / `Mark complete` | none, stays |
| `app/(installer)/qa.tsx` | ~330 | `No checklists assigned to this job` | `checklistsLower`, `jobLower` |
| `app/(installer)/checklist-library.tsx` | 61 | `Checklist library` | `checklists` |
| `app/(installer)/checklist-library.tsx` | ~66 | `Select a checklist to complete` | `checklistLower` |

### 4.6 Capture, hours, expenses, consent

| File | Line | String | Term |
|---|---|---|---|
| `app/(installer)/capture.tsx` | 171, 176 | `Walk and Talk` | `visitLog` |
| `app/(installer)/my-hours.tsx` | 135 | `My hours` | none, stays |
| `app/(installer)/my-hours.tsx` | 151 | `...proof of every minute on site` | `siteLower` |
| `app/(installer)/my-hours.tsx` | 157 | `Last 7 days on site` | `siteLower` |
| `app/(installer)/expenses.tsx` | 250 | `Receipts on this job` | `jobLower` |
| `app/(installer)/gps-acknowledgment.tsx` | 40 | `...during work hours` | none, stays |
| `app/gps-consent.tsx` | 42, 47 | `job site` in two paragraphs | `jobLower`, `siteLower` |
| `app/login.tsx` | 196 | `New installer? Tap here to set up` | `workerLower` |

### 4.7 Admin

| File | Line | String | Term |
|---|---|---|---|
| `app/(admin)/jobs.tsx` | 29 | `Jobs` header | `jobs` |
| `app/(admin)/jobs.tsx` | 38 | `No jobs` | `jobsLower` |
| `app/(admin)/alerts.tsx` | 43 | `Alerts and QA` | `checklists` |
| `app/(admin)/alerts.tsx` | 49 | `QA Approvals` | `checklist` |
| `app/(admin)/alerts.tsx` | 35 | `Add a note for the installer:` | `workerLower` |
| `app/(admin)/alerts.tsx` | 75 | `No QA submissions awaiting approval` | `checklist` |
| `app/(admin)/dashboard.tsx` | 41 | `Awaiting QA` KPI | `checklists` |
| `app/(admin)/dashboard.tsx` | 100 | `Awaiting QA approval` | `checklists` |
| `app/(admin)/dashboard.tsx` | ~38 | `On Site Now`, `Active Jobs` KPIs | `siteLower`, `jobs` |
| `app/(admin)/map.tsx` | 39 | `Active job sites ({n})` | `jobLower`, `siteLower` |
| `app/(admin)/map.tsx` | ~30 | `Currently on site ({n})` | `siteLower` |
| `app/(admin)/team.tsx` | 43 | `PIN not set` on `role === 'installer'` | comparison stays, label is `worker` |
| `app/(admin)/team.tsx` | 47 | `On site` | `siteLower` |

### 4.8 Explicitly not renamed

Confirmed present and deliberately left alone: `installer_email` and
`installer_pin` SecureStore keys (`app/login.tsx:30,31,106,107`,
`app/setup-pin.tsx:55,56`); the `role === 'installer'` and `role !== 'admin'`
comparisons (`app/(admin)/team.tsx:43`, `app/(admin)/_layout.tsx:17`); all
`[DIARY]`, `[QA-SUBMIT]`, `[QA-PHOTO]`, `[QA-VIDEO]`, `[DEFECTS]`,
`[CHECKLIST-LIB]`, `[my-hours]` log prefixes.

### 4.9 Server side, second pass

Out of scope for the mobile pass but on the same terminology layer, so worth
naming now: audit pack section headings and the client portal
(`app/api/audit/report/route.ts`, `app/client/portal/page.tsx`), QA checklist
PDF headings (`app/api/qa/checklist-pdf/route.ts`), and push and email copy
(`lib/scheduling/notificationEngine.ts`). These read the vertical from the
token claim rather than a React context.

---

## 5. Label sets

`install` is the baseline and reproduces today's wording exactly.

| Term | install | cleaning | security | facilities |
|---|---|---|---|---|
| `job` | Job | Clean | Shift | Visit |
| `jobs` | Jobs | Cleans | Shifts | Visits |
| `worker` | Installer | Operative | Officer | Engineer |
| `workers` | Installers | Operatives | Officers | Engineers |
| `site` | Site | Site | Site | Site |
| `diary` | Site diary | Site log | Occurrence book | Site log |
| `defect` | Defect | Issue | Incident | Fault |
| `defects` | Defects | Issues | Incidents | Faults |
| `checklist` | QA checklist | Task sheet | Patrol round | Service sheet |
| `checklists` | QA checklists | Task sheets | Patrol rounds | Service sheets |
| `visitLog` | Walk and Talk | Walk round | Patrol note | Walk round |

The lower-case variants are the same words lower-cased except where a proper
noun survives mid sentence: `Walk and Talk` and `Occurrence book` keep their
capital first letter in every position, so store them explicitly rather than
lower-casing at the call site.

`grounds` and `pest`, sketched in `VANTRO-BUILD-V3.md` C1, are additive: a row
each in `TERMS` and a value each in the check constraint. They are not part of
the v1 acceptance criteria.

### 5.2 Severity and status vocabularies

Severity (`Minor`, `Major`, `Critical`) and expense status (`Submitted`,
`Approved`) are stored enum values rendered directly. They read acceptably in
all four verticals, so v1 leaves them alone and does **not** put them in
`Terms`. Security may eventually want `Low`/`Medium`/`High` for incidents;
that is a display map over the same stored values, specified when asked for,
not now.

---

## 6. Per-vertical feature flags

Terminology alone still shows a cleaning firm a QA photo gate they do not
want, and hides a patrol feature a security firm needs. Flags are a separate
concern from terms and must not be inferred from them.

Model them as a `FEATURES: Record<Vertical, Features>` map in the same module
family (`lib/features.ts`, read through a `useFeatures()` hook), not as
database columns. They are product decisions per vertical, not per tenant, so
they belong in code where they are reviewable and testable. A per-tenant
override table is a later concern and should not be built speculatively.

| Flag | install | cleaning | security | facilities | Controls |
|---|---|---|---|---|---|
| `qaPhotoGate` | on | on | off | on | Photo required blocks Pass (`app/(installer)/qa.tsx`) |
| `defectSeverity` | on | on | on | on | Severity pills on the defect form |
| `walkAndTalk` | on | off | on | on | Job hub row and diary button |
| `expenses` | on | on | off | on | Expenses tab and Snap expense buttons |
| `qaApprovals` | on | off | off | on | Admin approvals tab and the submit for approval path |
| `holdPoints` | on | off | off | off | `checklist_items.hold_point` treatment |

Rules:

- A flag hides a whole surface, never an individual button that leaves a dead
  end. Turning `expenses` off removes the tab, the job hub row and the Jobs
  header button together.
- Route files stay on disk when their flag is off. Hide the entry points; do
  not delete the screen. A deep link to a disabled screen renders a plain
  "not available on this plan" state rather than crashing.
- Every flag defaults to the `install` value for an unknown vertical.

---

## 7. Onboarding vertical selection

Where the value is set. Today `companies` rows are created during admin setup
(`/api/admin/setup/complete`).

- Add a required vertical step to admin setup, before the first job or site is
  created. Six cards, one per vertical, each showing the three nouns that
  change most: for cleaning, "Cleans, Operatives, Site log".
- The step writes `companies.vertical` and nothing else. It is not a plan or a
  billing choice and must not be presented as one.
- Existing companies are not prompted. They are already on `install`, which is
  the wording they have always seen.
- Admins can change it later in company settings, with a warning that it
  changes wording across the app and on already-issued audit packs. It is
  cosmetic and reversible, so no confirmation beyond that warning.
- The choice is per company, not per user. There is no per-user override.

---

## 8. Rollout

1. Migration and `companies.vertical`, defaulted. No UI change. Ships alone and
   is inert.
2. Vertical on the auth response and the token claim. Still no UI change.
3. `lib/terms.ts` plus provider and hook, with only the `install` set
   populated. Convert the section 4 inventory to `useTerms()`. Every string
   resolves to today's wording, so this ships as a visual no-op and can be
   verified by screenshot diff.
4. Add the cleaning, security and facilities label sets. Now switchable.
5. `lib/features.ts` and the flags in section 6.
6. Onboarding step.

Steps 1 to 3 carry the risk and none of the reward, which is the right order:
the noun swap lands under a build where nothing on screen has changed yet.

---

## 9. Done when

- A company on `vertical = 'cleaning'` sees Cleans, Operatives, Site log and
  Issues, and never sees Job, Installer, Defect or Site diary, on any installer
  or admin screen listed in section 4.
- A company on `vertical = 'install'` sees byte-identical copy to today.
- No route path, API path, table name, column name, stored role value,
  SecureStore key or log prefix changed.
- An unknown or missing vertical renders the install wording rather than blanks.
- `npx tsc --noEmit` clean in both repos.
