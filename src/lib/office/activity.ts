import { botById, OFFICE_BOTS, type BotId, type FloorId } from "@/lib/office/allowlist";
import type { BotStatusName } from "@/lib/ntfy/parser";

export const OFFICE_TIME_ZONE = "America/New_York";
export const QUIET_AFTER_MS = 24 * 60 * 60 * 1000;
export const STATUS_FEED_LIMIT = 100;
export const STATUS_LOG_LIMIT = 1000;
export const HISTORY_SINCE = "24h";

export interface StatusLine {
  id: string;
  botId: BotId;
  status: BotStatusName;
  step: string;
  at: string | null;
}

export interface DeskActivity {
  botId: BotId;
  name: string;
  floorId: FloorId;
  lastSeenAt: string | null;
  currentStatus: BotStatusName | null;
  currentStep: string | null;
  quiet: boolean;
  updatesToday: number;
  startedToday: number;
  doneToday: number;
  errorsToday: number;
  workingMsToday: number;
}

interface RankedLine {
  line: StatusLine;
  index: number;
  time: number;
}

export function startOfZonedDay(nowMs: number, timeZone = OFFICE_TIME_ZONE): number {
  const parts = zonedParts(nowMs, timeZone);
  const pretendNow = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const offset = pretendNow - nowMs;
  return Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0) - offset;
}

export function formatOfficeTime(iso: string | null, timeZone = OFFICE_TIME_ZONE): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatWorkingDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return `${hours}h ${rest}m`;
}

export function recentStatusFeed(lines: readonly StatusLine[], floor: FloorId | "all", nowMs: number): StatusLine[] {
  const ranked = rank(lines, nowMs);
  const filtered =
    floor === "all" ? ranked : ranked.filter(({ line }) => botById(line.botId).floorId === floor);
  filtered.sort((a, b) => b.time - a.time || b.index - a.index);
  return filtered.slice(0, STATUS_FEED_LIMIT).map(({ line }) => line);
}

export function summarizeDeskActivity(lines: readonly StatusLine[], nowMs: number): DeskActivity[] {
  const asOf = observationTime(lines, nowMs);
  const dayStart = startOfZonedDay(asOf);
  return OFFICE_BOTS.map((bot) => summarizeBot(bot.id, lines, asOf, dayStart));
}

/** Include a message that just arrived if its server clock is slightly ahead of this browser. */
function observationTime(lines: readonly StatusLine[], nowMs: number): number {
  const ceiling = nowMs + 5 * 60 * 1000;
  let latest = nowMs;
  for (const line of lines) {
    if (!line.at) continue;
    const time = Date.parse(line.at);
    if (Number.isFinite(time) && time > latest && time <= ceiling) latest = time;
  }
  return latest;
}

function summarizeBot(botId: BotId, lines: readonly StatusLine[], nowMs: number, dayStart: number): DeskActivity {
  const bot = botById(botId);
  const ranked = rank(
    lines.filter((line) => line.botId === botId),
    nowMs,
  ).sort((a, b) => a.time - b.time || a.index - b.index);

  let updatesToday = 0;
  let startedToday = 0;
  let doneToday = 0;
  let errorsToday = 0;
  let workingMs = 0;
  let previous: BotStatusName | null = null;
  let openWorkingFrom: number | null = null;

  for (const entry of ranked) {
    const inToday = entry.time >= dayStart && entry.time <= nowMs;
    if (openWorkingFrom !== null) {
      workingMs += overlapMs(openWorkingFrom, entry.time, dayStart, nowMs);
    }
    if (entry.line.status === "working") openWorkingFrom = entry.time;
    else openWorkingFrom = null;

    if (inToday) {
      updatesToday += 1;
      if (entry.line.status === "working" && previous !== "working") startedToday += 1;
      if (entry.line.status === "done") doneToday += 1;
      if (entry.line.status === "error") errorsToday += 1;
    }
    previous = entry.line.status;
  }
  if (openWorkingFrom !== null) {
    workingMs += overlapMs(openWorkingFrom, nowMs, dayStart, nowMs);
  }

  const latest = ranked.length > 0 ? ranked[ranked.length - 1] : null;
  const lastSeenAt = latest?.line.at ?? null;
  const age = latest ? nowMs - latest.time : Number.POSITIVE_INFINITY;
  const quiet = !latest || age > QUIET_AFTER_MS;

  return {
    botId,
    name: bot.name,
    floorId: bot.floorId,
    lastSeenAt,
    currentStatus: latest?.line.status ?? null,
    currentStep: latest?.line.step ?? null,
    quiet,
    updatesToday,
    startedToday,
    doneToday,
    errorsToday,
    workingMsToday: workingMs,
  };
}

function rank(lines: readonly StatusLine[], nowMs: number): RankedLine[] {
  return lines.map((line, index) => ({ line, index, time: eventTime(line, nowMs) }));
}

function eventTime(line: StatusLine, nowMs: number): number {
  if (!line.at) return nowMs;
  const parsed = Date.parse(line.at);
  return Number.isFinite(parsed) ? parsed : nowMs;
}

function overlapMs(start: number, end: number, windowStart: number, windowEnd: number): number {
  const from = Math.max(start, windowStart);
  const to = Math.min(end, windowEnd);
  return Math.max(0, to - from);
}

function zonedParts(nowMs: number, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const bag: Record<string, string> = {};
  for (const part of fmt.formatToParts(new Date(nowMs))) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour,
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}
