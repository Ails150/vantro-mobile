import * as Sentry from '@sentry/react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';
import { scrubBreadcrumb, scrubEvent } from './sentryScrub';

// A crash is only actionable if we know which build threw it. Sentry defaults
// the release to the native package name it can read at runtime, which is the
// same string for every version we have ever shipped, so every stack trace
// lands in one undifferentiated bucket. These derive the release and dist the
// way Sentry expects them, from the values the build itself was stamped with.

const bundleId =
  Application.applicationId ??
  Constants.expoConfig?.android?.package ??
  Constants.expoConfig?.ios?.bundleIdentifier ??
  'com.getvantro.app';

const version =
  Application.nativeApplicationVersion ??
  Constants.expoConfig?.version ??
  '0.0.0';

// The native build number, not the marketing version: two APKs can share
// version 1.3.0 and differ entirely, and this is what tells them apart.
const buildNumber =
  Application.nativeBuildVersion ??
  String(
    Platform.OS === 'android'
      ? Constants.expoConfig?.android?.versionCode ?? ''
      : Constants.expoConfig?.ios?.buildNumber ?? ''
  ) ??
  '0';

/**
 * `com.getvantro.app@1.3.0+19` - the format the Sentry CLI derives when it
 * uploads source maps, so a runtime event and its artifacts meet on the same
 * release name. Diverge from it and the maps silently fail to apply.
 */
export const SENTRY_RELEASE = `${bundleId}@${version}+${buildNumber}`;

/**
 * An OTA update replaces the JS inside a native build, so `release` alone stops
 * identifying the running code. The update id distinguishes them; an embedded
 * launch has none and falls back to the build number.
 */
export const SENTRY_DIST = Updates.isEmbeddedLaunch
  ? buildNumber
  : Updates.updateId ?? buildNumber;

export function initSentry() {
  Sentry.init({
    dsn: 'https://8d46d924fa77ce817367dcd92e4ff885@o4511309963591680.ingest.de.sentry.io/4511336232321104',

    release: SENTRY_RELEASE,
    dist: SENTRY_DIST,
    environment: __DEV__ ? 'development' : Updates.channel || 'production',

    // OFF. It was true, which sends IP addresses, cookies and request headers
    // -- and every request from this app carries the field token in an
    // Authorization header. A ninety-day bearer credential for a company's
    // real site data does not belong in an error tracker.
    sendDefaultPii: false,

    // Enable Logs
    enableLogs: true,

    // Session Replay, with masking stated rather than relied upon as a default.
    // This app has a PIN pad on its sign-in screen and a map of where people
    // have been; a replay that captured either would be worse than having no
    // replay at all.
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1,
    integrations: [
      Sentry.mobileReplayIntegration({
        maskAllText: true,
        maskAllImages: true,
        maskAllVectors: true,
      }),
      Sentry.feedbackIntegration(),
    ],

    // The belt to the masking's braces. lib/sentryScrub.ts strips bearer
    // tokens, JWTs, PINs and coordinates out of events and breadcrumbs, and is
    // unit tested -- a scrubbing rule that lives only inside a config object is
    // one nobody can prove.
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });

  // Searchable on their own, so "every crash on the build we shipped Tuesday"
  // or "only devices still on the embedded bundle" is one query rather than a
  // scan through individual events.
  Sentry.setTags({
    'app.version': version,
    'app.build': buildNumber,
    'expo.channel': Updates.channel ?? 'none',
    'expo.runtimeVersion': Updates.runtimeVersion ?? 'unknown',
    'expo.updateId': Updates.updateId ?? 'embedded',
  });
}
