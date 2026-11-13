import type { DeskActivity } from "@/lib/office/activity";
import type { BotStatusName } from "@/lib/ntfy/parser";
import type { PublicPhase } from "@/lib/ntfy/stream";

/** How a seated figure moves. Identity color stays on the figure; this only picks motion. */
export type MotionKind = "quiet" | "idle" | "working" | "waiting_user" | "error" | "done" | "human" | "empty";

export type MotionBubble = "none" | "waiting" | "error" | "done";

export interface MotionSpec {
  kind: MotionKind;
  /** Cycles per second. Zero holds the figure still. */
  bounceHz: number;
  /** Peak hop height in scene units. */
  amplitude: number;
  /** How hard the figure squashes when it lands. */
  squash: number;
  /** Tiny white cubes leaving the keyboard. */
  particles: boolean;
  bubble: MotionBubble;
  /** Pull the figure toward a dim neutral. Quiet only. */
  dim: boolean;
  /** Extra hop height for a finished task. */
  hop: boolean;
}

export const HOP_BOOST = 1.85;

const STILL: MotionSpec = {
  kind: "empty",
  bounceHz: 0,
  amplitude: 0,
  squash: 0,
  particles: false,
  bubble: "none",
  dim: false,
  hop: false,
};

/**
 * Map a desk to motion. Quiet (no report in 24h) wins over the last status.
 * Human and empty seats are not bots and are never marked quiet.
 */
export function motionForDesk(input: {
  kind: "bot" | "human" | "empty";
  quiet: boolean;
  status: BotStatusName | null;
}): MotionSpec {
  if (input.kind === "empty") return { ...STILL, kind: "empty" };
  if (input.kind === "human") {
    return {
      kind: "human",
      bounceHz: 0.45,
      amplitude: 0.035,
      squash: 0.04,
      particles: false,
      bubble: "none",
      dim: false,
      hop: false,
    };
  }
  if (input.quiet || !input.status) {
    return {
      kind: "quiet",
      bounceHz: 0,
      amplitude: 0,
      squash: 0,
      particles: false,
      bubble: "none",
      dim: true,
      hop: false,
    };
  }
  switch (input.status) {
    case "idle":
      return {
        kind: "idle",
        bounceHz: 0.55,
        amplitude: 0.055,
        squash: 0.08,
        particles: false,
        bubble: "none",
        dim: false,
        hop: false,
      };
    case "working":
      return {
        kind: "working",
        bounceHz: 2.15,
        amplitude: 0.09,
        squash: 0.12,
        particles: true,
        bubble: "none",
        dim: false,
        hop: false,
      };
    case "waiting_user":
      return {
        kind: "waiting_user",
        bounceHz: 0,
        amplitude: 0,
        squash: 0,
        particles: false,
        bubble: "waiting",
        dim: false,
        hop: false,
      };
    case "error":
      return {
        kind: "error",
        bounceHz: 0,
        amplitude: 0,
        squash: 0,
        particles: false,
        bubble: "error",
        dim: false,
        hop: false,
      };
    case "done":
      return {
        kind: "done",
        bounceHz: 1.35,
        amplitude: 0.11,
        squash: 0.14,
        particles: false,
        bubble: "done",
        dim: false,
        hop: true,
      };
    default:
      return {
        kind: "quiet",
        bounceHz: 0,
        amplitude: 0,
        squash: 0,
        particles: false,
        bubble: "none",
        dim: true,
        hop: false,
      };
  }
}

export interface BouncePose {
  y: number;
  scaleY: number;
  scaleXZ: number;
}

/** Vertical hop plus squash-and-stretch. Phase 0 is the landing pose. */
export function bounceOffset(spec: MotionSpec, timeSec: number): BouncePose {
  if (spec.bounceHz <= 0 || spec.amplitude <= 0) {
    return { y: 0, scaleY: 1, scaleXZ: 1 };
  }
  const phase = ((timeSec * spec.bounceHz) % 1 + 1) % 1;
  const y = Math.sin(phase * Math.PI) * spec.amplitude * (spec.hop ? HOP_BOOST : 1);
  const landing = phase < 0.12 || phase > 0.88;
  return {
    y,
    scaleY: landing ? 1 - spec.squash : 1 + spec.squash * 0.35,
    scaleXZ: landing ? 1 + spec.squash * 0.65 : 1 - spec.squash * 0.2,
  };
}

/** Waiting bubbles float on their own. Other bubbles ride the body hop. */
export function bubbleLift(spec: MotionSpec, timeSec: number): number {
  if (spec.bubble !== "waiting") return 0;
  return Math.sin(timeSec * 1.7) * 0.07;
}

export type StatusTone = "ok" | "bad" | "info" | "dim";

export function statusTone(status: string | null, quiet: boolean): StatusTone {
  if (quiet) return "dim";
  if (status === "working" || status === "done") return "ok";
  if (status === "waiting_user" || status === "error") return "bad";
  return "info";
}

export interface DeskTally {
  waiting: number;
  done: number;
  reported: number;
}

/** Current waiting/done desks, and how many bots reported inside the quiet window. */
export function tallyDesks(rows: readonly Pick<DeskActivity, "quiet" | "currentStatus">[]): DeskTally {
  let waiting = 0;
  let done = 0;
  let reported = 0;
  for (const row of rows) {
    if (row.quiet) continue;
    reported += 1;
    if (row.currentStatus === "waiting_user") waiting += 1;
    if (row.currentStatus === "done") done += 1;
  }
  return { waiting, done, reported };
}

/**
 * Prompt under `$ grokbot office --live`.
 * "all live" means the stream is up and every office bot reported within 24h.
 * A live socket alone does not mark a quiet desk live.
 */
export function connectionLine(phase: PublicPhase["phase"], reportedBots: number, floors = 7): string {
  const n = Number.isFinite(reportedBots) ? Math.max(0, Math.floor(reportedBots)) : 0;
  const noun = n === 1 ? "bot" : "bots";
  const where = `${n} ${noun} on ${floors} floors`;
  switch (phase) {
    case "live":
      return n >= floors ? `connected. ${where}, all live` : `connected. ${where}`;
    case "connecting":
      return `connecting. ${where}`;
    case "rate_limited":
      return `waiting on the stream. ${where}`;
    case "backing_off":
      return `reconnecting. ${where}`;
    case "stopped":
      return `stopped. ${where}`;
    default:
      return `offline. ${where}`;
  }
}

export function connectionTone(phase: PublicPhase["phase"]): StatusTone {
  switch (phase) {
    case "live":
      return "ok";
    case "rate_limited":
    case "backing_off":
      return "bad";
    case "connecting":
      return "info";
    default:
      return "dim";
  }
}
