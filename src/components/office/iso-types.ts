import type { FloorId } from "@/lib/office/allowlist";
import type { DeskActivity } from "@/lib/office/activity";
import type { Seat } from "@/lib/office/assignments";
import type { SlotId } from "@/lib/office/definitions";

export interface ProjectPoint {
  x: number;
  y: number;
}

export interface IsoSnapshot {
  seats: Seat[];
  selectedSlotId: SlotId | null;
  rows: DeskActivity[];
  explode: boolean;
  night: boolean;
  focusFloor: FloorId | null;
}

export interface IsoHooks {
  getSnapshot: () => IsoSnapshot;
  onSelect: (slotId: SlotId | null) => void;
  onProject: (point: ProjectPoint | null) => void;
  onContext: (ok: boolean) => void;
}
