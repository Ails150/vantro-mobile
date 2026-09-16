import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"
import { execFileSync } from "child_process"

/**
 * Every dependency must be installable on the Node version EAS builds with.
 *
 * Written after a release build died in INSTALL_DEPENDENCIES with:
 *
 *   error vitest@5.0.1: The engine "node" is incompatible with this module.
 *   Expected version "^22.12.0 || ^24.0.0 || >=26.0.0". Got "20.19.4"
 *
 * A TEST RUNNER took the APK down. That is worth understanding rather than just
 * fixing, because nothing about it is obvious:
 *
 *  - EAS installs with YARN CLASSIC, which treats an `engines` mismatch as a
 *    hard error. npm only warns, so `npm install` succeeded locally and every
 *    local test passed while the build was already broken.
 *  - EAS installs devDependencies too (`--production false`) -- it needs babel
 *    and typescript -- so "it is only a test dependency" is no protection.
 *  - The node version is pinned in eas.json, not inherited from the machine, so
 *    upgrading the laptop's node hides the problem rather than finding it.
 *
 * The gap between "tests pass" and "a build exists" was a forty-seven second
 * failure nobody would see until they went looking for the APK. This closes it.
 */

const ROOT = path.resolve(__dirname, "..")
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"))
const eas = JSON.parse(fs.readFileSync(path.join(ROOT, "eas.json"), "utf8"))

/** The Node the build machine will actually run, from eas.json. */
function buildNodeVersions(): { profile: string; node: string }[] {
  const out: { profile: string; node: string }[] = []
  for (const [profile, cfg] of Object.entries<any>(eas.build || {})) {
    if (cfg && typeof cfg.node === "string") out.push({ profile, node: cfg.node })
  }
  return out
}

/**
 * Resolve installed packages from disk -- the tree yarn would also build.
 *
 * Walked once and cached: reading 866 manifests off a Windows filesystem takes
 * the better part of seven seconds, and doing it per assertion times the suite
 * out rather than telling anybody anything.
 */
function readInstalledPackages(): { name: string; version: string; engines?: any }[] {
  const modules = path.join(ROOT, "node_modules")
  if (!fs.existsSync(modules)) return []
  const out: { name: string; version: string; engines?: any }[] = []
  const read = (dir: string) => {
    const file = path.join(dir, "package.json")
    if (!fs.existsSync(file)) return
    try {
      const p = JSON.parse(fs.readFileSync(file, "utf8"))
      if (p.name) out.push({ name: p.name, version: p.version, engines: p.engines })
    } catch { /* a malformed manifest is not this test's business */ }
  }
  for (const entry of fs.readdirSync(modules, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === ".bin" || entry.name === ".cache") continue
    if (entry.name.startsWith("@")) {
      const scope = path.join(modules, entry.name)
      for (const inner of fs.readdirSync(scope, { withFileTypes: true })) {
        if (inner.isDirectory()) read(path.join(scope, inner.name))
      }
      continue
    }
    read(path.join(modules, entry.name))
  }
  return out
}

const INSTALLED = readInstalledPackages()
function installedPackages() { return INSTALLED }

describe("the build node is pinned and known", () => {
  it("every build profile names a node version", () => {
    // Without a pin the build machine's default moves under us, and this whole
    // test has nothing to check against.
    const profiles = Object.keys(eas.build || {})
    const pinned = buildNodeVersions().map(v => v.profile)
    expect(profiles.length).toBeGreaterThan(0)
    expect(pinned.sort()).toEqual(profiles.sort())
  })

  it("names a specific version, not a range", () => {
    for (const { profile, node } of buildNodeVersions()) {
      expect(node, `eas.json build.${profile}.node`).toMatch(/^\d+\.\d+\.\d+$/)
    }
  })
})

describe("no dependency refuses the build node", () => {
  const targets = buildNodeVersions()

  it("is checking a real installed tree", () => {
    // Without this the assertion below passes on an empty list, which is how a
    // guard test quietly stops guarding.
    const installed = installedPackages()
    expect(installed.length).toBeGreaterThan(100)
    expect(installed.some(p => p.name === "expo")).toBe(true)
    expect(installed.some(p => p.engines?.node)).toBe(true)
  })

  for (const { profile, node } of targets) {
    it(`${profile} profile: node ${node} satisfies every declared engine`, () => {
      const semver = require(path.join(ROOT, "node_modules", "semver"))
      const offenders: string[] = []
      for (const p of installedPackages()) {
        const range = p.engines?.node
        if (!range || typeof range !== "string") continue
        // A range npm cannot parse is not evidence of a problem.
        if (!semver.validRange(range)) continue
        if (!semver.satisfies(node, range)) {
          offenders.push(`${p.name}@${p.version} wants node "${range}"`)
        }
      }
      expect(
        offenders,
        `yarn classic FAILS the build on these, npm only warns:\n  ${offenders.join("\n  ")}`,
      ).toEqual([])
    })
  }
})

describe("direct dependencies", () => {
  it("declares vitest at a version the build node accepts", () => {
    // Named explicitly because this is the one that actually broke a build, and
    // a range like ^5 would let an incompatible major back in on a fresh
    // install -- which is exactly how it arrived, since the lockfile is not
    // committed and EAS resolves from scratch every time.
    const declared = pkg.devDependencies?.vitest
    expect(declared).toBeTruthy()
    expect(declared, "vitest 5 requires node >= 22.12; eas.json pins 20.19.4").not.toMatch(/\^?5\./)
  })
})
