import { botForFloor, type BotId, type FloorId } from "@/lib/office/allowlist";

export const SECTORS = ["commercial", "residential"] as const;
export type Sector = (typeof SECTORS)[number];

export const FLOORS = [
  {
    id: "hq",
    order: 1,
    name: "HQ",
    kicker: "Manager",
    summary: "Top floor. RE Office Manager is the confirmed seat.",
    sectors: [] as readonly Sector[],
  },
  {
    id: "leads",
    order: 2,
    name: "Leads",
    kicker: "Cold calling",
    summary:
      "BoldTrail is the CRM centerpiece and is not connected. Stavros cold calls commercial and residential work himself. Vulcan 7 is his personal dialer. It is not automated, and this office has no dial control. RE Leads Watch is assigned to watch BoldTrail and flag new leads for Stavros. That watch is not live.",
    sectors: SECTORS,
  },
  {
    id: "listings",
    order: 3,
    name: "Listings",
    kicker: "Commercial and residential",
    summary:
      "Comps, listing prep, photos, and descriptions for both commercial and residential. Sources are Crexi, LoopNet for comps and inventory, and Northeast Florida MLS. The MLS provider is known. Access setup is required and not connected.",
    sectors: SECTORS,
  },
  {
    id: "marketing",
    order: 4,
    name: "Marketing",
    kicker: "Ads, social, email, content",
    summary: "Ads, social, email, and content.",
    sectors: [] as readonly Sector[],
  },
  {
    id: "transactions",
    order: 5,
    name: "Transactions",
    kicker: "Contracts and closings",
    summary: "Contracts and closings.",
    sectors: [] as readonly Sector[],
  },
  {
    id: "research",
    order: 6,
    name: "Research",
    kicker: "Commercial and residential",
    summary:
      "Market analysis, neighborhoods, and valuations for both commercial and residential. Northeast Florida MLS is the named provider. Access setup is required and not connected.",
    sectors: SECTORS,
  },
  {
    id: "media",
    order: 7,
    name: "Media",
    kicker: "Studio",
    summary: "Media studio floor.",
    sectors: [] as readonly Sector[],
  },
] as const satisfies readonly {
  id: FloorId;
  order: number;
  name: string;
  kicker: string;
  summary: string;
  sectors: readonly Sector[];
}[];

export type FloorDefinition = (typeof FLOORS)[number];

export const SLOT_IDS = [
  "hq.manager",
  "leads.caller",
  "leads.watch",
  "listings.desk",
  "marketing.desk",
  "transactions.desk",
  "research.desk",
  "media.desk",
] as const;

export type SlotId = (typeof SLOT_IDS)[number];

export interface SlotDefinition {
  id: SlotId;
  floorId: FloorId;
  title: string;
  kind: "bot" | "human";
  locked: boolean;
  botId: BotId | null;
}

const hq = botForFloor("hq");
const leads = botForFloor("leads");
const listings = botForFloor("listings");
const marketing = botForFloor("marketing");
const transactions = botForFloor("transactions");
const research = botForFloor("research");
const media = botForFloor("media");

export const SLOTS: readonly SlotDefinition[] = [
  { id: "hq.manager", floorId: "hq", title: hq.name, kind: "bot", locked: true, botId: hq.id },
  { id: "leads.caller", floorId: "leads", title: "Human caller", kind: "human", locked: true, botId: null },
  { id: "leads.watch", floorId: "leads", title: leads.name, kind: "bot", locked: false, botId: leads.id },
  { id: "listings.desk", floorId: "listings", title: listings.name, kind: "bot", locked: false, botId: listings.id },
  { id: "marketing.desk", floorId: "marketing", title: marketing.name, kind: "bot", locked: false, botId: marketing.id },
  {
    id: "transactions.desk",
    floorId: "transactions",
    title: transactions.name,
    kind: "bot",
    locked: false,
    botId: transactions.id,
  },
  { id: "research.desk", floorId: "research", title: research.name, kind: "bot", locked: false, botId: research.id },
  { id: "media.desk", floorId: "media", title: media.name, kind: "bot", locked: false, botId: media.id },
];

export const TEAMS = FLOORS.map((floor) => ({
  id: floor.id,
  name: `${floor.name} team`,
  floorId: floor.id,
  slotIds: SLOTS.filter((slot) => slot.floorId === floor.id).map((slot) => slot.id),
}));

export const STAVROS = {
  id: "stavros",
  name: "Stavros",
  role: "Human cold caller",
  sectors: SECTORS,
  hasMlsAccess: true,
  dialerProduct: "Vulcan 7",
  summary:
    "Stavros covers commercial and residential real estate and has MLS access. He cold calls himself. Vulcan 7 is his personal dialer and is not automated. This viewer does not place calls and does not collect MLS credentials.",
} as const;

export const ROUTINES_ENABLED = false;

export function floorById(floorId: FloorId): FloorDefinition {
  const floor = FLOORS.find((item) => item.id === floorId);
  if (!floor) throw new Error("Unknown floor");
  return floor;
}

export function slotById(slotId: SlotId): SlotDefinition {
  const slot = SLOTS.find((item) => item.id === slotId);
  if (!slot) throw new Error("Unknown slot");
  return slot;
}

export function slotsForFloor(floorId: FloorId): SlotDefinition[] {
  return SLOTS.filter((slot) => slot.floorId === floorId);
}
