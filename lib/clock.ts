// lib/clock.ts
//
// Shift times as an installer reads them off a clock.
//
// Device local time on purpose, not a pinned zone: the person looking at this
// is standing on the site, so "signed in at 07:42" has to agree with the phone
// in their hand and the clock on the wall.

function two(n: number): string {
  return String(n).padStart(2, '0');
}

/** "07:42". Empty string for a missing or unparseable timestamp. */
export function clockTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${two(d.getHours())}:${two(d.getMinutes())}`;
}
