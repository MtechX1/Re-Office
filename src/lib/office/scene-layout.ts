import type { FloorId } from "@/lib/office/allowlist";
import { FLOORS, slotsForFloor, type SlotId } from "@/lib/office/definitions";

/** Distance between stacked floor origins before the explode gap. */
export const STACK_PITCH = 2.5;
/** Extra space between floors when explode is fully open. */
export const EXPLODE_GAP = 1.6;

export type FloorProp =
  | "meeting-table"
  | "phones"
  | "file-cabinets"
  | "board"
  | "cabinet"
  | "bookshelves"
  | "camera-light";

export const FLOOR_PROPS = {
  hq: "meeting-table",
  leads: "phones",
  listings: "file-cabinets",
  marketing: "board",
  transactions: "cabinet",
  research: "bookshelves",
  media: "camera-light",
} as const satisfies Record<FloorId, FloorProp>;

export interface StackedFloor {
  id: FloorId;
  name: string;
  label: string;
  indexFromTop: number;
  /** 0 is the ground floor. */
  level: number;
  prop: FloorProp;
}

export function floorLabel(name: string, indexFromTop: number): string {
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return `${String(indexFromTop).padStart(2, "0")}_${slug}`;
}

/** HQ is 00_HQ at the top. Media is the ground floor. */
export function stackedFloors(): StackedFloor[] {
  return FLOORS.map((floor, indexFromTop) => ({
    id: floor.id,
    name: floor.name,
    label: floorLabel(floor.name, indexFromTop),
    indexFromTop,
    level: FLOORS.length - 1 - indexFromTop,
    prop: FLOOR_PROPS[floor.id],
  }));
}

export function floorByLevel(level: number): StackedFloor | undefined {
  return stackedFloors().find((floor) => floor.level === level);
}

/** World Y of a floor origin. `explode` is 0 closed and 1 fully apart. */
export function floorBaseY(level: number, explode: number): number {
  const gap = Math.min(1, Math.max(0, explode)) * EXPLODE_GAP;
  return level * (STACK_PITCH + gap);
}

export interface DeskPoint {
  slotId: SlotId;
  x: number;
  z: number;
}

/** Desk pads in floor-local space. Leads has the caller and the watch. */
export function deskPoints(floorId: FloorId): DeskPoint[] {
  const slots = slotsForFloor(floorId);
  if (slots.length <= 1) {
    return slots.map((slot) => ({ slotId: slot.id, x: -2.15, z: 0.42 }));
  }
  return slots.map((slot, index) => ({
    slotId: slot.id,
    x: -3.35 + index * 2.2,
    z: 0.42,
  }));
}
