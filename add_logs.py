path = "C:\\vantro-mobile\\app\\(installer)\\diary.tsx"
with open(path, "r", encoding="utf-8") as f:
    c = f.read()

# Add log to submit() wrapper
c = c.replace(
    "setShowStatusModal(true);\n    }",
    "console.log('[DIARY-TAP] submit() called, showing modal');\n      setShowStatusModal(true);\n    }"
)

# Add log to handleStatusTap
c = c.replace(
    "setPendingWorkStatus(status);\n      setShowStatusModal(false);",
    "console.log('[DIARY-TAP] tapped status:', status);\n      setPendingWorkStatus(status);\n      setShowStatusModal(false);"
)

with open(path, "w", encoding="utf-8") as f:
    f.write(c)

print("Logs added. Restart expo with: npx expo start --clear")
