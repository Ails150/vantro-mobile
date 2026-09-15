# i18n review

State of translation in the Vantro mobile app, reviewed 15 September 2026
against `lib/i18n.ts` and `locales/{en,pl,ro,lt}.json`.

Written because the translations had never been audited as a set, and because a
count of keys per file had been read as evidence of drift when it is nothing of
the sort. The headline is that the **translation infrastructure is in better
shape than expected and the coverage is worse**.

---

## Summary

| | Finding |
|---|---|
| Plural rules | **Correct.** Custom CLDR rules per language, not the one/other default |
| Missing keys | **None.** Every English key exists in all three translations |
| Untranslated values | 2, both the same string, both probably fine |
| Hardcoded strings in screens | **120**, of which **90 are on installer screens** |

The gap is not in the locale files. It is in the screens that never call `t()`.

---

## 1. Plural rules are right, and the key counts are not drift

`en=111 pl=119 ro=115 lt=115`.

That spread looks like three translation files that have wandered away from the
source. It is the opposite. English has two plural categories, `one` and
`other`. Polish has four, Romanian and Lithuanian three. The extra keys are
exactly those categories:

```
sync.pending.few         pl ro lt
sync.pending.many        pl
sync.a11yPending.few     pl ro lt
sync.a11yPending.many    pl
holidays.daysUnit.few    pl ro lt
holidays.daysUnit.many   pl
```

`lib/i18n.ts` registers real rules rather than taking the library default, and
all three are correct:

- **Polish** — `one` for 1; `few` for n mod 10 in 2..4 excluding n mod 100 in
  12..14; `many` otherwise. Matches CLDR.
- **Lithuanian** — `one` for n mod 10 = 1 excluding 11..19; `few` for n mod 10
  in 2..9 excluding 11..19; `other` otherwise. Matches CLDR for integers.
- **Romanian** — `one` for 1; `few` for 0 and n mod 100 in 1..19; `other`
  otherwise. Matches CLDR.

The comment in that file — "i18n-js ships one/other, which is English's shape
and wrong for three of our four" — is accurate and the fix is real.

**Spot check that the translator understood the categories, not just filled
them in.** Polish `sync.a11yPending` inflects properly across all four:

```
one   %{count} działanie oczekuje na wysłanie
few   %{count} działania oczekują na wysłanie
many  %{count} działań oczekuje na wysłanie
```

Three different forms of both noun and verb. That is a person who speaks Polish,
not a find-and-replace.

**One thing to confirm, not a bug.** Polish `sync.pending` is the same string in
all four categories (`%{count} do wysłania`). That is plausible — "do wysłania"
is a fixed phrase that does not inflect — but it is the one place a native
speaker should glance, because identical forms across all categories is also
what a lazy fill-in looks like.

### Lithuanian `many`

`lt` has no `many` key and the rule never returns one. CLDR does define `many`
for Lithuanian, but only for decimal fractions (1,5 valandos). Every count in
this app is an integer — pending uploads, days, jobs — so the category is
unreachable. Correct as it stands. Worth a comment in `lib/i18n.ts` so the next
person does not "fix" it.

---

## 2. Untranslated values: two, both benign

| Key | Language | Value |
|---|---|---|
| `sync.offline` | pl | `Offline` |
| `sync.offline` | ro | `Offline` |

"Offline" is a normal loanword in both. Lithuanian translated it. Flag for a
native speaker, expect the answer to be "leave it".

No other value in any file is identical to its English source.

---

## 3. The real gap: 120 hardcoded strings

Strings rendered directly in JSX rather than through `t()`. These cannot be
translated at all, so a Polish-speaking installer sees them in English no matter
what they picked on the language screen.

| Surface | Count | Priority |
|---|---|---|
| `app/(installer)/` | **90** | **High** — this is the translated audience |
| `app/*.tsx` (login, setup-pin, language, gps-consent) | 16 | **High** — before language is even chosen |
| `app/(admin)/` | 14 | Low — see below |
| `components/` | 0 | — already clean |

Worst installer files:

```
13  app/(installer)/expenses.tsx
11  app/(installer)/schedule.tsx
11  app/(installer)/qa.tsx
 7  app/(installer)/diary.tsx
 7  app/(installer)/defects.tsx
 6  app/(installer)/checklist-run.tsx
 5  app/(installer)/gps-acknowledgment.tsx
```

Examples, all of them things a worker reads while trying to do something:

```
app/(installer)/capture.tsx:150   Stored on this phone. Will upload automatically when online.
app/(installer)/checklist-library.tsx:69   Ask your admin to create checklist templates.
app/(installer)/checklist-run.tsx:208   Record video
```

The first of those is an offline reassurance message. Showing it in English to
somebody who chose Polish, at the exact moment they are worried their photo has
been lost, is the worst possible time for the app to stop speaking their
language.

### `(admin)` is deliberately lower priority

The mobile admin screens are a supervisor surface, and in every tenant seen so
far the admin operates in English. Translating them is not wrong, it is just not
where the 90 are. Recommend deciding this explicitly rather than leaving it
ambiguous: either commit to translating admin too, or add a note to
`app/(admin)/` saying it is English-only by design so nobody half-does it.

### `gps-acknowledgment.tsx` is the one to do first

Five hardcoded strings on a screen where a worker consents to background
location tracking. Consent that the person cannot read is not consent, and this
one has a legal dimension the others do not. It should not wait for a general
sweep.

---

## Recommended order

1. **`gps-acknowledgment.tsx`** — consent must be readable. Five strings.
2. **Root screens (16)** — login, PIN setup, GPS consent. These render before or
   around language selection and set the first impression.
3. **The seven installer screens above (60 of the 90)** — expenses, schedule, qa,
   diary, defects, checklist-run first.
4. **Native-speaker pass** on `sync.pending` (pl) and `sync.offline` (pl, ro).
5. **Decide on `(admin)`** and write the decision down either way.
6. **Comment the Lithuanian `many` omission** in `lib/i18n.ts`.

## How to keep it from regressing

There is no check today that a new screen uses `t()`. The cheapest guard is a
lint rule or a test that greps `app/(installer)/` for JSX text nodes matching
`>[A-Z][a-z ]{6,}<` and fails above an agreed baseline — ratcheting the number
down rather than trying to reach zero in one pass. The counts in this document
are the starting baseline.

---

## Method

Counts reproduced with:

```bash
# key comparison, including nested plural objects
node -e "...flatten and diff locales/*.json..."

# hardcoded user-facing strings
grep -rnoE ">[A-Z][a-zA-Z ,'\.\?\!-]{6,60}<" app components --include=*.tsx
```

The grep is deliberately loose and will catch some false positives (a string
that is genuinely a proper noun, a value interpolated oddly). It is a baseline
to ratchet, not a precise figure. Nothing in this document was taken from
memory; every count came from the files as they stand at the date above.
