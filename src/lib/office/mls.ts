import { LISTINGS_DESK_ID, MARKET_RESEARCH_ID, type BotId } from "@/lib/office/allowlist";

/** Provider is known. Access is still not connected. No credential fields exist. */
export const MLS_PROVIDER = "Northeast Florida MLS" as const;

export const MLS_SETUP_INPUTS = [
  {
    id: "mls-provider",
    label: "MLS provider",
    required: true as const,
    value: MLS_PROVIDER,
    providerKnown: true as const,
    connected: false as const,
    collectsCredentials: false as const,
  },
  {
    id: "mls-access",
    label: "MLS access setup",
    required: true as const,
    value: null,
    status: "required" as const,
    connected: false as const,
    collectsCredentials: false as const,
  },
] as const;

export const MLS_BOT_IDS = [LISTINGS_DESK_ID, MARKET_RESEARCH_ID] as const satisfies readonly BotId[];

export function botRequiresMlsSetup(botId: BotId): boolean {
  return MLS_BOT_IDS.some((id) => id === botId);
}

export function mlsSetupHasCredentialField(): boolean {
  const keys = new Set<string>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      keys.add(key.toLowerCase());
      visit(child);
    }
  };
  visit(MLS_SETUP_INPUTS);
  return ["password", "username", "secret", "token", "credential"].some((word) => keys.has(word));
}
