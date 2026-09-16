// lib/sentryScrub.ts
//
// What must never reach Sentry, and the functions that strip it.
//
// Kept apart from initSentry() so it can be unit tested. A scrubbing rule that
// only exists inside a config object is a rule nobody can prove.
//
// THREE THINGS, and each is here for a different reason:
//
//   The field token   is a bearer credential good for up to ninety days
//                     against a company's real site data. It travels in an
//                     Authorization header on every request, and a fetch
//                     breadcrumb records headers.
//   The PIN           is what a worker types to sign in. It is kept in the
//                     keystore and must not be copied into an error report.
//   Location          is the most sensitive thing this product holds. A
//                     workforce app that leaks where somebody was standing has
//                     failed at the one thing its users did not choose to
//                     share.

/** Header names that carry a credential, lower-cased. */
const SECRET_HEADERS = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'apikey',
];

/** Keys whose VALUE is sensitive wherever it appears in a payload. */
const SECRET_KEYS = [
  'token', 'access_token', 'refresh_token', 'id_token', 'jwt',
  'pin', 'pin_hash', 'password', 'secret', 'apikey', 'api_key',
  'authorization', 'cookie',
  // Location. Not a credential, but the thing we least want in a crash report.
  'lat', 'lng', 'latitude', 'longitude', 'coords', 'location',
];

export const REDACTED = '[redacted]';

/** A JWT anywhere in a string, whatever surrounds it. */
const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
/** "Bearer <anything>" in a header value or a log line. */
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;

/** Strip credentials out of any string. */
export function scrubString(input: string): string {
  return String(input)
    .replace(JWT_RE, REDACTED)
    .replace(BEARER_RE, `Bearer ${REDACTED}`);
}

/**
 * Walk any structure and redact sensitive keys and token-shaped strings.
 *
 * Depth-limited: a Sentry payload can contain a cyclic-ish object graph, and a
 * scrubber that hangs turns an error report into a hung app.
 */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return value;
  if (typeof value === 'string') return scrubString(value);
  if (Array.isArray(value)) return value.map(v => scrubValue(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.includes(k.toLowerCase())
        ? REDACTED
        : scrubValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Remove credential-bearing headers entirely rather than redacting in place. */
export function scrubHeaders(
  headers: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!headers) return headers;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = SECRET_HEADERS.includes(k.toLowerCase()) ? REDACTED : scrubValue(v);
  }
  return out;
}

/** Sentry beforeSend. Returns the event with everything sensitive removed. */
export function scrubEvent(event: any): any {
  if (!event) return event;

  if (event.request) {
    event.request.headers = scrubHeaders(event.request.headers);
    if (event.request.cookies) event.request.cookies = REDACTED;
    if (typeof event.request.url === 'string') {
      event.request.url = scrubString(event.request.url);
    }
    if (event.request.data) event.request.data = scrubValue(event.request.data);
  }

  // The user object. An id is useful for support; an email or an IP is not
  // worth the exposure on a product that also knows where people stood.
  if (event.user) {
    event.user = { id: event.user.id };
  }

  if (event.extra) event.extra = scrubValue(event.extra);
  if (event.contexts) event.contexts = scrubValue(event.contexts);
  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb).filter(Boolean);
  }
  if (typeof event.message === 'string') event.message = scrubString(event.message);

  return event;
}

/** Sentry beforeBreadcrumb. */
export function scrubBreadcrumb(crumb: any): any {
  if (!crumb) return crumb;
  const out = { ...crumb };
  if (typeof out.message === 'string') out.message = scrubString(out.message);
  if (out.data) out.data = scrubValue(out.data);
  return out;
}
