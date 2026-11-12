/**
 * The only bots seated in this office.
 * Older bots are listed further down so a shared ntfy channel cannot add them back.
 * This file does not delete those bots from any other workspace.
 */

export const OFFICE_BOTS = [
  {
    id: "ad0c4d13-f85a-4f05-96e9-7edbf9ccdb54",
    name: "RE Office Manager",
    floorId: "hq",
    lane: "HQ manager",
    role: "Office manager",
    summary: "Confirmed HQ seat for this office.",
  },
  {
    id: "7be15da5-b6fb-482d-af03-6a8bca938f30",
    name: "RE Leads Watch",
    floorId: "leads",
    lane: "Lead watch",
    role: "Watch BoldTrail for new leads and flag them for Stavros",
    summary:
      "Assigned to watch BoldTrail and flag new leads for Stavros. BoldTrail is not connected, so this desk is not monitoring live leads.",
  },
  {
    id: "3be017a1-3506-418c-8503-76ef3f55b57d",
    name: "RE Listings Desk",
    floorId: "listings",
    lane: "Listings",
    role: "Commercial and residential comps, listing prep, photos, and descriptions",
    summary:
      "Covers commercial and residential listings. Crexi, LoopNet, and Northeast Florida MLS are named here. None of them are connected.",
  },
  {
    id: "7d21784b-1021-4693-be2f-9d7ffd578722",
    name: "RE Marketing Desk",
    floorId: "marketing",
    lane: "Marketing",
    role: "Ads, social, email, and content",
    summary: "Marketing lane for ads, social, email, and content.",
  },
  {
    id: "4be523e7-0852-47d0-859e-efc51c4e8335",
    name: "RE Closing Desk",
    floorId: "transactions",
    lane: "Closings",
    role: "Contracts and closings",
    summary: "Transaction lane for contracts and closings.",
  },
  {
    id: "2d5decd1-e475-4c78-9281-85fc6baca121",
    name: "RE Market Research",
    floorId: "research",
    lane: "Research",
    role: "Commercial and residential market analysis, neighborhoods, and valuations",
    summary:
      "Covers commercial and residential market analysis, neighborhoods, and valuations. Northeast Florida MLS access setup is required and not connected.",
  },
  {
    id: "8a76c58f-cbf6-478b-93df-75075e074916",
    name: "RE Media Studio",
    floorId: "media",
    lane: "Media",
    role: "Media studio",
    summary: "Media floor lane.",
  },
] as const;

export type OfficeBot = (typeof OFFICE_BOTS)[number];
export type BotId = OfficeBot["id"];
export type FloorId = OfficeBot["floorId"];

export const MANAGER_ID = "ad0c4d13-f85a-4f05-96e9-7edbf9ccdb54" satisfies BotId;
export const LEADS_WATCH_ID = "7be15da5-b6fb-482d-af03-6a8bca938f30" satisfies BotId;
export const LISTINGS_DESK_ID = "3be017a1-3506-418c-8503-76ef3f55b57d" satisfies BotId;
export const MARKETING_DESK_ID = "7d21784b-1021-4693-be2f-9d7ffd578722" satisfies BotId;
export const CLOSING_DESK_ID = "4be523e7-0852-47d0-859e-efc51c4e8335" satisfies BotId;
export const MARKET_RESEARCH_ID = "2d5decd1-e475-4c78-9281-85fc6baca121" satisfies BotId;
export const MEDIA_STUDIO_ID = "8a76c58f-cbf6-478b-93df-75075e074916" satisfies BotId;

/** Kept out of this building. Not deleted anywhere else. */
export const EXCLUDED_BOTS = [
  { name: "Signal Prospector", ids: [] as readonly string[] },
  { name: "Clip Bot", ids: [] as readonly string[] },
  { name: "Visuals Bot", ids: [] as readonly string[] },
  { name: "Pipeline Pulse", ids: [] as readonly string[] },
  { name: "Stavy's Re Closer", ids: [] as readonly string[] },
  { name: "Transaction Bot", ids: [] as readonly string[] },
  { name: "Hollywood Bot", ids: [] as readonly string[] },
  {
    name: "RE HQ Coordinator",
    ids: ["63630cda-0d74-428a-a066-f5ae66bbcba3"] as readonly string[],
  },
] as const;

export function chatLinkForBot(id: BotId): string {
  return `grokbot://app/v1/agent?id=${id}`;
}

export function normalizeBotKey(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const ALLOWED_BY_KEY = new Map<string, BotId>();
for (const bot of OFFICE_BOTS) {
  ALLOWED_BY_KEY.set(normalizeBotKey(bot.name), bot.id);
  ALLOWED_BY_KEY.set(normalizeBotKey(bot.id), bot.id);
  ALLOWED_BY_KEY.set(bot.id.toLowerCase(), bot.id);
}

const EXCLUDED_KEYS = new Set<string>();
for (const bot of EXCLUDED_BOTS) {
  EXCLUDED_KEYS.add(normalizeBotKey(bot.name));
  for (const id of bot.ids) {
    EXCLUDED_KEYS.add(id.toLowerCase());
    EXCLUDED_KEYS.add(normalizeBotKey(id));
  }
}

export type BotMatch =
  | { result: "allowed"; botId: BotId }
  | { result: "excluded" }
  | { result: "unknown" };

export function matchBot(raw: string): BotMatch {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 80) return { result: "unknown" };
  const key = normalizeBotKey(trimmed);
  const lower = trimmed.toLowerCase();
  if (EXCLUDED_KEYS.has(key) || EXCLUDED_KEYS.has(lower)) return { result: "excluded" };
  const botId = ALLOWED_BY_KEY.get(key) ?? ALLOWED_BY_KEY.get(lower);
  if (botId) return { result: "allowed", botId };
  return { result: "unknown" };
}

export function botById(id: BotId): OfficeBot {
  const bot = OFFICE_BOTS.find((item) => item.id === id);
  if (!bot) {
    throw new Error("Unknown office bot");
  }
  return bot;
}

export function isBotId(value: string): value is BotId {
  return OFFICE_BOTS.some((bot) => bot.id === value);
}

export function botForFloor(floorId: FloorId): OfficeBot {
  const matches = OFFICE_BOTS.filter((bot) => bot.floorId === floorId);
  if (matches.length !== 1) {
    throw new Error("Each floor has one seated bot");
  }
  return matches[0];
}
