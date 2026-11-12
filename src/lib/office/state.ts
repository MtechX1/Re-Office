import { botById, matchBot, type BotId } from "@/lib/office/allowlist";
import { assignSeat, initialSeats, type Seat } from "@/lib/office/assignments";
import { ROUTINES_ENABLED } from "@/lib/office/definitions";
import type { ParsedMessage } from "@/lib/ntfy/parser";
import { shouldOpenInboundUrl } from "@/lib/ntfy/parser";
import type { SlotId } from "@/lib/office/definitions";

const ACTIVITY_LIMIT = 80;
const SEEN_LIMIT = 300;
const ROUTINE_LIMIT = 20;

export interface ActivityEntry {
  id: string;
  botId: BotId | null;
  kind: ParsedMessage["kind"];
  text: string;
  url: string | null;
  autoOpen: false;
  envelopeTime: string | null;
}

export interface UsageSnapshot {
  totalUsedPct: number;
  resetsAt: string;
  bots: { botId: BotId; usedPct: number }[];
  omittedRows: number;
}

export interface OfficeState {
  seats: Seat[];
  statuses: Partial<Record<BotId, { status: "working" | "idle" | "waiting_user" | "error" | "done"; step: string }>>;
  looks: Partial<Record<BotId, { label: string; note: string }>>;
  groups: { id: string; name: string; botIds: BotId[] }[];
  activity: ActivityEntry[];
  usage: UsageSnapshot | null;
  inactiveRoutines: { id: string; name: string; botId: BotId | null }[];
  routinesEnabled: false;
  suppressedCount: number;
  seenIds: string[];
  selectedSlotId: SlotId | null;
}

export interface InboundMeta {
  eventId: string;
  receivedAt: string | null;
}

export function createOfficeState(): OfficeState {
  return {
    seats: initialSeats(),
    statuses: {},
    looks: {},
    groups: [],
    activity: [],
    usage: null,
    inactiveRoutines: [],
    routinesEnabled: ROUTINES_ENABLED,
    suppressedCount: 0,
    seenIds: [],
    selectedSlotId: null,
  };
}

export function selectSlot(state: OfficeState, slotId: SlotId | null): OfficeState {
  return { ...state, selectedSlotId: slotId };
}

export function assignOfficeSeat(state: OfficeState, slotId: SlotId, botId: BotId): OfficeState {
  const seats = assignSeat(state.seats, slotId, botId);
  if (!seats) return state;
  return { ...state, seats };
}

export function restoreRoster(state: OfficeState): OfficeState {
  return { ...state, seats: initialSeats() };
}

export function applyInbound(state: OfficeState, message: ParsedMessage, meta: InboundMeta): OfficeState {
  if (state.seenIds.includes(meta.eventId)) return state;
  const seenIds = [...state.seenIds, meta.eventId].slice(-SEEN_LIMIT);
  const base = { ...state, seenIds, routinesEnabled: false as const };
  switch (message.kind) {
    case "status":
      return applyStatus(base, message, meta);
    case "usage":
      return applyUsage(base, message, meta);
    case "roster":
      return applyRoster(base, message, meta);
    case "looks":
      return applyLooks(base, message, meta);
    case "groups":
      return applyGroups(base, message);
    case "chat":
      return applyChat(base, message, meta);
    case "routines":
      return applyRoutines(base, message, meta);
    default:
      return base;
  }
}

function applyStatus(
  state: OfficeState,
  message: Extract<ParsedMessage, { kind: "status" }>,
  meta: InboundMeta,
): OfficeState {
  const match = matchBot(message.bot);
  if (match.result !== "allowed") {
    return { ...state, suppressedCount: state.suppressedCount + 1 };
  }
  const bot = botById(match.botId);
  return pushActivity(
    {
      ...state,
      statuses: {
        ...state.statuses,
        [match.botId]: { status: message.status, step: message.step },
      },
    },
    {
      id: meta.eventId,
      botId: match.botId,
      kind: "status",
      text: `${bot.name} · ${message.status} · ${message.step}`,
      url: null,
      autoOpen: false,
      envelopeTime: meta.receivedAt,
    },
  );
}

function applyUsage(
  state: OfficeState,
  message: Extract<ParsedMessage, { kind: "usage" }>,
  meta: InboundMeta,
): OfficeState {
  const bots: UsageSnapshot["bots"] = [];
  let omittedRows = 0;
  for (const entry of message.bots) {
    const match = matchBot(entry.bot);
    if (match.result !== "allowed") {
      omittedRows += 1;
      continue;
    }
    bots.push({ botId: match.botId, usedPct: entry.used_pct });
  }
  return pushActivity(
    {
      ...state,
      suppressedCount: state.suppressedCount + omittedRows,
      usage: {
        totalUsedPct: message.total_used_pct,
        resetsAt: message.resets_at,
        bots,
        omittedRows,
      },
    },
    {
      id: meta.eventId,
      botId: null,
      kind: "usage",
      text: "Usage payload received.",
      url: null,
      autoOpen: false,
      envelopeTime: meta.receivedAt,
    },
  );
}

