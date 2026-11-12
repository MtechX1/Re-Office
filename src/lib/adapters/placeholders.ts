import type { FloorId } from "@/lib/office/allowlist";
import { MLS_PROVIDER } from "@/lib/office/mls";
import { SECTORS, type Sector } from "@/lib/office/definitions";

export interface ServicePlaceholder {
  id: string;
  product: string;
  floors: readonly FloorId[];
  role: string;
  connection: "placeholder";
  connected: false;
  liveMonitoring: false;
  automated: false;
  collectsCredentials: false;
  centerpiece: boolean;
  providerKnown: boolean;
  accessSetup: "not-applicable" | "required";
  sectors: readonly Sector[];
  summary: string;
}

export const SERVICE_PLACEHOLDERS = [
  {
    id: "boldtrail",
    product: "BoldTrail",
    floors: ["leads"],
    role: "Leads CRM",
    connection: "placeholder",
    connected: false,
    liveMonitoring: false,
    automated: false,
    collectsCredentials: false,
    centerpiece: true,
    providerKnown: true,
    accessSetup: "not-applicable",
    sectors: SECTORS,
    summary:
      "Named CRM placeholder. Not connected. This office does not log in, import, publish, or monitor live BoldTrail leads.",
  },
  {
    id: "vulcan7",
    product: "Vulcan 7",
    floors: ["leads"],
    role: "Personal dialer",
    connection: "placeholder",
    connected: false,
    liveMonitoring: false,
    automated: false,
    collectsCredentials: false,
    centerpiece: false,
    providerKnown: true,
    accessSetup: "not-applicable",
    sectors: SECTORS,
    summary:
      "Stavros's personal dialer. He places his own calls. Not automated. Not connected. This office has no dial control.",
  },
  {
    id: "crexi",
    product: "Crexi",
    floors: ["listings"],
    role: "Listing source",
    connection: "placeholder",
    connected: false,
    liveMonitoring: false,
    automated: false,
    collectsCredentials: false,
    centerpiece: false,
    providerKnown: true,
    accessSetup: "not-applicable",
    sectors: SECTORS,
    summary: "Disconnected listing source for commercial and residential work. No account and no import.",
  },
  {
    id: "loopnet",
    product: "LoopNet",
    floors: ["listings"],
    role: "Comps and inventory",
    connection: "placeholder",
    connected: false,
    liveMonitoring: false,
    automated: false,
    collectsCredentials: false,
    centerpiece: false,
    providerKnown: true,
    accessSetup: "not-applicable",
    sectors: SECTORS,
    summary: "Disconnected source for comps and inventory, commercial and residential. No account and no import.",
  },
  {
    id: "northeast-florida-mls",
    product: MLS_PROVIDER,
    floors: ["listings", "research"],
    role: "MLS",
    connection: "placeholder",
    connected: false,
    liveMonitoring: false,
    automated: false,
    collectsCredentials: false,
    centerpiece: false,
    providerKnown: true,
    accessSetup: "required",
    sectors: SECTORS,
    summary:
      "Provider is Northeast Florida MLS. Access setup is required and not connected. This viewer does not collect passwords or other credentials and does not import MLS data.",
  },
] as const satisfies readonly ServicePlaceholder[];

export function servicesOnFloor(floorId: FloorId): ServicePlaceholder[] {
  return SERVICE_PLACEHOLDERS.filter((service) =>
    (service.floors as readonly FloorId[]).includes(floorId),
  );
}
