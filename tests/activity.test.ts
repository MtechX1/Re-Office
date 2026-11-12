import { describe, expect, it } from "vitest";
import { MANAGER_ID, MARKET_RESEARCH_ID, MEDIA_STUDIO_ID } from "@/lib/office/allowlist";
import {
  formatWorkingDuration,
  recentStatusFeed,
  startOfZonedDay,
  STATUS_FEED_LIMIT,
  summarizeDeskActivity,
  type StatusLine,
} from "@/lib/office/activity";
import { applyInbound, createOfficeState } from "@/lib/office/state";
import { parseOfficePayload } from "@/lib/ntfy/parser";
import { buildTopicUrl } from "@/lib/ntfy/topic";

const NOW = Date.parse("2026-11-12T15:00:00.000Z");

function line(
  id: string,
  botId: StatusLine["botId"],
  status: StatusLine["status"],
  step: string,
  at: string,
): StatusLine {
  return { id, botId, status, step, at };
}

describe("desk activity aggregation", () => {
  it("starts the New York day at local midnight", () => {
    expect(new Date(startOfZonedDay(NOW)).toISOString()).toBe("2026-11-12T05:00:00.000Z");
  });

  it("counts today's updates, starts, dones, errors, and working time", () => {
    const lines = [
      line(MANAGER_ID + "-y", MANAGER_ID, "idle", "Yesterday", "2026-11-11T20:00:00.000Z"),
      line("a1", MANAGER_ID, "working", "Open the floor", "2026-11-12T06:00:00.000Z"),
      line("a2", MANAGER_ID, "working", "Still going", "2026-11-12T06:30:00.000Z"),
      line("a3", MANAGER_ID, "idle", "Pause", "2026-11-12T07:00:00.000Z"),
      line("a4", MANAGER_ID, "error", "Missing file", "2026-11-12T08:00:00.000Z"),
      line("a5", MANAGER_ID, "working", "Resume", "2026-11-12T14:00:00.000Z"),
      line("a6", MANAGER_ID, "done", "Note filed", "2026-11-12T14:30:00.000Z"),
    ];
    const row = summarizeDeskActivity(lines, NOW).find((item) => item.botId === MANAGER_ID);
    expect(row).toMatchObject({
      quiet: false,
      currentStatus: "done",
      currentStep: "Note filed",
      updatesToday: 6,
      startedToday: 2,
      doneToday: 1,
      errorsToday: 1,
      workingMsToday: 90 * 60 * 1000,
    });
    expect(formatWorkingDuration(row?.workingMsToday ?? 0)).toBe("1h 30m");

    const carry = summarizeDeskActivity(
      [
        line("c1", MANAGER_ID, "working", "Overnight", "2026-11-12T04:00:00.000Z"),
        line("c2", MANAGER_ID, "idle", "Morning", "2026-11-12T06:00:00.000Z"),
      ],
      NOW,
    ).find((item) => item.botId === MANAGER_ID);
    expect(carry).toMatchObject({ workingMsToday: 60 * 60 * 1000, startedToday: 0, updatesToday: 1 });
  });

  it("shows quiet after 24 hours and keeps a fresh floor live", () => {
    const rows = summarizeDeskActivity(
      [
        line("old", MANAGER_ID, "idle", "Old", "2026-11-11T10:00:00.000Z"),
        line("new", MEDIA_STUDIO_ID, "working", "Live", "2026-11-12T14:00:00.000Z"),
      ],
      NOW,
    );
    expect(rows.find((row) => row.botId === MANAGER_ID)?.quiet).toBe(true);
    expect(rows.find((row) => row.botId === MEDIA_STUDIO_ID)).toMatchObject({
      quiet: false,
      currentStatus: "working",
      workingMsToday: 60 * 60 * 1000,
    });
    expect(rows.find((row) => row.botId === MARKET_RESEARCH_ID)?.quiet).toBe(true);
    expect(rows).toHaveLength(7);
  });

  it("lists the newest status lines first and can filter by floor", () => {
    const lines: StatusLine[] = [];
    for (let index = 0; index < 120; index += 1) {
      lines.push(
        line(
          `m-${index}`,
          index % 2 === 0 ? MANAGER_ID : MEDIA_STUDIO_ID,
          "idle",
          `Step ${index}`,
          new Date(Date.parse("2026-11-12T06:00:00.000Z") + index * 60_000).toISOString(),
        ),
      );
    }
    const feed = recentStatusFeed(lines, "all", NOW);
    expect(feed).toHaveLength(STATUS_FEED_LIMIT);
    expect(feed[0]?.step).toBe("Step 119");
    expect(feed[1]?.step).toBe("Step 118");
    const hq = recentStatusFeed(lines, "hq", NOW);
    expect(hq.every((entry) => entry.botId === MANAGER_ID)).toBe(true);
    expect(hq[0]?.step).toBe("Step 118");
    expect(recentStatusFeed(lines, "leads", NOW)).toEqual([]);
  });

  it("ignores other bot names and keeps the latest routine list per bot", () => {
    let state = applyInbound(
      createOfficeState(),
      { kind: "status", bot: "Hollywood Bot", status: "working", step: "Should not appear" },
      { eventId: "x", receivedAt: "2026-11-12T14:00:00.000Z" },
    );
    expect(state.statusLog).toEqual([]);
    expect(state.statuses).toEqual({});

    state = applyInbound(
      state,
      { kind: "status", bot: "RE Office Manager", status: "working", step: "Yes" },
      { eventId: "y", receivedAt: "2026-11-12T14:05:00.000Z" },
    );
    expect(state.statusLog).toEqual([
      {
        id: "y",
        botId: MANAGER_ID,
        status: "working",
        step: "Yes",
        at: "2026-11-12T14:05:00.000Z",
      },
    ]);

    const first = parseOfficePayload({
      routines: { bot: "RE Market Research", items: ["Sweep", { id: "grade", name: "Grade color" }] },
    });
    expect(first).toEqual({
      ok: true,
      message: {
        kind: "routines",
        bot: "RE Market Research",
        routines: [
          { id: "item-1", name: "Sweep" },
          { id: "grade", name: "Grade color" },
        ],
      },
    });
    if (!first.ok) return;
    state = applyInbound(createOfficeState(), first.message, { eventId: "r1", receivedAt: null });
    const second = parseOfficePayload({ routines: { bot: "RE Market Research", items: ["Evening note"] } });
    if (!second.ok) return;
    state = applyInbound(state, second.message, { eventId: "r2", receivedAt: null });
    const media = parseOfficePayload({
      type: "routines",
      bot: "RE Media Studio",
      routines: [{ id: "cut", name: "Cut reel" }],
    });
    if (!media.ok) return;
    state = applyInbound(state, media.message, { eventId: "r3", receivedAt: null });

    expect(state.inactiveRoutines.filter((routine) => routine.botId === MARKET_RESEARCH_ID).map((routine) => routine.name)).toEqual([
      "Evening note",
    ]);
    expect(state.inactiveRoutines.filter((routine) => routine.botId === MEDIA_STUDIO_ID).map((routine) => routine.name)).toEqual([
      "Cut reel",
    ]);
    expect(state.routinesEnabled).toBe(false);

    const blocked = parseOfficePayload({ routines: { bot: "Hollywood Bot", items: ["Not seated"] } });
    if (!blocked.ok) return;
    const dropped = applyInbound(createOfficeState(), blocked.message, { eventId: "r4", receivedAt: null });
    expect(dropped.inactiveRoutines).toEqual([]);
    expect(dropped.activity).toEqual([]);
  });

  it("polls 24 hours of history for the office topic", () => {
    expect(buildTopicUrl("https://ntfy.sh", "re-LRnhJhxZyV4qdIu7g8bVca", "poll", "24h")).toBe(
      "https://ntfy.sh/re-LRnhJhxZyV4qdIu7g8bVca/json?poll=1&since=24h",
    );
  });
});
