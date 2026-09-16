import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"

/**
 * Where credentials are kept, asserted against the source.
 *
 * The brief asked for the field token to be moved from AsyncStorage to
 * expo-secure-store. It was ALREADY in secure-store -- so rather than change
 * working code, this pins it there, because the failure mode is somebody adding
 * a convenient AsyncStorage write months from now and nobody noticing.
 *
 * AsyncStorage on Android is an unencrypted SQLite file in the app sandbox. On
 * a rooted device, in an ADB backup, or to any process that escapes its
 * sandbox, it is plain text. expo-secure-store uses the Android keystore and
 * the iOS keychain.
 */

const ROOT = path.resolve(__dirname, "..")

/** Every source file, excluding the places that are not ours. */
function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".git", ".expo", "dist", "__tests__", "android", "ios"]
        .includes(entry.name)) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) { walk(full); continue }
      if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
    }
  }
  walk(ROOT)
  return out
}

const FILES = sourceFiles()

/** Keys that must only ever live in secure storage. */
const SECRET_KEYS = ["vantro_token", "installer_pin", "vantro_user"]

describe("the scan finds the source", () => {
  it("is looking at real files", () => {
    // Without this the assertions below pass on an empty list.
    expect(FILES.length).toBeGreaterThan(10)
    expect(FILES.some(f => f.endsWith("api.ts"))).toBe(true)
  })
})

describe("credentials live in secure storage, never in AsyncStorage", () => {
  it("every use of a secret key is a SecureStore call", () => {
    // Line-precise, not file-precise. The first version of this test flagged
    // app/login.tsx because the file mentions installer_pin AND imports
    // AsyncStorage -- but the PIN goes through SecureStore and the AsyncStorage
    // call is an unrelated gps_acknowledged flag. A security test that cries
    // wolf on correct code gets switched off, so it checks the LINE.
    const offenders: string[] = []
    for (const file of FILES) {
      const lines = fs.readFileSync(file, "utf8").split(String.fromCharCode(10))
      lines.forEach((line, i) => {
        for (const key of SECRET_KEYS) {
          if (!line.includes(key)) continue
          // A line naming a secret key must either be a SecureStore call or
          // not be a storage call at all (a type, a comment, a constant).
          if (line.includes("AsyncStorage")) {
            offenders.push(`${path.relative(ROOT, file)}:${i + 1} puts ${key} in AsyncStorage`)
          }
        }
      })
    }
    expect(offenders, offenders.join("; ")).toEqual([])
  })

  it("no AsyncStorage call names a token, pin, password or secret", () => {
    const offenders: string[] = []
    const re = /AsyncStorage\.(set|get|remove)Item\w*\(\s*[`'"]([^`'"]+)/g
    for (const file of FILES) {
      const src = fs.readFileSync(file, "utf8")
      for (const m of src.matchAll(re)) {
        if (/token|pin|password|secret|auth|jwt|credential/i.test(m[2])) {
          offenders.push(`${path.relative(ROOT, file)}: AsyncStorage key "${m[2]}"`)
        }
      }
    }
    expect(offenders, offenders.join("; ")).toEqual([])
  })

  it("the token is read from SecureStore", () => {
    const api = fs.readFileSync(path.join(ROOT, "lib", "api.ts"), "utf8")
    expect(api).toContain("expo-secure-store")
    expect(api).toMatch(/SecureStore\.getItemAsync\(\s*['"]vantro_token['"]/)
  })
})

describe("nothing logs a credential", () => {
  it("no console call prints a token or PIN value", () => {
    // Logging that a token is ABSENT is fine and useful -- "no token in
    // SecureStore, /jobs will 401" is exactly the breadcrumb you want. Logging
    // the value is not. This looks for the second.
    const offenders: string[] = []
    const re = /console\.(log|warn|error|info|debug)\(([^)]*)\)/g
    for (const file of FILES) {
      const src = fs.readFileSync(file, "utf8")
      for (const m of src.matchAll(re)) {
        const args = m[2]
        // A bare identifier or property named token/pin being passed as a
        // value, rather than the word appearing inside a string literal.
        if (/(^|[,\s(])(token|pin|jwt|password|secret)\b(?![\w'"])/.test(
          args.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, ""),
        )) {
          offenders.push(`${path.relative(ROOT, file)}: console.${m[1]}(${args.slice(0, 60)})`)
        }
      }
    }
    expect(offenders, offenders.join("; ")).toEqual([])
  })
})

describe("Sentry is configured not to collect what it must not", () => {
  const sentry = fs.readFileSync(path.join(ROOT, "lib", "sentry.ts"), "utf8")

  it("sendDefaultPii is OFF", () => {
    // It was true, which sends request headers -- and every request carries the
    // field token in an Authorization header.
    expect(sentry).toMatch(/sendDefaultPii:\s*false/)
    expect(sentry).not.toMatch(/sendDefaultPii:\s*true/)
  })

  it("session replay masks text, images and vectors", () => {
    // This app has a PIN pad on its sign-in screen.
    expect(sentry).toMatch(/maskAllText:\s*true/)
    expect(sentry).toMatch(/maskAllImages:\s*true/)
    expect(sentry).toMatch(/maskAllVectors:\s*true/)
  })

  it("the scrubbing hooks are wired in", () => {
    expect(sentry).toMatch(/beforeSend:\s*scrubEvent/)
    expect(sentry).toMatch(/beforeBreadcrumb:\s*scrubBreadcrumb/)
  })
})
