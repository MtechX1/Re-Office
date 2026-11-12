import { describe, expect, it } from "vitest";
import { MEDIA_STUDIO_ID, OFFICE_BOTS } from "@/lib/office/allowlist";
import { applyInbound, assignOfficeSeat, createOfficeState, restoreRoster } from "@/lib/office/state";
import type { ParsedMessage } from "@/lib/ntfy/parser";

const meta = { eventId: "evt-1", receivedAt: null };

function apply(message: ParsedMessage, eventId = "evt-1") {
  return applyInbound(createOfficeState(), message, { ...meta, eventId });
}

describe("office state", () => {
  it("starts with no activity, no usage, and no invented bot status", () => {
    const state = createOfficeState();
    expect(state.activity).toEqual([]);
    expect(state.usage).toBeNull();
    expect(state.statuses).toEqual({});
    expect(state.seats).toHaveLength(8);
    expect(Object.keys(state.statuses)).toHaveLength(0);
  });

  it("records an allowlisted status and ignores older bots", () => {
    const allowed = apply({
      kind: "status",
      bot: "RE Leads Watch",
      status: "waiting_user",
      step: "Needs a person",
    });
    expect(allowed.statuses["7be15da5-b6fb-482d-af03-6a8bca938f30"]).toEqual({
      status: "waiting_user",
      step: "Needs a person",
    });
    expect(allowed.activity).toHaveLength(1);

    for (const name of [
      "Signal Prospector",
      "Clip Bot",
      "Visuals Bot",
      "Pipeline Pulse",
      "Stavy's Re Closer",
      "Transaction Bot",
      "Hollywood Bot",
      "RE HQ Coordinator",
      "63630cda-0d74-428a-a066-f5ae66bbcba3",
    ]) {
      const next = apply({ kind: "status", bot: name, status: "working", step: "Should not appear" }, `id-${name}`);
      expect(next.activity).toEqual([]);
      expect(next.statuses).toEqual({});
      expect(next.suppressedCount).toBe(1);
      expect(next.seats.map((seat) => seat.occupantId)).toEqual(createOfficeState().seats.map((seat) => seat.occupantId));
    }
  });

  it("filters usage rows and keeps the received total", () => {
    const next = apply({
      kind: "usage",
      total_used_pct: 40,
      resets_at: "2026-12-01T00:00:00Z",
      bots: [
        { bot: "Hollywood Bot", used_pct: 30 },
        { bot: "RE Media Studio", used_pct: 4 },
      ],
    });
    expect(next.usage).toEqual({
      totalUsedPct: 40,
      resetsAt: "2026-12-01T00:00:00Z",
      bots: [{ botId: MEDIA_STUDIO_ID, usedPct: 4 }],
      omittedRows: 1,
    });
    expect(JSON.stringify(next.activity)).not.toContain("Hollywood");
  });

  it("does not reopen chat urls and does not run routines", () => {
    const chat = apply({
      kind: "chat",
      bot: "RE Office Manager",
      text: "Desk check",
      url: "https://example.test/leave-closed",
      autoOpen: false,
    });
    expect(chat.activity[0]).toMatchObject({ url: "https://example.test/leave-closed", autoOpen: false });

    const routines = apply({
      kind: "routines",
      bot: "RE Market Research",
      routines: [{ id: "sweep", name: "Sweep" }],
    });
    expect(routines.routinesEnabled).toBe(false);
    expect(routines.inactiveRoutines).toEqual([
      { id: "sweep", name: "Sweep", botId: "2d5decd1-e475-4c78-9281-85fc6baca121" },
    ]);
    expect(routines.activity[0].text).toContain("not run");

    const blocked = apply({
      kind: "routines",
      bot: "Transaction Bot",
      routines: [{ id: "nope", name: "Nope" }],
    });
    expect(blocked.inactiveRoutines).toEqual([]);
    expect(blocked.activity).toEqual([]);
  });

  it("drops excluded roster and group members instead of seating them", () => {
    const roster = apply({
      kind: "roster",
      bots: [
        { bot: "Pipeline Pulse", name: "Pipeline Pulse" },
        { bot: "RE Listings Desk", name: "Renamed by the wire" },
      ],
    });
    expect(roster.seats.map((seat) => seat.occupantId)).toEqual(
      createOfficeState().seats.map((seat) => seat.occupantId),
    );
    expect(roster.activity.map((entry) => entry.text).join(" ")).toContain("RE Listings Desk");
    expect(roster.activity.map((entry) => entry.text).join(" ")).not.toContain("Renamed by the wire");
    expect(roster.suppressedCount).toBe(1);

    const groups = apply({
      kind: "groups",
      groups: [{ id: "old", name: "Old", bots: ["Clip Bot", "RE Media Studio"] }],
    });
    expect(groups.groups).toEqual([{ id: "old", name: "Old", botIds: [MEDIA_STUDIO_ID] }]);
    expect(OFFICE_BOTS).toHaveLength(7);
  });

  it("can rearrange allowlisted desks locally and restore the roster", () => {
    const moved = assignOfficeSeat(createOfficeState(), "listings.desk", MEDIA_STUDIO_ID);
    expect(moved.seats.find((seat) => seat.slotId === "listings.desk")?.occupantId).toBe(MEDIA_STUDIO_ID);
    expect(moved.seats.find((seat) => seat.slotId === "media.desk")?.confirmation).toBe("unassigned");
    const restored = restoreRoster(moved);
    expect(restored.seats.find((seat) => seat.slotId === "media.desk")?.occupantId).toBe(MEDIA_STUDIO_ID);
    expect(assignOfficeSeat(createOfficeState(), "hq.manager", MEDIA_STUDIO_ID).seats).toEqual(
      createOfficeState().seats,
    );
  });
});
