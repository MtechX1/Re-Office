import { isBotId, MANAGER_ID, type BotId } from "@/lib/office/allowlist";
import { SLOTS, type SlotId } from "@/lib/office/definitions";

export type OccupantId = BotId | "stavros";
export type SeatConfirmation = "confirmed" | "reassigned" | "unassigned";

export interface Seat {
  slotId: SlotId;
  occupantId: OccupantId | null;
  confirmation: SeatConfirmation;
  locked: boolean;
}

export const ARRANGEMENT_KEY = "re-office.arrangement";

export function initialSeats(): Seat[] {
  return SLOTS.map((slot) => {
    if (slot.kind === "human") {
      return {
        slotId: slot.id,
        occupantId: "stavros" as const,
        confirmation: "confirmed" as const,
        locked: true,
      };
    }
    return {
      slotId: slot.id,
      occupantId: slot.botId,
      confirmation: "confirmed" as const,
      locked: slot.locked,
    };
  });
}

export function homeSlotId(botId: BotId): SlotId {
  const slot = SLOTS.find((item) => item.botId === botId);
  if (!slot) throw new Error("Bot has no home slot");
  return slot.id;
}

export function canAssign(botId: BotId, slotId: SlotId): boolean {
  const slot = SLOTS.find((item) => item.id === slotId);
  if (!slot || slot.kind !== "bot") return false;
  if (botId === MANAGER_ID) return slotId === "hq.manager";
  if (slotId === "hq.manager") return false;
  return true;
}

export function assignSeat(seats: Seat[], slotId: SlotId, botId: BotId): Seat[] | null {
  if (!canAssign(botId, slotId)) return null;
  const next = seats.map((seat) => ({ ...seat }));
  const target = next.find((seat) => seat.slotId === slotId);
  if (!target || target.locked) return null;
  for (const seat of next) {
    if (seat.occupantId === botId && seat.slotId !== slotId && !seat.locked) {
      seat.occupantId = null;
      seat.confirmation = "unassigned";
    }
  }
  target.occupantId = botId;
  target.confirmation = homeSlotId(botId) === slotId ? "confirmed" : "reassigned";
  return next;
}

export function seatsAreUnique(seats: Seat[]): boolean {
  const seen = new Set<string>();
  for (const seat of seats) {
    if (!seat.occupantId || seat.occupantId === "stavros") continue;
    if (seen.has(seat.occupantId)) return false;
    seen.add(seat.occupantId);
  }
  return true;
}

export function loadArrangement(storage: Pick<Storage, "getItem">): Seat[] | null {
  try {
    const raw = storage.getItem(ARRANGEMENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const incoming = (parsed as { seats?: unknown }).seats;
    if (!Array.isArray(incoming)) return null;
    const next = initialSeats();
    for (const item of incoming) {
      if (!item || typeof item !== "object") return null;
      const slotId = (item as { slotId?: unknown }).slotId;
      const occupantId = (item as { occupantId?: unknown }).occupantId;
      if (typeof slotId !== "string") return null;
      const target = next.find((seat) => seat.slotId === slotId);
      if (!target) return null;
      if (target.locked) continue;
      if (occupantId === null) {
        target.occupantId = null;
        target.confirmation = "unassigned";
        continue;
      }
      if (typeof occupantId !== "string" || !isBotId(occupantId)) return null;
      if (!canAssign(occupantId, target.slotId)) return null;
      target.occupantId = occupantId;
      target.confirmation = homeSlotId(occupantId) === target.slotId ? "confirmed" : "reassigned";
    }
    if (!seatsAreUnique(next)) return null;
    return next;
  } catch {
    return null;
  }
}

export function saveArrangement(storage: Pick<Storage, "setItem">, seats: Seat[]): void {
  const payload = {
    seats: seats.map((seat) => ({
      slotId: seat.slotId,
      occupantId: seat.occupantId,
    })),
  };
  storage.setItem(ARRANGEMENT_KEY, JSON.stringify(payload));
}
