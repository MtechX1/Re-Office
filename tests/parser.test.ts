import { describe, expect, it } from "vitest";
import {
  parseOfficePayload,
  parseTransportPayload,
  shouldOpenInboundUrl,
  valueContainsTopic,
} from "@/lib/ntfy/parser";

const SECRET = "topic-must-not-leak";

describe("office payload parser", () => {
  it("accepts a status object and rejects a bad status", () => {
    expect(parseOfficePayload({ bot: "RE Office Manager", status: "working", step: "Reading the floor" })).toEqual({
      ok: true,
      message: { kind: "status", bot: "RE Office Manager", status: "working", step: "Reading the floor" },
    });
    expect(parseOfficePayload({ bot: "RE Office Manager", status: "online", step: "Nope" }).ok).toBe(false);
    expect(parseOfficePayload({ bot: "RE Office Manager", status: "idle" }).ok).toBe(false);
  });

  it("requires a complete usage payload and does not fill missing numbers", () => {
    const parsed = parseOfficePayload({
      type: "usage",
      total_used_pct: 12.5,
      resets_at: "2026-12-01T00:00:00Z",
      bots: [{ bot: "RE Media Studio", used_pct: 1 }],
    });
    expect(parsed).toEqual({
      ok: true,
      message: {
        kind: "usage",
        total_used_pct: 12.5,
        resets_at: "2026-12-01T00:00:00Z",
        bots: [{ bot: "RE Media Studio", used_pct: 1 }],
      },
    });
    expect(parseOfficePayload({ type: "usage", total_used_pct: 10, resets_at: "2026-12-01" }).ok).toBe(false);
    expect(parseOfficePayload({ type: "usage", resets_at: "2026-12-01", bots: [] }).ok).toBe(false);
    expect(
      parseOfficePayload({
        type: "usage",
        total_used_pct: "10",
        resets_at: "2026-12-01",
        bots: [],
      }).ok,
    ).toBe(false);
  });

  it("keeps chat links closed and bounds text", () => {
    const parsed = parseOfficePayload({
      type: "chat",
      bot: "RE Leads Watch",
      text: "Flagged a note",
      url: "https://example.test/not-opened",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.message).toMatchObject({ autoOpen: false, url: "https://example.test/not-opened" });
    expect(shouldOpenInboundUrl("https://example.test/not-opened")).toBe(false);
    expect(parseOfficePayload({ type: "chat", bot: "RE Leads Watch", text: "x".repeat(1001) }).ok).toBe(false);
  });

  it("rejects forbidden keys, unknown types, and oversized transport bodies", () => {
    const polluted = JSON.parse(
      '{"type":"status","bot":"RE Office Manager","status":"done","step":"Ok","__proto__":{"admin":true}}',
    );
    expect(parseOfficePayload(polluted).ok).toBe(false);
    expect(parseOfficePayload({ type: "ping" }).ok).toBe(false);
    expect(parseTransportPayload("x".repeat(17000), 1)).toEqual({ type: "reject", reason: "too-large" });
    expect(parseTransportPayload("event: keepalive", 1)).toEqual({ type: "ignore" });
  });

  it("drops the ntfy envelope topic and still parses SSE data lines", () => {
    const envelope = JSON.stringify({
      id: "abc123",
      time: 1_762_000_000,
      event: "message",
      topic: SECRET,
      message: JSON.stringify({ bot: "RE Closing Desk", status: "idle", step: "Waiting" }),
    });
    const parsed = parseTransportPayload(envelope, 4);
    expect(parsed.type).toBe("message");
    expect(valueContainsTopic(parsed, SECRET)).toBe(false);
    if (parsed.type === "message") {
      expect(parsed.meta.eventId).toBe("abc123");
      expect(parsed.meta.receivedAt).toBe(new Date(1_762_000_000 * 1000).toISOString());
    }

    const sse = parseTransportPayload(
      'data: {"type":"looks","bot":"RE Media Studio","label":"Bay","note":"Lamp"}',
      2,
    );
    expect(sse.type).toBe("message");
  });

  it("parses roster, groups, and inactive routine shapes", () => {
    expect(
      parseOfficePayload({
        type: "roster",
        bots: [{ bot: "RE Listings Desk", name: "RE Listings Desk" }],
      }).ok,
    ).toBe(true);
    expect(
      parseOfficePayload({
        type: "groups",
        groups: [{ id: "media", name: "Studio", bots: ["RE Media Studio"] }],
      }).ok,
    ).toBe(true);
    expect(
      parseOfficePayload({
        type: "routines",
        bot: "RE Market Research",
        routines: [{ id: "morning", name: "Morning note" }],
      }).ok,
    ).toBe(true);
  });
});
