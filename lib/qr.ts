/**
 * Vantro QR payloads.
 *
 * Encoded as links on the app's own `vantro:` scheme (registered in app.json),
 * so a phone's built in camera opens the app on the right screen rather than
 * showing an unreadable blob of JSON. `v` is the payload version: a reader from
 * an older build can tell "I do not understand this yet" apart from "this is
 * not one of ours", which is the difference between a useful message and
 * "invalid code".
 *
 * IMPORTANT: a worker code is an IDENTIFIER, not a credential. It says who
 * someone claims to be, the way a name badge does. Anyone who photographs the
 * screen has the same string, so nothing that grants access may ever be keyed
 * off it alone - the server still decides, from the bearer token of whoever is
 * scanning.
 */

export const QR_VERSION = 1;
const SCHEME = 'vantro';

export type WorkerPayload = {
  kind: 'worker';
  version: number;
  userId: string;
  companyId: string;
};

export type JobPayload = {
  kind: 'job';
  version: number;
  jobId: string;
};

export type VantroPayload = WorkerPayload | JobPayload;

/** Why a scan was rejected, so the UI can say something specific. */
export type ParseFailure =
  | { ok: false; reason: 'not_vantro' }
  | { ok: false; reason: 'unsupported_version'; version: number }
  | { ok: false; reason: 'unknown_kind'; kind: string }
  | { ok: false; reason: 'malformed' };

export type ParseResult = { ok: true; payload: VantroPayload } | ParseFailure;

export function buildWorkerQr(userId: string, companyId: string): string {
  const u = new URL(`${SCHEME}://worker/${encodeURIComponent(userId)}`);
  u.searchParams.set('c', companyId);
  u.searchParams.set('v', String(QR_VERSION));
  return u.toString();
}

export function buildJobQr(jobId: string): string {
  const u = new URL(`${SCHEME}://job/${encodeURIComponent(jobId)}`);
  u.searchParams.set('v', String(QR_VERSION));
  return u.toString();
}

export function parseVantroQr(raw: string): ParseResult {
  const text = (raw || '').trim();
  if (!text) return { ok: false, reason: 'malformed' };

  // Cheap reject before constructing a URL: the scanner fires this on every
  // frame it resolves, including every unrelated barcode the camera happens
  // across, and most of them are not ours.
  if (!text.toLowerCase().startsWith(`${SCHEME}://`)) return { ok: false, reason: 'not_vantro' };

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  // react-native's URL puts the first segment in `host` for a custom scheme,
  // but hostless parses land it in the path instead. Read both rather than
  // depending on which one a given engine chose.
  const segments = [url.host, ...url.pathname.split('/')].map(s => decodeURIComponent(s || '')).filter(Boolean);
  const kind = (segments[0] || '').toLowerCase();
  const id = segments[1] || '';

  const rawVersion = url.searchParams.get('v');
  const version = rawVersion == null ? QR_VERSION : Number(rawVersion);
  if (!Number.isFinite(version)) return { ok: false, reason: 'malformed' };
  if (version > QR_VERSION) return { ok: false, reason: 'unsupported_version', version };

  if (kind === 'worker') {
    const companyId = url.searchParams.get('c') || '';
    if (!id || !companyId) return { ok: false, reason: 'malformed' };
    return { ok: true, payload: { kind: 'worker', version, userId: id, companyId } };
  }

  if (kind === 'job') {
    if (!id) return { ok: false, reason: 'malformed' };
    return { ok: true, payload: { kind: 'job', version, jobId: id } };
  }

  return { ok: false, reason: 'unknown_kind', kind };
}
