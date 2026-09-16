// lib/deviceIntegrity.ts
//
// Refuse to run on a rooted or jailbroken device.
//
// WHY THIS IS WORTH DOING AT ALL, given that root detection is defeatable.
//
// Everything protecting the field token on a normal phone assumes the operating
// system is enforcing its own rules. expo-secure-store puts the token in the
// Android keystore or the iOS keychain, and the whole guarantee is that no
// other app can read it. On a rooted device that guarantee is gone: any process
// with root reads the keystore, and the token is good for up to ninety days
// against a company's real site data.
//
// So this is not an anti-tamper measure and does not pretend to be. Somebody
// determined will patch it out of the APK in an afternoon. It is there for the
// far more common case: a worker who rooted their own phone years ago for
// something unrelated and has no idea their employer's attendance records are
// now readable by every app they install.
//
// THE MESSAGE MATTERS AS MUCH AS THE CHECK. "Security error" tells that person
// nothing and gets the app uninstalled. They need to know what is wrong, that
// it is about the phone rather than about them, and what to do next.

import * as Device from 'expo-device';
import { Platform } from 'react-native';

export type IntegrityResult = {
  /** True when the app should refuse to continue. */
  blocked: boolean;
  /** Shown to the worker. Plain, specific, and not accusatory. */
  title: string;
  message: string;
  /** For the log. Never shown. */
  reason: 'rooted' | 'emulator' | 'ok' | 'unknown';
};

const OK: IntegrityResult = {
  blocked: false,
  title: '',
  message: '',
  reason: 'ok',
};

/**
 * Is this device rooted or jailbroken?
 *
 * expo-device's check is explicitly experimental and can be wrong in both
 * directions. A FALSE POSITIVE locks a worker out of their job, which is worse
 * than the risk being mitigated, so this only blocks on a positive result and
 * treats any error as "cannot tell, let them in" -- the opposite of the field
 * token check, and for the opposite reason. There, failing closed refuses a
 * request the worker can retry. Here, failing closed refuses the whole app.
 */
export async function checkDeviceIntegrity(): Promise<IntegrityResult> {
  // A simulator or emulator is not a security problem; it is how the app is
  // developed and demonstrated. Never blocked.
  if (!Device.isDevice) return OK;

  try {
    const rooted = await Device.isRootedExperimentalAsync();
    if (!rooted) return OK;

    return {
      blocked: true,
      reason: 'rooted',
      title:
        Platform.OS === 'ios'
          ? 'This iPhone appears to be jailbroken'
          : 'This phone appears to be rooted',
      message:
        Platform.OS === 'ios'
          ? 'Vantro cannot run on a jailbroken iPhone. Your sign-in details and your ' +
            'company’s site records are kept in the iPhone’s secure storage, and a ' +
            'jailbreak lets other apps read it.\n\n' +
            'Nothing is wrong with your account. Use a phone that has not been ' +
            'jailbroken, or speak to your supervisor.'
          : 'Vantro cannot run on a rooted phone. Your sign-in details and your ' +
            'company’s site records are kept in the phone’s secure storage, and ' +
            'root access lets other apps read it.\n\n' +
            'Nothing is wrong with your account. Use a phone that has not been ' +
            'rooted, or speak to your supervisor.',
    };
  } catch {
    // Cannot tell. Let them work.
    return { ...OK, reason: 'unknown' };
  }
}
