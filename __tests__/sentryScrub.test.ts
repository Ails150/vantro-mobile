import { describe, it, expect } from "vitest"
import {
  REDACTED, scrubBreadcrumb, scrubEvent, scrubHeaders, scrubString, scrubValue,
} from "../lib/sentryScrub"

/**
 * What must never reach Sentry.
 *
 * Written because sendDefaultPii was TRUE, which sends request headers -- and
 * every request this app makes carries the field token in an Authorization
 * header. A ninety day bearer credential for a company's real site data was
 * going to an error tracker on every crash.
 */

// Shaped like a real one, signed with nothing.
const TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
  ".eyJ1c2VySWQiOiJhYmMiLCJjb21wYW55SWQiOiJkZWYifQ" +
  ".c2lnbmF0dXJlLWdvZXMtaGVyZQ"

describe("scrubString", () => {
  it("removes a JWT wherever it appears", () => {
    expect(scrubString(TOKEN)).toBe(REDACTED)
    expect(scrubString(`failed with ${TOKEN} at 09:04`)).not.toContain("eyJ")
    expect(scrubString(`failed with ${TOKEN} at 09:04`)).toContain("09:04")
  })

  it("removes a bearer value but keeps the word", () => {
    const out = scrubString(`Bearer ${TOKEN}`)
    expect(out).toContain("Bearer")
    expect(out).not.toContain("eyJ")
  })

  it("leaves ordinary text alone", () => {
    const msg = "Sign in failed: the site is out of range"
    expect(scrubString(msg)).toBe(msg)
  })

  it("does not choke on an empty or odd input", () => {
    expect(() => scrubString("")).not.toThrow()
    expect(scrubString("")).toBe("")
  })
})

describe("scrubHeaders", () => {
  it("removes every credential-bearing header", () => {
    const out = scrubHeaders({
      Authorization: `Bearer ${TOKEN}`,
      Cookie: "sb-abc-auth-token=xyz",
      "X-Api-Key": "secret",
      "Content-Type": "application/json",
    })!
    expect(out.Authorization).toBe(REDACTED)
    expect(out.Cookie).toBe(REDACTED)
    expect(out["X-Api-Key"]).toBe(REDACTED)
    // Harmless headers survive, or the report becomes useless.
    expect(out["Content-Type"]).toBe("application/json")
  })

  it("matches regardless of header casing", () => {
    const out = scrubHeaders({ authorization: `Bearer ${TOKEN}` })!
    expect(out.authorization).toBe(REDACTED)
  })

  it("handles no headers", () => {
    expect(scrubHeaders(undefined)).toBeUndefined()
  })
})

describe("scrubValue", () => {
  it("redacts a PIN by key name", () => {
    expect(scrubValue({ pin: "4821" })).toEqual({ pin: REDACTED })
    expect(scrubValue({ password: "hunter2" })).toEqual({ password: REDACTED })
    expect(scrubValue({ pin_hash: "$2a$10$abc" })).toEqual({ pin_hash: REDACTED })
  })

  it("redacts location, which is the most sensitive thing this app holds", () => {
    const out = scrubValue({ lat: 51.5074, lng: -0.1278, jobName: "Eddington" }) as any
    expect(out.lat).toBe(REDACTED)
    expect(out.lng).toBe(REDACTED)
    // Not everything is a secret; the report still has to be useful.
    expect(out.jobName).toBe("Eddington")
  })

  it("reaches into nested structures", () => {
    const out = scrubValue({
      response: { data: { token: TOKEN, ok: true } },
    }) as any
    expect(out.response.data.token).toBe(REDACTED)
    expect(out.response.data.ok).toBe(true)
  })

  it("redacts a token found in a VALUE even under an innocent key", () => {
    const out = scrubValue({ detail: `request failed: Bearer ${TOKEN}` }) as any
    expect(out.detail).not.toContain("eyJ")
  })

  it("walks arrays", () => {
    const out = scrubValue([{ token: TOKEN }, { ok: 1 }]) as any[]
    expect(out[0].token).toBe(REDACTED)
    expect(out[1].ok).toBe(1)
  })

  it("stops rather than hanging on a deep structure", () => {
    let deep: any = { v: 1 }
    for (let i = 0; i < 50; i++) deep = { nested: deep }
    expect(() => scrubValue(deep)).not.toThrow()
  })
})

describe("scrubEvent", () => {
  it("strips the Authorization header off a request", () => {
    const event = scrubEvent({
      request: {
        url: "https://app.getvantro.com/api/installer/jobs",
        headers: { Authorization: `Bearer ${TOKEN}` },
      },
    })
    expect(event.request.headers.Authorization).toBe(REDACTED)
  })

  it("reduces the user to an id", () => {
    // An email or an IP is not worth the exposure on a product that also knows
    // where people were standing.
    const event = scrubEvent({
      user: { id: "u1", email: "worker@example.com", ip_address: "1.2.3.4" },
    })
    expect(event.user).toEqual({ id: "u1" })
  })

  it("scrubs breadcrumbs, which is where fetch logs headers", () => {
    const event = scrubEvent({
      breadcrumbs: [
        { category: "fetch", data: { url: "/api/jobs", token: TOKEN } },
      ],
    })
    expect(event.breadcrumbs[0].data.token).toBe(REDACTED)
  })

  it("scrubs a token out of the message itself", () => {
    const event = scrubEvent({ message: `401 for Bearer ${TOKEN}` })
    expect(event.message).not.toContain("eyJ")
  })

  it("survives an empty or partial event", () => {
    expect(() => scrubEvent({})).not.toThrow()
    expect(scrubEvent(null)).toBeNull()
  })
})

describe("scrubBreadcrumb", () => {
  it("cleans the message and the data", () => {
    const out = scrubBreadcrumb({
      message: `calling with Bearer ${TOKEN}`,
      data: { pin: "4821", lat: 51.5 },
    })
    expect(out.message).not.toContain("eyJ")
    expect(out.data.pin).toBe(REDACTED)
    expect(out.data.lat).toBe(REDACTED)
  })
})
