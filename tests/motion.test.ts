import { describe, expect, it } from "vitest";
import { OFFICE_BOTS } from "@/lib/office/allowlist";
import { FLOORS } from "@/lib/office/definitions";
import { FIGURES, figureForOccupant, type FigureSilhouette } from "@/lib/office/figures";
import {
  HOP_BOOST,
  bounceOffset,
  bubbleLift,
  connectionLine,
  connectionTone,
  motionForDesk,
  statusTone,
  tallyDesks,
} from "@/lib/office/motion";
import {
  EXPLODE_GAP,
  STACK_PITCH,
  deskPoints,
  floorBaseY,
  floorLabel,
  stackedFloors,
} from "@/lib/office/scene-layout";
import type { BotStatusName } from "@/lib/ntfy/parser";

const STATUSES: BotStatusName[] = ["working", "idle", "waiting_user", "error", "done"];
const BOT_SHAPES: FigureSilhouette[] = ["blob", "teardrop", "sphere", "star", "capsule", "diamond", "cube"];

describe("status motion", () => {
  it("maps each ntfy status onto its own animation and leaves the status word unchanged", () => {
    for (const status of STATUSES) {
      const spec = motionForDesk({ kind: "bot", quiet: false, status });
      expect(spec.kind).toBe(status);
    }
    const working = motionForDesk({ kind: "bot", quiet: false, status: "working" });
    const idle = motionForDesk({ kind: "bot", quiet: false, status: "idle" });
    const waiting = motionForDesk({ kind: "bot", quiet: false, status: "waiting_user" });
    const error = motionForDesk({ kind: "bot", quiet: false, status: "error" });
    const done = motionForDesk({ kind: "bot", quiet: false, status: "done" });

    expect(working.particles).toBe(true);
    expect(working.bounceHz).toBeGreaterThan(idle.bounceHz);
    expect(working.amplitude).toBeGreaterThan(idle.amplitude);
    expect(idle.bounceHz).toBeGreaterThan(0);
    expect(idle.particles).toBe(false);
    expect(idle.bubble).toBe("none");

    expect(waiting.bubble).toBe("waiting");
    expect(waiting.amplitude).toBe(0);
    expect(error.bubble).toBe("error");
    expect(error.particles).toBe(false);
    expect(done.bubble).toBe("done");
    expect(done.hop).toBe(true);
    expect(done.particles).toBe(false);
    expect(STATUSES.filter((status) => motionForDesk({ kind: "bot", quiet: false, status }).particles)).toEqual([
      "working",
    ]);
  });

  it("holds a quiet bot still and dim even when the last status was working", () => {
    const quiet = motionForDesk({ kind: "bot", quiet: true, status: "working" });
    expect(quiet).toMatchObject({
      kind: "quiet",
      bounceHz: 0,
      amplitude: 0,
      particles: false,
      bubble: "none",
      dim: true,
      hop: false,
    });
    expect(bounceOffset(quiet, 3)).toEqual({ y: 0, scaleY: 1, scaleXZ: 1 });
    expect(motionForDesk({ kind: "bot", quiet: false, status: null }).kind).toBe("quiet");
  });

  it("keeps Stavros moving calmly and never marks a human or an empty pad quiet", () => {
    const human = motionForDesk({ kind: "human", quiet: true, status: "error" });
    expect(human.kind).toBe("human");
    expect(human.dim).toBe(false);
    expect(human.bubble).toBe("none");
    expect(human.bounceHz).toBeGreaterThan(0);
    expect(motionForDesk({ kind: "empty", quiet: true, status: "working" })).toMatchObject({
      kind: "empty",
      bounceHz: 0,
      dim: false,
      particles: false,
    });
  });

  it("squashes on landing, stretches at the top, and gives done an extra hop", () => {
    const idle = motionForDesk({ kind: "bot", quiet: false, status: "idle" });
    const landed = bounceOffset(idle, 0);
    expect(landed.y).toBe(0);
    expect(landed.scaleY).toBeLessThan(1);
    expect(landed.scaleXZ).toBeGreaterThan(1);
    const mid = bounceOffset(idle, 0.5 / idle.bounceHz);
    expect(mid.y).toBeCloseTo(idle.amplitude);
    expect(mid.scaleY).toBeGreaterThan(1);

    const done = motionForDesk({ kind: "bot", quiet: false, status: "done" });
    expect(bounceOffset(done, 0.5 / done.bounceHz).y).toBeCloseTo(done.amplitude * HOP_BOOST);
    expect(bounceOffset(done, 0.5 / done.bounceHz).y).toBeGreaterThan(mid.y);
  });

  it("floats only the waiting bubble", () => {
    const waiting = motionForDesk({ kind: "bot", quiet: false, status: "waiting_user" });
    const error = motionForDesk({ kind: "bot", quiet: false, status: "error" });
    const idle = motionForDesk({ kind: "bot", quiet: false, status: "idle" });
    expect(bubbleLift(idle, 0.4)).toBe(0);
    expect(bubbleLift(error, 0.4)).toBe(0);
    expect(bubbleLift(waiting, 0)).toBe(0);
    const samples = [0.2, 0.5, 0.9, 1.2].map((time) => bubbleLift(waiting, time));
    expect(samples.some((value) => Math.abs(value) > 0.02)).toBe(true);
  });
});

