export const MAX_PAYLOAD_CHARS = 16_384;

export type BotStatusName = "working" | "idle" | "waiting_user" | "error" | "done";

export interface UsageBotWire {
  bot: string;
  used_pct: number;
}

export type ParsedMessage =
  | { kind: "status"; bot: string; status: BotStatusName; step: string }
  | { kind: "usage"; total_used_pct: number; resets_at: string; bots: UsageBotWire[] }
  | { kind: "roster"; bots: { bot: string; name: string }[] }
  | { kind: "looks"; bot: string; label: string; note: string }
  | { kind: "groups"; groups: { id: string; name: string; bots: string[] }[] }
  | { kind: "chat"; bot: string; text: string; url: string | null; autoOpen: false }
  | { kind: "routines"; bot: string | null; routines: { id: string; name: string }[] };

export type ParseFailure = "invalid-json" | "too-large" | "invalid-shape" | "unknown-type";

export type OfficeParse =
  | { ok: true; message: ParsedMessage }
  | { ok: false; reason: ParseFailure };

const STATUSES = new Set<BotStatusName>(["working", "idle", "waiting_user", "error", "done"]);
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const RESETS_AT = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const SAFE_ID = /^[A-Za-z0-9_-]{1,40}$/;

export function shouldOpenInboundUrl(url: string | null): false {
  void url;
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasForbiddenKey(value: unknown, depth = 0): boolean {
  if (depth > 8 || value === null || typeof value !== "object") return false;
  for (const key of Object.keys(value as object)) {
    if (FORBIDDEN_KEYS.has(key)) return true;
    if (hasForbiddenKey((value as Record<string, unknown>)[key], depth + 1)) return true;
  }
  return false;
}

function cleanText(value: string): string {
  return value.replace(/[\u0000-\u001F]+/g, " ").replace(/\s+/g, " ").trim();
}

function requiredText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = cleanText(value);
  if (!cleaned || cleaned.length > max) return null;
  return cleaned;
}

function optionalText(value: unknown, max: number): string | null {
  if (value === undefined) return "";
  if (typeof value !== "string") return null;
  const cleaned = cleanText(value);
  if (cleaned.length > max) return null;
  return cleaned;
}

function percent(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0 || value > 100) return null;
  return value;
}

function fail(reason: ParseFailure): OfficeParse {
  return { ok: false, reason };
}

export function parseOfficePayload(value: unknown): OfficeParse {
  if (!isRecord(value)) return fail("invalid-shape");
  if (hasForbiddenKey(value)) return fail("invalid-shape");

  const type = value.type;
  if (type === undefined && "status" in value && "bot" in value && "step" in value) {
    return parseStatus(value);
  }
  if (typeof type !== "string") return fail("unknown-type");

  switch (type) {
    case "status":
      return parseStatus(value);
    case "usage":
      return parseUsage(value);
    case "roster":
      return parseRoster(value);
    case "looks":
      return parseLooks(value);
    case "groups":
      return parseGroups(value);
    case "chat":
      return parseChat(value);
    case "routines":
      return parseRoutines(value);
    default:
      return fail("unknown-type");
  }
}

function parseStatus(value: Record<string, unknown>): OfficeParse {
  const bot = requiredText(value.bot, 80);
  const step = requiredText(value.step, 200);
  if (!bot || !step || typeof value.status !== "string" || !STATUSES.has(value.status as BotStatusName)) {
    return fail("invalid-shape");
  }
  return { ok: true, message: { kind: "status", bot, status: value.status as BotStatusName, step } };
}

function parseUsage(value: Record<string, unknown>): OfficeParse {
  const total = percent(value.total_used_pct);
  const resets = requiredText(value.resets_at, 40);
  if (total === null || !resets || !RESETS_AT.test(resets) || !Array.isArray(value.bots)) {
    return fail("invalid-shape");
  }
  if (value.bots.length > 30) return fail("invalid-shape");
  const bots: UsageBotWire[] = [];
  for (const entry of value.bots) {
    if (!isRecord(entry) || hasForbiddenKey(entry)) return fail("invalid-shape");
    const bot = requiredText(entry.bot, 80);
    const used = percent(entry.used_pct);
    if (!bot || used === null) return fail("invalid-shape");
    bots.push({ bot, used_pct: used });
  }
  return { ok: true, message: { kind: "usage", total_used_pct: total, resets_at: resets, bots } };
}

function parseRoster(value: Record<string, unknown>): OfficeParse {
  if (!Array.isArray(value.bots) || value.bots.length > 30) return fail("invalid-shape");
  const bots: { bot: string; name: string }[] = [];
  for (const entry of value.bots) {
    if (!isRecord(entry)) return fail("invalid-shape");
    const bot = requiredText(entry.bot, 80);
    const name = requiredText(entry.name, 80);
    if (!bot || !name) return fail("invalid-shape");
    bots.push({ bot, name });
  }
  return { ok: true, message: { kind: "roster", bots } };
}

function parseLooks(value: Record<string, unknown>): OfficeParse {
  const bot = requiredText(value.bot, 80);
  const label = requiredText(value.label, 80);
  const note = optionalText(value.note, 200);
  if (!bot || !label || note === null) return fail("invalid-shape");
  return { ok: true, message: { kind: "looks", bot, label, note } };
}

