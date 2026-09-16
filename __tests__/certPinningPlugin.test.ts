import { describe, it, expect } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"
import { CERT_PINS } from "../lib/certPins"

/**
 * The plugin that actually writes the pins into the native project.
 *
 * __tests__/deviceIntegrity.test.ts covers lib/certPins.ts, which is where the
 * pins live and which generates the XML for reference. It does not cover THIS
 * file, and that distinction cost a build:
 *
 *   Error: [android.dangerous]: withCertPinning: could not read "hostname"
 *   from lib/certPins.ts. Refusing to build an unpinned app.
 *
 * The plugin parses certPins.ts with a regex built from a template literal, and
 * `\s` inside a template literal is not an escape -- it collapses to a bare "s"
 * before RegExp sees it. The pattern needed zero-or-more letter s where the
 * source has a space, so it matched nothing and the plugin's own fail-closed
 * guard fired.
 *
 * It was invisible locally because `expo config --type prebuild` does NOT run
 * dangerous mods. Nothing short of a real prebuild, or a direct call like the
 * ones below, reaches this code at all. That is the gap these tests fill: the
 * pins being right in certPins.ts means nothing if the thing that copies them
 * into the APK cannot read them.
 */

const ROOT = path.resolve(__dirname, "..")
// A config plugin is plain CommonJS run by Node during prebuild, so it is
// required the same way prebuild requires it, not imported as a module.
const plugin = require(path.join(ROOT, "plugins", "withCertPinning.js"))

describe("the plugin can read the pins it is supposed to write", () => {
  const pins = plugin.readPins(ROOT)

  it("parses every field out of lib/certPins.ts", () => {
    expect(pins.hostname).toBe(CERT_PINS.hostname)
    expect(pins.intermediate).toBe(CERT_PINS.intermediate)
    expect(pins.root).toBe(CERT_PINS.root)
    expect(pins.expires).toBe(CERT_PINS.expires)
  })

  it("reads them, rather than carrying its own copy", () => {
    // Two copies of a pin set is how an app ships with the wrong one. If the
    // plugin source contains a pin literal, the parsing has been given up on.
    const src = fs.readFileSync(path.join(ROOT, "plugins", "withCertPinning.js"), "utf8")
    expect(src).not.toContain(CERT_PINS.intermediate)
    expect(src).not.toContain(CERT_PINS.root)
  })
})

describe("it refuses rather than shipping an unpinned app", () => {
  /** Write a certPins.ts into a throwaway project root. */
  function fixture(contents: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "certpins-"))
    fs.mkdirSync(path.join(dir, "lib"))
    fs.writeFileSync(path.join(dir, "lib", "certPins.ts"), contents)
    return dir
  }

  it("throws when a field is missing", () => {
    const dir = fixture(`export const CERT_PINS = { hostname: 'x.example' } as const;`)
    expect(() => plugin.readPins(dir)).toThrow(/could not read "intermediate"/)
  })

  it("throws when the file is not there at all", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "certpins-"))
    expect(() => plugin.readPins(dir)).toThrow()
  })

  it("names the field it could not read", () => {
    // The build machine only shows this message. "Prebuild failed" with no
    // field name is forty minutes of guessing.
    const dir = fixture(`export const CERT_PINS = {\n  hostname: 'x.example',\n  intermediate: 'aaa',\n  root: 'bbb',\n} as const;`)
    expect(() => plugin.readPins(dir)).toThrow(/"expires"/)
  })
})

describe("the whitespace the parser has to survive", () => {
  function parse(body: string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "certpins-"))
    fs.mkdirSync(path.join(dir, "lib"))
    fs.writeFileSync(path.join(dir, "lib", "certPins.ts"), body)
    return plugin.readPins(dir)
  }

  const fields = (sep: string) =>
    `export const CERT_PINS = {\n  hostname:${sep}'a.example',\n` +
    `  intermediate:${sep}'AAA=',\n  root:${sep}'BBB=',\n  expires:${sep}'2027-03-16',\n} as const;`

  it("a space after the colon, which is what the real file has", () => {
    // THE EXACT CASE THAT FAILED. The broken pattern allowed only letter s
    // here, so the real file -- with an ordinary space -- never matched.
    expect(parse(fields(" ")).hostname).toBe("a.example")
  })

  it("no space at all", () => {
    expect(parse(fields("")).hostname).toBe("a.example")
  })

  it("a tab, and a line break", () => {
    expect(parse(fields("\t")).hostname).toBe("a.example")
    expect(parse(fields("\n    ")).hostname).toBe("a.example")
  })

  it("double quotes, if the file is ever reformatted", () => {
    const src = `export const CERT_PINS = {\n  hostname: "a.example",\n  intermediate: "AAA=",\n  root: "BBB=",\n  expires: "2027-03-16",\n} as const;`
    expect(parse(src).intermediate).toBe("AAA=")
  })
})

describe("the Android XML it writes", () => {
  const xml = plugin.androidXml(plugin.readPins(ROOT))

  it("carries both pins and the expiry", () => {
    expect(xml).toContain(CERT_PINS.intermediate)
    expect(xml).toContain(CERT_PINS.root)
    expect(xml).toContain(`expiration="${CERT_PINS.expires}"`)
  })

  it("pins only our own hostname, and forbids cleartext", () => {
    expect(xml).toContain(`>${CERT_PINS.hostname}<`)
    expect(xml).toContain('includeSubdomains="false"')
    expect(xml).not.toContain('cleartextTrafficPermitted="true"')
  })

  it("is well formed enough to be parsed", () => {
    // Android silently ignores a malformed network security config in some
    // builds, which is an unpinned app that looks pinned.
    const opens = (xml.match(/<pin /g) || []).length
    const closes = (xml.match(/<\/pin>/g) || []).length
    expect(opens).toBe(2)
    expect(closes).toBe(2)
    expect(xml.trimStart().startsWith("<?xml")).toBe(true)
  })
})

describe("the plugin is actually wired into the app config", () => {
  it("app.json lists it", () => {
    // A plugin nobody references writes nothing, and every test above would
    // still pass.
    const app = JSON.parse(fs.readFileSync(path.join(ROOT, "app.json"), "utf8"))
    const plugins = JSON.stringify(app.expo?.plugins || [])
    expect(plugins).toContain("withCertPinning")
  })
})
