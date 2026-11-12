import { describe, expect, it } from "vitest";
import { backoffDelayMs, classifyResponse, MIN_BACKOFF_MS, parseRetryAfter } from "@/lib/ntfy/backoff";

describe("reconnect backoff", () => {
  it("never retries faster than five seconds", () => {
    expect(backoffDelayMs(0, null, 0)).toBe(MIN_BACKOFF_MS);
    expect(backoffDelayMs(1, null, 0)).toBe(10_000);
    expect(backoffDelayMs(2, null, 0)).toBe(20_000);
    expect(backoffDelayMs(0, 1, 0)).toBe(MIN_BACKOFF_MS);
    expect(backoffDelayMs(0, 30, 0)).toBe(30_000);
    expect(backoffDelayMs(0, 10_000, 0)).toBe(15 * 60 * 1000);
  });

  it("classifies 429 as rate limited and a success as open, without a bot status", () => {
    expect(classifyResponse(429, 0, 1, 0)).toEqual({
      kind: "wait",
      phase: "rate_limited",
      waitMs: 5_000,
      attempt: 1,
    });
    expect(classifyResponse(200, 3, null, 0)).toEqual({ kind: "open" });
    expect(classifyResponse(503, 1, null, 0).kind).toBe("wait");
    expect(JSON.stringify(classifyResponse(429, 0, null, 0))).not.toContain("working");
    expect(JSON.stringify(classifyResponse(200, 0, null, 0))).not.toContain("idle");
  });

  it("parses retry-after seconds and ignores a past date", () => {
    expect(parseRetryAfter("12", 0)).toBe(12);
    expect(parseRetryAfter("not-a-date", 0)).toBeNull();
    const past = new Date(Date.now() - 60_000).toUTCString();
    expect(parseRetryAfter(past, Date.now())).toBeNull();
  });
});