function parseGroups(value: Record<string, unknown>): OfficeParse {
  if (!Array.isArray(value.groups) || value.groups.length > 20) return fail("invalid-shape");
  const groups: { id: string; name: string; bots: string[] }[] = [];
  for (const entry of value.groups) {
    if (!isRecord(entry)) return fail("invalid-shape");
    const id = requiredText(entry.id, 40);
    const name = requiredText(entry.name, 80);
    if (!id || !name || !SAFE_ID.test(id) || !Array.isArray(entry.bots) || entry.bots.length > 30) {
      return fail("invalid-shape");
    }
    const bots: string[] = [];
    for (const bot of entry.bots) {
      const cleaned = requiredText(bot, 80);
      if (!cleaned) return fail("invalid-shape");
      bots.push(cleaned);
    }
    groups.push({ id, name, bots });
  }
  return { ok: true, message: { kind: "groups", groups } };
}

function parseChat(value: Record<string, unknown>): OfficeParse {
  const bot = requiredText(value.bot, 80);
  const text = requiredText(value.text, 1000);
  if (!bot || !text) return fail("invalid-shape");
  let url: string | null = null;
  if (value.url !== undefined && value.url !== null) {
    const cleaned = requiredText(value.url, 300);
    if (!cleaned) return fail("invalid-shape");
    url = cleaned;
  }
  return {
    ok: true,
    message: { kind: "chat", bot, text, url, autoOpen: false },
  };
}

function parseRoutines(value: Record<string, unknown>): OfficeParse {
  if (!Array.isArray(value.routines) || value.routines.length === 0 || value.routines.length > 20) {
    return fail("invalid-shape");
  }
  let bot: string | null = null;
  if (value.bot !== undefined && value.bot !== null) {
    const cleaned = requiredText(value.bot, 80);
    if (!cleaned) return fail("invalid-shape");
    bot = cleaned;
  }
  const routines: { id: string; name: string }[] = [];
  for (const entry of value.routines) {
    if (!isRecord(entry)) return fail("invalid-shape");
    const id = requiredText(entry.id, 40);
    const name = requiredText(entry.name, 80);
    if (!id || !name || !SAFE_ID.test(id)) return fail("invalid-shape");
    routines.push({ id, name });
  }
  return { ok: true, message: { kind: "routines", bot, routines } };
}

export function unwrapTransportLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(":")) return null;
  if (trimmed.startsWith("event:")) return null;
  if (trimmed.startsWith("data:")) {
    const data = trimmed.slice(5).trim();
    return data || null;
  }
  return trimmed;
}

export interface TransportMeta {
  eventId: string;
  receivedAt: string | null;
}

export type TransportParse =
  | { type: "ignore" }
  | { type: "reject"; reason: ParseFailure }
  | { type: "message"; message: ParsedMessage; meta: TransportMeta };

export function parseTransportPayload(rawText: string, seq: number): TransportParse {
  if (rawText.length > MAX_PAYLOAD_CHARS) return { type: "reject", reason: "too-large" };
  const unwrapped = unwrapTransportLine(rawText);
  if (!unwrapped) return { type: "ignore" };
  if (unwrapped.length > MAX_PAYLOAD_CHARS) return { type: "reject", reason: "too-large" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrapped);
  } catch {
    return { type: "reject", reason: "invalid-json" };
  }
  if (!isRecord(parsed)) return { type: "reject", reason: "invalid-shape" };

  const event = parsed.event;
  const looksLikeEnvelope = typeof parsed.message === "string" && (typeof parsed.id === "string" || event === "message");
  if (typeof event === "string" && event !== "message" && !looksLikeEnvelope && parsed.type === undefined && parsed.status === undefined) {
    return { type: "ignore" };
  }

  let office: unknown = parsed;
  let eventId = `seq-${seq}`;
  let receivedAt: string | null = null;

  if (looksLikeEnvelope && typeof parsed.message === "string") {
    if (parsed.message.length > MAX_PAYLOAD_CHARS) return { type: "reject", reason: "too-large" };
    try {
      office = JSON.parse(parsed.message);
    } catch {
      return { type: "reject", reason: "invalid-json" };
    }
    if (typeof parsed.id === "string" && SAFE_ID.test(parsed.id)) eventId = parsed.id;
    receivedAt = envelopeTime(parsed.time);
  }

  const officeParse = parseOfficePayload(office);
  if (!officeParse.ok) return { type: "reject", reason: officeParse.reason };
  return { type: "message", message: officeParse.message, meta: { eventId, receivedAt } };
}

function envelopeTime(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const seconds = value > 10_000_000_000 ? value / 1000 : value;
  if (seconds < 1_600_000_000 || seconds > 4_102_444_800) return null;
  return new Date(seconds * 1000).toISOString();
}

export function valueContainsTopic(value: unknown, secret: string): boolean {
  if (typeof value === "string") return secret.length > 0 && value.includes(secret);
  if (Array.isArray(value)) return value.some((item) => valueContainsTopic(item, secret));
  if (isRecord(value)) {
    return Object.entries(value).some(([key, item]) => key === "topic" || valueContainsTopic(item, secret));
  }
  return false;
}
