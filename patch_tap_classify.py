# -*- coding: utf-8 -*-
import re

# ============================================================
# PART 1: Mobile — add the 3-tap modal to diary.tsx
# ============================================================

path = "C:\\vantro-mobile\\app\\(installer)\\diary.tsx"
with open(path, "r", encoding="utf-8") as f:
    c = f.read()

m = re.search(r"async function submit\s*\(\s*\)\s*\{", c)
if not m:
    print("ERROR: Could not find 'async function submit()' in diary.tsx")
    exit(1)

body_match = re.search(
    r"res = await authFetch\(\x27/api/diary\x27,\s*\{\s*method:\s*\x27POST\x27,\s*headers:\s*\{\s*\x27Content-Type\x27:\s*\x27application/json\x27\s*\},\s*body:\s*JSON\.stringify\(\{\s*jobId:\s*id,\s*entryText:[^}]+\}\)\s*\}\);",
    c
)
if not body_match:
    print("ERROR: Could not find the POST call inside submit()")
    exit(1)

old_body = body_match.group(0)
new_body = old_body.replace(
    "body: JSON.stringify({ jobId: id, entryText: text.trim() || (video ? 'Video entry' : 'Photo entry'), photoUrls, videoUrl })",
    "body: JSON.stringify({ jobId: id, entryText: text.trim() || (video ? 'Video entry' : 'Photo entry'), photoUrls, videoUrl, workStatus: pendingWorkStatus })"
)
c = c.replace(old_body, new_body)

c = c.replace("async function submit()", "async function doSubmit()")

first_usestate = re.search(r"const \[loading, setLoading\] = useState\(false\);", c)
if not first_usestate:
    print("ERROR: Could not find loading useState")
    exit(1)

state_inject = (
    "\n  const [showStatusModal, setShowStatusModal] = useState(false);"
    "\n  const [pendingWorkStatus, setPendingWorkStatus] = useState(null);"
)
c = c[:first_usestate.end()] + state_inject + c[first_usestate.end():]

do_submit_pos = c.find("async function doSubmit()")
if do_submit_pos == -1:
    print("ERROR: doSubmit not found after rename")
    exit(1)

wrapper_lines = [
    "async function submit() {",
    "    if (!text.trim() && photos.length === 0 && !video) {",
    "      Alert.alert('Empty', 'Add a note, photo or video first');",
    "      return;",
    "    }",
    "    setShowStatusModal(true);",
    "  }",
    "",
    "  async function handleStatusTap(status) {",
    "    setPendingWorkStatus(status);",
    "    setShowStatusModal(false);",
    "    setTimeout(() => { doSubmit(); }, 50);",
    "  }",
    "",
    "  "
]
wrapper = "\n  ".join(wrapper_lines)
c = c[:do_submit_pos] + wrapper + c[do_submit_pos:]

# Make sure Modal is imported
first_import = re.search(r"import\s*\{([^}]+)\}\s*from\s*\x27react-native\x27;", c)
if first_import:
    existing = first_import.group(1)
    if "Modal" not in existing:
        new_import_body = existing.rstrip() + ", Modal"
        c = c[:first_import.start()] + "import { " + new_import_body.strip() + " } from 'react-native';" + c[first_import.end():]
        print("Added Modal to react-native import.")
else:
    print("WARNING: Could not find react-native import line.")

# Unicode characters — defined as separate vars so Python escaping is clean
GREEN = "\U0001F7E2"
YELLOW = "\U0001F7E1"
RED = "\U0001F534"
MDASH = "\u2014"

modal_jsx = (
    "<Modal visible={showStatusModal} transparent animationType='fade' onRequestClose={() => setShowStatusModal(false)}>\n"
    "        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: 20 }}>\n"
    "          <View style={{ backgroundColor: '#1a2635', borderRadius: 16, padding: 24 }}>\n"
    "            <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: 6 }}>Quick question</Text>\n"
    "            <Text style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginBottom: 24 }}>Is work still going?</Text>\n"
    "\n"
    "            <TouchableOpacity onPress={() => handleStatusTap('carrying_on')} style={{ backgroundColor: 'rgba(0,212,160,0.12)', borderWidth: 1, borderColor: 'rgba(0,212,160,0.35)', borderRadius: 12, padding: 16, marginBottom: 10 }}>\n"
    "              <Text style={{ fontSize: 16, fontWeight: '700', color: '#00d4a0' }}>" + GREEN + " Yes, carrying on</Text>\n"
    "              <Text style={{ fontSize: 13, color: 'rgba(0,212,160,0.7)', marginTop: 2 }}>Just logging this for the record</Text>\n"
    "            </TouchableOpacity>\n"
    "\n"
    "            <TouchableOpacity onPress={() => handleStatusTap('paused')} style={{ backgroundColor: 'rgba(251,191,36,0.12)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.35)', borderRadius: 12, padding: 16, marginBottom: 10 }}>\n"
    "              <Text style={{ fontSize: 16, fontWeight: '700', color: '#fbbf24' }}>" + YELLOW + " Paused, sorting it</Text>\n"
    "              <Text style={{ fontSize: 13, color: 'rgba(251,191,36,0.7)', marginTop: 2 }}>Under an hour, fix in motion</Text>\n"
    "            </TouchableOpacity>\n"
    "\n"
    "            <TouchableOpacity onPress={() => handleStatusTap('stopped')} style={{ backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)', borderRadius: 12, padding: 16, marginBottom: 16 }}>\n"
    "              <Text style={{ fontSize: 16, fontWeight: '700', color: '#ef4444' }}>" + RED + " Stopped " + MDASH + " need help</Text>\n"
    "              <Text style={{ fontSize: 13, color: 'rgba(239,68,68,0.7)', marginTop: 2 }}>Admin and foreman alerted now</Text>\n"
    "            </TouchableOpacity>\n"
    "\n"
    "            <TouchableOpacity onPress={() => setShowStatusModal(false)} style={{ padding: 10, alignItems: 'center' }}>\n"
    "              <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)' }}>Cancel</Text>\n"
    "            </TouchableOpacity>\n"
    "          </View>\n"
    "        </View>\n"
    "      </Modal>\n"
    "      "
)

