import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

export type WalkthroughQueueItem = {
  id: string;                    // local UUID
  jobId: string;
  jobName: string;
  localUri: string;              // file:// path on device
  durationSeconds: number;
  lat: number | null;
  lng: number | null;
  recordedAt: string;            // ISO
  status: "pending" | "uploading" | "synced" | "failed";
  attempts: number;
  lastError: string | null;
  lastAttemptAt: string | null;
  streamUid: string | null;      // set after Cloudflare upload (so we can resume)
  walkthroughId: string | null;  // set after server upload-clip POST succeeds
};

const QUEUE_KEY = "vantro_walktalk_queue";
const MAX_ATTEMPTS = 10;

function genId(): string {
  return "wt_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
}

export async function listQueue(): Promise<WalkthroughQueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveQueue(items: WalkthroughQueueItem[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export async function addToQueue(input: {
  jobId: string;
  jobName: string;
  sourceUri: string;             // file:// from camera
  durationSeconds: number;
  lat: number | null;
  lng: number | null;
}): Promise<WalkthroughQueueItem> {
  const id = genId();

  // Copy video to a permanent location (cache may be cleared)
  const dir = FileSystem.documentDirectory + "walktalks/";
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const persistentUri = dir + id + ".mp4";
  await FileSystem.copyAsync({ from: input.sourceUri, to: persistentUri });

  const item: WalkthroughQueueItem = {
    id,
    jobId: input.jobId,
    jobName: input.jobName,
    localUri: persistentUri,
    durationSeconds: input.durationSeconds,
    lat: input.lat,
    lng: input.lng,
    recordedAt: new Date().toISOString(),
    status: "pending",
    attempts: 0,
    lastError: null,
    lastAttemptAt: null,
    streamUid: null,
    walkthroughId: null,
  };

  const queue = await listQueue();
  queue.push(item);
  await saveQueue(queue);

  console.log("[walktalk-queue] added", id, "duration=", input.durationSeconds);
  return item;
}

export async function updateItem(id: string, patch: Partial<WalkthroughQueueItem>): Promise<void> {
  const queue = await listQueue();
  const idx = queue.findIndex(q => q.id === id);
  if (idx === -1) return;
  queue[idx] = { ...queue[idx], ...patch };
  await saveQueue(queue);
}

export async function deleteItem(id: string, deleteFile: boolean = true): Promise<void> {
  const queue = await listQueue();
  const item = queue.find(q => q.id === id);
  if (item && deleteFile) {
    await FileSystem.deleteAsync(item.localUri, { idempotent: true }).catch((e) => {
      console.warn("[walktalk-queue] file delete failed:", e?.message);
    });
  }
  const next = queue.filter(q => q.id !== id);
  await saveQueue(next);
  console.log("[walktalk-queue] removed", id);
}

export async function getPendingCount(): Promise<number> {
  const queue = await listQueue();
  return queue.filter(q => q.status === "pending" || q.status === "uploading" || q.status === "failed").length;
}

export async function getActivelyPendingCount(): Promise<number> {
  // Count for the badge — exclude failed (those need manual retry)
  const queue = await listQueue();
  return queue.filter(q => q.status === "pending" || q.status === "uploading").length;
}

export async function nextPendingItem(): Promise<WalkthroughQueueItem | null> {
  const queue = await listQueue();
  return queue.find(q => q.status === "pending" && q.attempts < MAX_ATTEMPTS) ?? null;
}

export async function resetItemForRetry(id: string): Promise<void> {
  await updateItem(id, { status: "pending", lastError: null, attempts: 0 });
}

export const QUEUE_MAX_ATTEMPTS = MAX_ATTEMPTS;


export async function clearAllQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
  console.log("[walktalk-queue] CLEARED ALL");
}