describe("terminal status copy", () => {
  it("colors running and done green, waiting and error pink, and quiet dim", () => {
    expect(statusTone("working", false)).toBe("ok");
    expect(statusTone("done", false)).toBe("ok");
    expect(statusTone("waiting_user", false)).toBe("bad");
    expect(statusTone("error", false)).toBe("bad");
    expect(statusTone("idle", false)).toBe("info");
    expect(statusTone("working", true)).toBe("dim");
    expect(statusTone(null, true)).toBe("dim");
  });

  it("counts waiting, done, and bots that reported inside the quiet window", () => {
    expect(
      tallyDesks([
        { quiet: false, currentStatus: "waiting_user" },
        { quiet: false, currentStatus: "done" },
        { quiet: false, currentStatus: "working" },
        { quiet: true, currentStatus: "done" },
      ]),
    ).toEqual({ waiting: 1, done: 1, reported: 3 });
  });

  it("says all live only when the stream is up and every bot has reported", () => {
    expect(connectionLine("live", 7)).toBe("connected. 7 bots on 7 floors, all live");
    expect(connectionLine("live", 7.9)).toBe("connected. 7 bots on 7 floors, all live");
    expect(connectionLine("live", 3)).toBe("connected. 3 bots on 7 floors");
    expect(connectionLine("live", 1)).toBe("connected. 1 bot on 7 floors");
    expect(connectionLine("connecting", 7)).toBe("connecting. 7 bots on 7 floors");
    expect(connectionLine("rate_limited", 2)).toBe("waiting on the stream. 2 bots on 7 floors");
    expect(connectionLine("backing_off", 0)).toBe("reconnecting. 0 bots on 7 floors");
    expect(connectionLine("stopped", 4)).toBe("stopped. 4 bots on 7 floors");
    expect(connectionLine("unconfigured", 0)).toBe("offline. 0 bots on 7 floors");
    expect(connectionLine("live", Number.NaN)).toBe("connected. 0 bots on 7 floors");
    expect(connectionTone("live")).toBe("ok");
    expect(connectionTone("rate_limited")).toBe("bad");
    expect(connectionTone("backing_off")).toBe("bad");
    expect(connectionTone("connecting")).toBe("info");
    expect(connectionTone("stopped")).toBe("dim");
  });
});

describe("isometric floor layout", () => {
  it("labels HQ as 00_HQ on top and gives every floor one prop", () => {
    const stack = stackedFloors();
    expect(stack.map((floor) => floor.label)).toEqual([
      "00_HQ",
      "01_LEADS",
      "02_LISTINGS",
      "03_MARKETING",
      "04_TRANSACTIONS",
      "05_RESEARCH",
      "06_MEDIA",
    ]);
    expect(stack.find((floor) => floor.id === "hq")).toMatchObject({ level: 6, prop: "meeting-table" });
    expect(stack.find((floor) => floor.id === "media")).toMatchObject({ level: 0, prop: "camera-light" });
    expect(stack.find((floor) => floor.id === "listings")?.prop).toBe("file-cabinets");
    expect(stack.find((floor) => floor.id === "research")?.prop).toBe("bookshelves");
    expect(stack.find((floor) => floor.id === "transactions")?.prop).toBe("cabinet");
    expect(stack.find((floor) => floor.id === "marketing")?.prop).toBe("board");
    expect(stack.find((floor) => floor.id === "leads")?.prop).toBe("phones");
    expect(new Set(stack.map((floor) => floor.prop)).size).toBe(7);
    expect(floorLabel("HQ", 0)).toBe("00_HQ");
    expect(stack.map((floor) => floor.id)).toEqual(FLOORS.map((floor) => floor.id));
  });

  it("opens a gap between floors when explode is on", () => {
    expect(floorBaseY(6, 0) - floorBaseY(5, 0)).toBeCloseTo(STACK_PITCH);
    expect(floorBaseY(6, 1) - floorBaseY(5, 1)).toBeCloseTo(STACK_PITCH + EXPLODE_GAP);
    expect(floorBaseY(0, 1)).toBe(0);
    expect(floorBaseY(3, 1)).toBeGreaterThan(floorBaseY(3, 0));
  });

  it("puts two pads on leads and one pad on every other floor", () => {
    expect(deskPoints("leads").map((desk) => desk.slotId)).toEqual(["leads.caller", "leads.watch"]);
    for (const floor of FLOORS) {
      const desks = deskPoints(floor.id);
      expect(desks.length).toBe(floor.id === "leads" ? 2 : 1);
    }
    const ids = FLOORS.flatMap((floor) => deskPoints(floor.id).map((desk) => desk.slotId));
    expect(new Set(ids).size).toBe(8);
  });

  it("gives each bot a distinct silhouette and Stavros a human figure", () => {
    const shapes = OFFICE_BOTS.map((bot) => figureForOccupant(bot.id)?.silhouette);
    expect(shapes).toEqual(BOT_SHAPES);
    expect(new Set(shapes).size).toBe(BOT_SHAPES.length);
    expect(figureForOccupant("stavros")?.silhouette).toBe("human");
    expect(FIGURES.stavros.shape).toBe("human");
    for (const bot of OFFICE_BOTS) {
      expect(figureForOccupant(bot.id)?.shape).toBe("bot");
    }
  });
});
