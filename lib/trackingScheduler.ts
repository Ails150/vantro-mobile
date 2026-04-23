import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { evaluateTrackingState } from './locationTracker';

const SCHEDULER_TASK = 'vantro-tracking-scheduler';

// Define the background fetch task - runs every ~15 min even when app is closed
TaskManager.defineTask(SCHEDULER_TASK, async () => {
  try {
    console.log('[scheduler] background fetch fired at', new Date().toISOString());
    await evaluateTrackingState();
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (e) {
    console.error('[scheduler] background fetch failed', e);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// Register the background fetch task - call once at app startup
export async function registerTrackingScheduler() {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (status === BackgroundFetch.BackgroundFetchStatus.Restricted || status === BackgroundFetch.BackgroundFetchStatus.Denied) {
      console.log('[scheduler] background fetch not available:', status);
      return false;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(SCHEDULER_TASK);
    if (isRegistered) {
      console.log('[scheduler] already registered');
      return true;
    }

    await BackgroundFetch.registerTaskAsync(SCHEDULER_TASK, {
      minimumInterval: 15 * 60, // 15 min (OS may delay this)
      stopOnTerminate: false,
      startOnBoot: true,
    });

    console.log('[scheduler] registered');
    return true;
  } catch (e) {
    console.error('[scheduler] register failed', e);
    return false;
  }
}

export async function unregisterTrackingScheduler() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(SCHEDULER_TASK);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(SCHEDULER_TASK);
      console.log('[scheduler] unregistered');
    }
  } catch (e) {
    console.error('[scheduler] unregister failed', e);
  }
}