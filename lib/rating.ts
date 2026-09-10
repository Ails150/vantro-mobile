import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';

const COUNT_KEY = 'vantro_successful_signouts';
const ASKED_KEY = 'vantro_rating_asked_at';

/** Ask after this many completed shifts. */
const THRESHOLD = 3;

/**
 * Only a sign out the server accepted counts.
 *
 * A queued one has not happened yet as far as anyone else is concerned, and
 * asking someone to rate the app moments after it failed to reach the server is
 * how you collect one star reviews.
 */
export async function recordSuccessfulSignOut(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(COUNT_KEY);
    const next = (parseInt(raw || '0', 10) || 0) + 1;
    await AsyncStorage.setItem(COUNT_KEY, String(next));
  } catch {}
}

/**
 * True exactly once, on the run after the third accepted sign out.
 *
 * The flag is written by markRatingAsked before the prompt is shown, not after
 * it is answered: the OS review dialog reports nothing back, and a prompt that
 * is only recorded on success would ask again every time it was dismissed.
 */
export async function shouldPromptForRating(): Promise<boolean> {
  try {
    if (await AsyncStorage.getItem(ASKED_KEY)) return false;
    const count = parseInt((await AsyncStorage.getItem(COUNT_KEY)) || '0', 10) || 0;
    if (count < THRESHOLD) return false;
    // isAvailableAsync is false on a device with no store (an emulator without
    // Play Services), and hasAction covers the store being present but unable
    // to take a review right now.
    if (!(await StoreReview.isAvailableAsync())) return false;
    return await StoreReview.hasAction();
  } catch {
    return false;
  }
}

export async function markRatingAsked(): Promise<void> {
  try { await AsyncStorage.setItem(ASKED_KEY, new Date().toISOString()); } catch {}
}

export async function requestReview(): Promise<void> {
  try { await StoreReview.requestReview(); } catch {}
}