offline_banner_anchor = c.find("{offline && <View style={s.offlineBanner}>")
if offline_banner_anchor == -1:
    print("WARNING: Could not find offline banner anchor. Modal JSX not inserted.")
else:
    c = c[:offline_banner_anchor] + modal_jsx + c[offline_banner_anchor:]
    print("Modal JSX inserted before offline banner.")

with open(path, "w", encoding="utf-8") as f:
    f.write(c)

print("Mobile diary.tsx patched: modal + workStatus added.")

# ============================================================
# PART 2: Server
# ============================================================

server_path = "C:\\vantro\\app\\api\\diary\\route.ts"
with open(server_path, "r", encoding="utf-8") as f:
    s = f.read()

old_ai_block = (
    "      messages: [{\n"
    "        role: \"user\",\n"
    "        content: `Analyze this diary entry and classify it. Reply with JSON only: {\"alert_type\": \"blocker|issue|normal\", \"summary\": \"brief summary\", \"urgency\": 1-5}\n"
    "\n"
    "Entry: ${entryText}`\n"
    "      }]"
)

new_ai_block = (
    "      messages: [{\n"
    "        role: \"user\",\n"
    "        content: `Write a one-sentence summary of this construction site diary entry for the foreman. Plain language, no jargon, under 20 words. Just the facts.\n"
    "\n"
    "Entry: ${entryText}\n"
    "\n"
    "Respond with the summary sentence only, no JSON, no preamble.`\n"
    "      }]"
)

if old_ai_block not in s:
    print("WARNING: Could not find exact AI block to replace.")
else:
    s = s.replace(old_ai_block, new_ai_block)
    print("AI prompt replaced.")

old_parse = (
    "    const raw = completion.content[0].type === \"text\" ? completion.content[0].text : \"{}\"\n"
    "    let parsed\n"
    "    try {\n"
    "      parsed = JSON.parse(raw.replace(/```json|```/g, \"\").trim())\n"
    "    } catch {\n"
    "      parsed = { alert_type: \"normal\", summary: entryText.slice(0, 50), urgency: 1 }\n"
    "    }\n"
    "\n"
    "    const aiAlertType = parsed.alert_type || \"normal\"\n"
    "    const aiSummary = parsed.summary || entryText.slice(0, 50)\n"
    "    const urgency = parsed.urgency || 1"
)

new_parse = (
    "    const aiSummary = completion.content[0].type === \"text\"\n"
    "      ? completion.content[0].text.trim().replace(/^[\"']|[\"']$/g, \"\")\n"
    "      : entryText.slice(0, 80)\n"
    "\n"
    "    // Installer-driven classification. AI only writes the summary.\n"
    "    const statusToAlert: Record<string, string> = {\n"
    "      carrying_on: \"normal\",\n"
    "      paused: \"issue\",\n"
    "      stopped: \"blocker\"\n"
    "    }\n"
    "    const aiAlertType = statusToAlert[workStatus || \"carrying_on\"] || \"normal\"\n"
    "    const urgency = aiAlertType === \"blocker\" ? 5 : aiAlertType === \"issue\" ? 3 : 1\n"
    "    console.log(\"[diary] Classified by installer tap:\", workStatus, \"->\", aiAlertType)"
)

if old_parse not in s:
    print("WARNING: Could not find exact parse block to replace.")
else:
    s = s.replace(old_parse, new_parse)
    print("Parse block replaced.")

m2 = re.search(r"const\s*\{[^}]*entryText[^}]*\}\s*=\s*(body|await request\.json\(\))", s)
if m2:
    old_destr = m2.group(0)
    if "workStatus" not in old_destr:
        new_destr = old_destr.replace("entryText", "entryText, workStatus")
        s = s.replace(old_destr, new_destr)
        print("Added workStatus to destructure.")
    else:
        print("workStatus already in destructure.")
else:
    print("WARNING: Could not find body destructure for entryText.")

with open(server_path, "w", encoding="utf-8") as f:
    f.write(s)

print("Server route.ts patched.")
