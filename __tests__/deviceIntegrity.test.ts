import { describe, it, expect, beforeEach } from "vitest"
import * as Device from "expo-device"
import { Platform } from "react-native"
import { checkDeviceIntegrity } from "../lib/deviceIntegrity"
import {
  CERT_PINS, androidNetworkSecurityConfig, daysUntilPinExpiry,
  iosPinnedDomains, pinsNeedRollover,
} from "../lib/certPins"

const device = Device as any
const rn = { Platform } as any

beforeEach(() => {
  device.__setDevice(true)
  device.__setRooted(false)
  Platform.OS = "android"
})

describe("root and jailbreak detection", () => {
  it("lets an ordinary phone through", async () => {
    const r = await checkDeviceIntegrity()
    expect(r.blocked).toBe(false)
    expect(r.reason).toBe("ok")
  })

  it("blocks a rooted phone", async () => {
    device.__setRooted(true)
    const r = await checkDeviceIntegrity()
    expect(r.blocked).toBe(true)
    expect(r.reason).toBe("rooted")
  })

  it("never blocks a simulator, which is how the app is developed", async () => {
    device.__setDevice(false)
    device.__setRooted(true)
    const r = await checkDeviceIntegrity()
    expect(r.blocked).toBe(false)
  })

  it("FAILS OPEN when the check itself errors", async () => {
    // The opposite of the field token check, and for the opposite reason.
    // There, failing closed refuses one request a worker can retry. Here it
    // would refuse the whole app, and expo-device's detection is explicitly
    // experimental -- a false positive locks somebody out of their job, which
    // is worse than the risk being mitigated.
    device.__setRooted(new Error("cannot determine"))
    const r = await checkDeviceIntegrity()
    expect(r.blocked).toBe(false)
    expect(r.reason).toBe("unknown")
  })
})

describe("the message a blocked worker sees", () => {
  it("says what is wrong, not just that something is", async () => {
    device.__setRooted(true)
    const r = await checkDeviceIntegrity()
    expect(r.title.toLowerCase()).toContain("rooted")
    expect(r.message).toContain("secure storage")
  })

  it("makes clear it is the phone and not the person", async () => {
    device.__setRooted(true)
    const r = await checkDeviceIntegrity()
    // A worker at a site gate needs to know their account is fine and what to
    // do next, or the app just gets uninstalled.
    expect(r.message).toContain("Nothing is wrong with your account")
    expect(r.message.toLowerCase()).toContain("supervisor")
  })

  it("uses the right word on iOS", async () => {
    Platform.OS = "ios"
    device.__setRooted(true)
    const r = await checkDeviceIntegrity()
    expect(r.title.toLowerCase()).toContain("jailbroken")
    expect(r.title.toLowerCase()).not.toContain("rooted")
  })

  it("never leaks anything technical into the message", async () => {
    device.__setRooted(true)
    const r = await checkDeviceIntegrity()
    expect(r.message).not.toMatch(/su\b|busybox|magisk|cydia|error|stack/i)
  })
})

describe("certificate pins", () => {
  it("pins the intermediate and a backup root, never the leaf", () => {
    // A leaf pin would brick every installed copy on the next Let's Encrypt
    // renewal, roughly every sixty days, with no recovery but a store update
    // the worker has to install before they can sign in.
    expect(CERT_PINS.intermediate).toMatch(/^[A-Za-z0-9+/]{43}=$/)
    expect(CERT_PINS.root).toMatch(/^[A-Za-z0-9+/]{43}=$/)
    expect(CERT_PINS.intermediate).not.toBe(CERT_PINS.root)
  })

  it("has a backup pin at all", () => {
    // A pin set with one entry is the configuration that takes an app down
    // when a CA rotates unexpectedly.
    const pins = [CERT_PINS.intermediate, CERT_PINS.root].filter(Boolean)
    expect(pins.length).toBeGreaterThanOrEqual(2)
  })

  it("is not inside its thirty day rollover window", () => {
    // THIS IS THE TEST THAT MATTERS OVER TIME. It fails thirty days before
    // enforcement lapses, which is the prompt to ship a build with fresh pins.
    // If it is failing, that is the feature working.
    const days = daysUntilPinExpiry()
    expect(
      pinsNeedRollover(),
      `certificate pins expire in ${days} days - refresh CERT_PINS and ship a build`,
    ).toBe(false)
  })

  it("knows when it IS inside the window", () => {
    const soon = new Date(Date.parse(`${CERT_PINS.expires}T00:00:00Z`) - 10 * 86400000)
    expect(pinsNeedRollover(soon)).toBe(true)
    const later = new Date(Date.parse(`${CERT_PINS.expires}T00:00:00Z`) + 86400000)
    expect(daysUntilPinExpiry(later)).toBeLessThan(0)
  })
})

describe("the generated platform config", () => {
  const xml = androidNetworkSecurityConfig()

  it("carries both pins and the expiry", () => {
    expect(xml).toContain(CERT_PINS.intermediate)
    expect(xml).toContain(CERT_PINS.root)
    expect(xml).toContain(`expiration="${CERT_PINS.expires}"`)
  })

  it("pins only our own hostname", () => {
    // Pinning a host we do not control makes somebody else's key rotation our
    // outage.
    expect(xml).toContain(CERT_PINS.hostname)
    expect(xml).toContain('includeSubdomains="false"')
  })

  it("forbids cleartext", () => {
    expect(xml).toContain('cleartextTrafficPermitted="false"')
    expect(xml).not.toContain('cleartextTrafficPermitted="true"')
  })

  it("is generated, so the pins cannot drift from the constants", () => {
    expect(xml).toContain("GENERATED from lib/certPins.ts")
  })

  it("produces the iOS equivalent with the same pins", () => {
    const plist = iosPinnedDomains() as any
    const entry = plist[CERT_PINS.hostname]
    expect(entry).toBeTruthy()
    const spki = entry.NSPinnedCAIdentities.map((e: any) => e["SPKI-SHA256-BASE64"])
    expect(spki).toContain(CERT_PINS.intermediate)
    expect(spki).toContain(CERT_PINS.root)
  })
})
