"""
add_schedule_link.py
Run from C:\\vantro-mobile:    python add_schedule_link.py

Adds a calendar icon button to the Jobs screen header that navigates to /schedule.
Single surgical edit. Idempotent.

Result in jobs.tsx header:
  Before:  [name + role]                                 [Sign out]
  After:   [name + role]  [calendar icon link]           [Sign out]
"""
import os, sys

TARGET = os.path.join("app", "(installer)", "jobs.tsx")


def main():
    cwd = os.getcwd()
    if not cwd.lower().endswith("vantro-mobile"):
        print(f"WARNING: cwd is {cwd}")
        print("Run from C:\\vantro-mobile. Continue? (y/n)")
        if input().strip().lower() != "y":
            sys.exit(1)

    full = os.path.join(cwd, TARGET)
    if not os.path.exists(full):
        print(f"ERROR: {TARGET} not found")
        sys.exit(1)

    with open(full, "r", encoding="utf-8") as f:
        src = f.read()

    # Idempotent guard
    if "schedule_link_marker" in src:
        print(f"  already patched")
        return

    # 1) Make sure Ionicons is imported
    if "from '@expo/vector-icons'" not in src:
        # Add import near the other imports (after expo-router import)
        anchor = "import { useRouter } from 'expo-router';"
        if anchor not in src:
            print("  ERROR: can't find router import to anchor Ionicons import")
            sys.exit(1)
        src = src.replace(
            anchor,
            anchor + "\nimport { Ionicons } from '@expo/vector-icons';"
        )

    # 2) Add the schedule link button to the header.
    # Anchor on the existing Sign out TouchableOpacity in the header.
    old_header = """        <TouchableOpacity onPress={() => { logout(); router.replace('/login'); }} style={s.signOutBtn}>
          <Text style={s.signOutText}>Sign out</Text>
        </TouchableOpacity>"""

    new_header = """        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {/* schedule_link_marker */}
          <TouchableOpacity onPress={() => router.push('/schedule' as any)} style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="calendar-outline" size={18} color={C.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { logout(); router.replace('/login'); }} style={s.signOutBtn}>
            <Text style={s.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>"""

    if old_header not in src:
        print("  ERROR: header structure has changed since I last looked")
        print("  Look for the Sign out button manually and add the schedule link next to it")
        sys.exit(1)

    src = src.replace(old_header, new_header)

    with open(full, "w", encoding="utf-8", newline="\n") as f:
        f.write(src)

    print(f"  PATCHED: {TARGET}")
    print()
    print("Calendar icon added to top-right of Jobs header (next to Sign out).")
    print()
    print("Test:  npx expo start  -> tap the calendar icon")


if __name__ == "__main__":
    main()
