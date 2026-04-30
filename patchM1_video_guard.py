"""
Vantro Mobile - Patch M1 (CRITICAL: video upload data loss fix)
=================================================================
The mobile diary screen silently accepts a NULL video URL when the
Cloudflare upload fails, then inserts a diary row labelled "Video entry"
with no actual video. ~30% of video diary submissions hit this path.

Two changes to app/(installer)/diary.tsx:

1. After uploadVideo() returns, if the user attached a video but the URL
   is null, abort the submit and show an error. The diary row is NEVER
   inserted with a missing video.

2. The offline queue payload didn't include videoUrl. Added (defensive;
   not the primary cause).

Run from C:\\vantro-mobile:
    python patchM1_video_guard.py

After this patches successfully you must run:
    eas build --platform android --profile preview
to rebuild the APK. The patch only changes source — Liam needs the new build.
"""
import os
import sys
import shutil
import datetime

ROOT = r"C:\vantro-mobile"
TARGET = os.path.join(ROOT, "app", "(installer)", "diary.tsx")
BACKUP_DIR = os.path.join(ROOT, "_backups")


# Replacement 1: after uploadVideo, abort if video attached but URL is null
GUARD_OLD = '''      let videoUrl: string | null = null;
      if (video) {
        console.log('[DIARY] uploading video');
        const online2 = await isOnline();
        if (online2) {
          try { videoUrl = await uploadVideo(video); console.log('[DIARY] video uploaded result=', videoUrl); }
          catch (err) { console.log('[DIARY] video upload FAILED', err); }
        }
      }'''

GUARD_NEW = '''      let videoUrl: string | null = null;
      if (video) {
        console.log('[DIARY] uploading video');
        const online2 = await isOnline();
        if (!online2) {
          Alert.alert('Need internet', 'Video uploads require an internet connection. Please connect and try again. Your text and photos are saved here.');
          setLoading(false); setUploading(false);
          return;
        }
        try { videoUrl = await uploadVideo(video); console.log('[DIARY] video uploaded result=', videoUrl); }
        catch (err) { console.log('[DIARY] video upload FAILED', err); }

        // CRITICAL: do not submit diary entry if video upload failed.
        // Otherwise we end up with a "Video entry" row with video_url = NULL.
        if (!videoUrl) {
          Alert.alert(
            'Video upload failed',
            'The video did not upload to the server. Please check your connection and try again. Your text and photos are still here.'
          );
          setLoading(false); setUploading(false);
          return;
        }
      }'''


# Replacement 2: queueAction payload missing videoUrl
QUEUE_OLD = '''        await queueAction({ type: 'diary', payload: { jobId: id, entryText: text.trim() || 'ðŸ“· Photo entry', photoUrls } });'''

QUEUE_NEW = '''        await queueAction({ type: 'diary', payload: { jobId: id, entryText: text.trim() || 'Photo entry', photoUrls, videoUrl } });'''


def patch(text: str, old: str, new: str, label: str) -> tuple[str, bool]:
    if new in text and old not in text:
        print(f"  [skip] {label} already patched")
        return text, True
    if old not in text:
        print(f"  [FAIL] {label} -- pattern not found")
        return text, False
    return text.replace(old, new, 1), True


def main() -> int:
    if not os.path.isfile(TARGET):
        print(f"ERROR: target not found: {TARGET}")
        return 1

    os.makedirs(BACKUP_DIR, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = os.path.join(BACKUP_DIR, f"diary.tsx.{stamp}.bak")
    shutil.copy2(TARGET, backup_path)
    print(f"[1/3] Backup -> {backup_path}")

    text = open(TARGET, "r", encoding="utf-8").read()
    text, ok1 = patch(text, GUARD_OLD, GUARD_NEW, "video upload guard")
    text, ok2 = patch(text, QUEUE_OLD, QUEUE_NEW, "offline queue includes videoUrl")

    if not all([ok1, ok2]):
        print(f"[FAIL] One or more patches failed. Restoring backup.")
        shutil.copy2(backup_path, TARGET)
        return 2

    with open(TARGET, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print(f"[2/3] Wrote {TARGET}")

    body = open(TARGET, "r", encoding="utf-8").read()
    markers = [
        "Video upload failed",
        "Need internet",
        "did not upload to the server",
        "videoUrl } });",
    ]
    missing = [m for m in markers if m not in body]
    if missing:
        print(f"[3/3] FAIL -- markers missing: {missing}")
        shutil.copy2(backup_path, TARGET)
        return 3
    print(f"[3/3] OK -- all {len(markers)} markers present")
    print()
    print("Next steps:")
    print("  cd C:\\vantro-mobile")
    print("  git add \"app/(installer)/diary.tsx\"")
    print('  git commit -m "fix(diary): abort submit when video upload fails (no more silent NULLs)"')
    print("  git push origin master")
    print()
    print("Then rebuild APK:")
    print("  eas build --platform android --profile preview")
    print("  (~15 min build, install on phone or send to Liam)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
