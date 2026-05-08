import NetInfo from "@react-native-community/netinfo";
import { authFetch } from "./api";
import {
  listQueue,
  updateItem,
  deleteItem,
  nextPendingItem,
  WalkthroughQueueItem,
  QUEUE_MAX_ATTEMPTS,
} from "./walktalk-queue";

let isProcessing = false;
let intervalHandle: any = null;
const TICK_MS = 30000;  // try every 30 seconds while online

async function isOnline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return !!(state.isConnected && state.isInternetReachable !== false);
  } catch {
    return true;  // optimistic — let upload attempt fail naturally if not
  }
}

async function uploadOne(item: WalkthroughQueueItem): Promise<void> {
  console.log("[uploader] processing", item.id, "attempt=", item.attempts + 1);

  await updateItem(item.id, {
    status: "uploading",
    attempts: item.attempts + 1,
    lastAttemptAt: new Date().toISOString(),
    lastError: null,
  });

  try {
    let streamUid = item.streamUid;
    let playbackUrl: string | null = null;

    // Phase 1: Get upload URL + upload to Cloudflare (skip if already done)
    if (!streamUid) {
      console.log("[uploader] requesting Cloudflare upload URL");
      const urlRes = await authFetch("/api/stream/upload-url", { method: "POST" });
      if (!urlRes.ok) {
        const txt = await urlRes.text().catch(() => "");
        throw new Error("Upload URL request failed: " + urlRes.status + " " + txt);
      }
      const { uploadURL, uid, playbackUrl: pUrl } = await urlRes.json();
      streamUid = uid;
      playbackUrl = pUrl;

      console.log("[uploader] uploading bytes to Cloudflare uid=", uid);
      const formData = new FormData();
      formData.append("file", { uri: item.localUri, name: item.id + ".mp4", type: "video/mp4" } as any);
      const cfRes = await fetch(uploadURL, { method: "POST", body: formData });
      if (!cfRes.ok) {
        throw new Error("Cloudflare upload failed: " + cfRes.status);
      }

      // Persist streamUid so we can resume from here on retry
      await updateItem(item.id, { streamUid: uid });
    } else {
      console.log("[uploader] resuming with existing streamUid=", streamUid);
    }

    // Phase 2: Tell our server about it (this triggers waitUntil background processing)
    console.log("[uploader] notifying server");
    const saveRes = await authFetch("/api/walkthroughs/upload-clip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: item.jobId,
        streamUid,
        playbackUrl,
        durationSeconds: item.durationSeconds,
        lat: item.lat,
        lng: item.lng,
      }),
    });

    if (!saveRes.ok) {
      const errBody = await saveRes.json().catch(() => ({}));
      if (errBody.capReached) {
        await updateItem(item.id, {
          status: "failed",
          lastError: "Monthly limit reached — recording kept on device for next month",
        });
        return;
      }
      throw new Error("Server save failed: " + saveRes.status + " " + (errBody.error || ""));
    }

    const { walkthrough_id } = await saveRes.json();

    // Phase 3: Mark synced + delete local file (server has the bytes, processing is queued)
    console.log("[uploader] SYNCED", item.id, "walkthrough_id=", walkthrough_id);
    await updateItem(item.id, {
      status: "synced",
      walkthroughId: walkthrough_id,
    });

    // Delete from queue + remove local file
    await deleteItem(item.id, true);
  } catch (e: any) {
    const msg = e.message || String(e);
    console.error("[uploader] failed", item.id, msg);
    const newAttempts = item.attempts + 1;
    const final = newAttempts >= QUEUE_MAX_ATTEMPTS;
    await updateItem(item.id, {
      status: final ? "failed" : "pending",
      lastError: msg,
    });
  }
}

export async function tickUploader(): Promise<void> {
  if (isProcessing) {
    console.log("[uploader] tick skipped (already processing)");
    return;
  }

  const online = await isOnline();
  if (!online) {
    console.log("[uploader] tick skipped (offline)");
    return;
  }

  const next = await nextPendingItem();
  if (!next) return;

  isProcessing = true;
  try {
    await uploadOne(next);
  } finally {
    isProcessing = false;
  }

  // Chain — try the next one immediately if there is one
  const more = await nextPendingItem();
  if (more) {
    setTimeout(() => tickUploader(), 1000);
  }
}

export function startUploader(): void {
  if (intervalHandle) return;
  console.log("[uploader] starting");
  // Run immediately on start
  tickUploader();
  // Then every 30 seconds
  intervalHandle = setInterval(tickUploader, TICK_MS);

  // Also run when network comes back
  NetInfo.addEventListener(state => {
    if (state.isConnected && state.isInternetReachable !== false) {
      console.log("[uploader] network restored, kicking uploader");
      tickUploader();
    }
  });
}

export function stopUploader(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

// Manual retry (called from queue UI)
export async function manualRetry(itemId: string): Promise<void> {
  const queue = await listQueue();
  const item = queue.find(q => q.id === itemId);
  if (!item) return;
  await updateItem(itemId, { status: "pending", attempts: 0, lastError: null });
  tickUploader();
}
