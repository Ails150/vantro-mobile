// lib/certPins.ts
//
// The certificate pins for app.getvantro.com, and the rollover window.
//
// WHAT IS PINNED, AND WHY NOT THE LEAF.
//
// The obvious thing is to pin the certificate the server presents. It is also
// the wrong thing: app.getvantro.com uses Let's Encrypt, whose certificates are
// valid for about ninety days and are renewed automatically. A leaf pin would
// brick every installed copy of the app on the next renewal, with no way to
// recover except a store update that the worker has to install before they can
// sign in.
//
// So the pin set is the ISSUING INTERMEDIATE plus the ROOT as backup. The
// intermediate survives every leaf renewal; the root survives an intermediate
// change. Both are pinned so that a rotation of one does not take the app down.
//
// THE THIRTY DAY ROLLOVER WINDOW is the `expires` date below, and it is the
// part people get wrong. A pin set with no expiry is a time bomb: the day the
// CA rotates a key that was not anticipated, every installed app stops working
// permanently. With an expiry, the platform STOPS ENFORCING the pins after that
// date and falls back to ordinary certificate validation -- degraded, but
// working, and it buys time to ship a build with a new pin set.
//
// The date must therefore always be at least thirty days ahead of the oldest
// still-installed build. Check it before every release; the test in
// __tests__/certPins.test.ts fails when it drifts inside the window.

/** SPKI SHA-256 pins, base64. Computed from the live chain on 16 Sept 2026. */
export const CERT_PINS = {
  hostname: 'app.getvantro.com',

  /**
   * Let's Encrypt intermediate "YR2". The primary pin: every leaf for this
   * hostname chains through it, so leaf renewal does not touch it.
   * Certificate valid to 2 September 2028.
   */
  intermediate: 'nWN7PSep5XDQdge5zK24CnCRXHr3KvzhKEGxsdqCX9E=',

  /**
   * ISRG "Root YR". The backup pin. Pinning a backup is not optional -- a pin
   * set with one entry and no backup is the configuration that takes an app
   * down when a CA rotates unexpectedly.
   * Certificate valid to 2 September 2032.
   */
  root: 'fk6IOKit1ild5647BH06ujSIq5XbCgqlbYl6ANhhi88=',

  /**
   * When enforcement stops.
   *
   * After this the platform validates certificates normally instead of failing
   * shut. Deliberately a fail-degraded rather than a fail-closed: a pinned app
   * that refuses to work is indistinguishable, to the worker standing at a
   * site gate, from an app that is broken.
   */
  expires: '2027-03-16',
} as const;

/** Days until enforcement lapses. Negative once it has. */
export function daysUntilPinExpiry(now: Date = new Date()): number {
  const expiry = Date.parse(`${CERT_PINS.expires}T00:00:00Z`);
  return Math.ceil((expiry - now.getTime()) / 86400000);
}

/**
 * Is the pin set inside its rollover window?
 *
 * True means a new build with a refreshed expiry has to ship within thirty
 * days. It is checked by a test rather than at runtime: the app cannot fix
 * this, only a release can.
 */
export function pinsNeedRollover(now: Date = new Date()): boolean {
  return daysUntilPinExpiry(now) <= 30;
}

/**
 * The Android network security config, as XML.
 *
 * Generated rather than hand-written so the pins and the expiry cannot drift
 * apart from the constants above. app.config.js writes it at build time.
 */
export function androidNetworkSecurityConfig(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- GENERATED from lib/certPins.ts. Do not edit by hand. -->
<network-security-config>
  <domain-config cleartextTrafficPermitted="false">
    <domain includeSubdomains="false">${CERT_PINS.hostname}</domain>
    <pin-set expiration="${CERT_PINS.expires}">
      <!-- Let's Encrypt intermediate YR2 -->
      <pin digest="SHA-256">${CERT_PINS.intermediate}</pin>
      <!-- ISRG Root YR, backup -->
      <pin digest="SHA-256">${CERT_PINS.root}</pin>
    </pin-set>
  </domain-config>
  <!-- Everything else keeps ordinary validation. Pinning a host we do not
       control means somebody else's rotation becomes our outage. -->
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
</network-security-config>
`;
}

/**
 * The iOS equivalent, for Info.plist NSPinnedDomains (iOS 14+).
 *
 * iOS has no expiry field, so the rollover is enforced by the release process
 * rather than by the platform. That asymmetry is why pinsNeedRollover() exists
 * and why a test fails on it.
 */
export function iosPinnedDomains(): Record<string, unknown> {
  return {
    [CERT_PINS.hostname]: {
      NSIncludesSubdomains: false,
      NSPinnedCAIdentities: [
        { 'SPKI-SHA256-BASE64': CERT_PINS.intermediate },
        { 'SPKI-SHA256-BASE64': CERT_PINS.root },
      ],
    },
  };
}