function applyRoster(
  state: OfficeState,
  message: Extract<ParsedMessage, { kind: "roster" }>,
  meta: InboundMeta,
): OfficeState {
  let next = state;
  let notes = 0;
  for (const entry of message.bots) {
    const match = matchBot(entry.bot);
    if (match.result !== "allowed") {
      next = { ...next, suppressedCount: next.suppressedCount + 1 };
      continue;
    }
    notes += 1;
    next = pushActivity(next, {
      id: `${meta.eventId}-${notes}`,
      botId: match.botId,
      kind: "roster",
      text: `Roster note received for ${botById(match.botId).name}.`,
      url: null,
      autoOpen: false,
      envelopeTime: meta.receivedAt,
    });
  }
  return next;
}

function applyLooks(
  state: OfficeState,
  message: Extract<ParsedMessage, { kind: "looks" }>,
  meta: InboundMeta,
): OfficeState {
  const match = matchBot(message.bot);
  if (match.result !== "allowed") {
    return { ...state, suppressedCount: state.suppressedCount + 1 };
  }
  const bot = botById(match.botId);
  return pushActivity(
    {
      ...state,
      looks: {
        ...state.looks,
        [match.botId]: { label: message.label, note: message.note },
      },
    },
    {
      id: meta.eventId,
      botId: match.botId,
      kind: "looks",
      text: `Look note received for ${bot.name}.`,
      url: null,
      autoOpen: false,
      envelopeTime: meta.receivedAt,
    },
  );
}

function applyGroups(state: OfficeState, message: Extract<ParsedMessage, { kind: "groups" }>): OfficeState {
  let suppressed = state.suppressedCount;
  const groups: OfficeState["groups"] = [];
  for (const group of message.groups) {
    const botIds: BotId[] = [];
    let kept = 0;
    for (const bot of group.bots) {
      const match = matchBot(bot);
      if (match.result !== "allowed") {
        suppressed += 1;
        continue;
      }
      kept += 1;
      if (!botIds.includes(match.botId)) botIds.push(match.botId);
    }
    if (kept === 0) continue;
    groups.push({ id: group.id, name: group.name, botIds });
  }
  return { ...state, groups, suppressedCount: suppressed };
}

function applyChat(
  state: OfficeState,
  message: Extract<ParsedMessage, { kind: "chat" }>,
  meta: InboundMeta,
): OfficeState {
  const match = matchBot(message.bot);
  if (match.result !== "allowed") {
    return { ...state, suppressedCount: state.suppressedCount + 1 };
  }
  const bot = botById(match.botId);
  return pushActivity(state, {
    id: meta.eventId,
    botId: match.botId,
    kind: "chat",
    text: `${bot.name}: ${message.text}`,
    url: message.url,
    autoOpen: shouldOpenInboundUrl(message.url),
    envelopeTime: meta.receivedAt,
  });
}

function applyRoutines(
  state: OfficeState,
  message: Extract<ParsedMessage, { kind: "routines" }>,
  meta: InboundMeta,
): OfficeState {
  if (message.bot) {
    const match = matchBot(message.bot);
    if (match.result !== "allowed") {
      return { ...state, suppressedCount: state.suppressedCount + 1, routinesEnabled: false };
    }
  }
  const botId = message.bot ? matchAllowed(message.bot) : null;
  const stored = message.routines.map((routine) => ({
    id: routine.id,
    name: routine.name,
    botId,
  }));
  const inactiveRoutines = [...stored, ...state.inactiveRoutines].slice(0, ROUTINE_LIMIT);
  const who = botId ? botById(botId).name : "the office";
  return pushActivity(
    { ...state, inactiveRoutines, routinesEnabled: false },
    {
      id: meta.eventId,
      botId,
      kind: "routines",
      text: `Routine payload stored inactive for ${who}. Routines are not run.`,
      url: null,
      autoOpen: false,
      envelopeTime: meta.receivedAt,
    },
  );
}

function matchAllowed(raw: string): BotId | null {
  const match = matchBot(raw);
  return match.result === "allowed" ? match.botId : null;
}

function pushActivity(state: OfficeState, entry: ActivityEntry): OfficeState {
  return {
    ...state,
    routinesEnabled: false,
    activity: [...state.activity, entry].slice(-ACTIVITY_LIMIT),
  };
}
