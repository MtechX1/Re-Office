import { describe, expect, it } from "vitest";
import { SERVICE_PLACEHOLDERS, servicesOnFloor } from "@/lib/adapters/placeholders";
import {
  CLOSING_DESK_ID,
  EXCLUDED_BOTS,
  LEADS_WATCH_ID,
  LISTINGS_DESK_ID,
  MANAGER_ID,
  MARKETING_DESK_ID,
  MARKET_RESEARCH_ID,
  MEDIA_STUDIO_ID,
  OFFICE_BOTS,
  chatLinkForBot,
  matchBot,
} from "@/lib/office/allowlist";
import { canAssign, initialSeats } from "@/lib/office/assignments";
import { FLOORS, ROUTINES_ENABLED, SLOTS, STAVROS, TEAMS } from "@/lib/office/definitions";
import { MLS_BOT_IDS, MLS_PROVIDER, MLS_SETUP_INPUTS, botRequiresMlsSetup, mlsSetupHasCredentialField } from "@/lib/office/mls";
import { createOfficeState } from "@/lib/office/state";

const IDS = [
  MANAGER_ID,
  LEADS_WATCH_ID,
  LISTINGS_DESK_ID,
  MARKETING_DESK_ID,
  CLOSING_DESK_ID,
  MARKET_RESEARCH_ID,
  MEDIA_STUDIO_ID,
];

describe("floor roster", () => {
  it("stacks the seven floors in order with one confirmed bot each", () => {
    expect(FLOORS.map((floor) => floor.id)).toEqual([
      "hq",
      "leads",
      "listings",
      "marketing",
      "transactions",
      "research",
      "media",
    ]);
    expect(OFFICE_BOTS.map((bot) => bot.floorId)).toEqual(FLOORS.map((floor) => floor.id));
    expect(new Set(IDS).size).toBe(7);
    expect(OFFICE_BOTS.map((bot) => bot.id)).toEqual(IDS);
    expect(TEAMS).toHaveLength(7);
    expect(ROUTINES_ENABLED).toBe(false);
  });

  it("keeps the confirmed names and chat links", () => {
    expect(OFFICE_BOTS.map((bot) => bot.name)).toEqual([
      "RE Office Manager",
      "RE Leads Watch",
      "RE Listings Desk",
      "RE Marketing Desk",
      "RE Closing Desk",
      "RE Market Research",
      "RE Media Studio",
    ]);
    for (const bot of OFFICE_BOTS) {
      expect(chatLinkForBot(bot.id)).toBe(`grokbot://app/v1/agent?id=${bot.id}`);
    }
    const seats = initialSeats();
    expect(seats.find((seat) => seat.slotId === "hq.manager")?.occupantId).toBe(MANAGER_ID);
    expect(seats.find((seat) => seat.slotId === "leads.caller")?.occupantId).toBe("stavros");
    expect(seats.find((seat) => seat.slotId === "leads.watch")?.occupantId).toBe(LEADS_WATCH_ID);
    expect(createOfficeState().routinesEnabled).toBe(false);
  });

  it("describes leads without a live BoldTrail watch or an automated dialer", () => {
    const leads = FLOORS.find((floor) => floor.id === "leads");
    const watch = OFFICE_BOTS.find((bot) => bot.id === LEADS_WATCH_ID);
    const boldtrail = SERVICE_PLACEHOLDERS.find((service) => service.id === "boldtrail");
    const vulcan = SERVICE_PLACEHOLDERS.find((service) => service.id === "vulcan7");
    expect(leads?.summary).toContain("BoldTrail");
    expect(leads?.summary).toContain("not connected");
    expect(leads?.summary.toLowerCase()).toContain("not automated");
    expect(watch?.role).toContain("Watch BoldTrail");
    expect(watch?.summary).toContain("not monitoring live leads");
    expect(boldtrail).toMatchObject({
      product: "BoldTrail",
      connected: false,
      liveMonitoring: false,
      connection: "placeholder",
      centerpiece: true,
    });
    expect(vulcan).toMatchObject({
      product: "Vulcan 7",
      role: "Personal dialer",
      automated: false,
      connected: false,
      floors: ["leads"],
    });
    expect(vulcan?.summary.toLowerCase()).toContain("no dial control");
    expect(STAVROS.sectors).toEqual(["commercial", "residential"]);
    expect(STAVROS.hasMlsAccess).toBe(true);
    expect(STAVROS.dialerProduct).toBe("Vulcan 7");
  });

  it("covers both sectors on listings and research and names Northeast Florida MLS", () => {
    expect(MLS_PROVIDER).toBe("Northeast Florida MLS");
    expect(MLS_BOT_IDS).toEqual([LISTINGS_DESK_ID, MARKET_RESEARCH_ID]);
    expect(botRequiresMlsSetup(LISTINGS_DESK_ID)).toBe(true);
    expect(botRequiresMlsSetup(MARKET_RESEARCH_ID)).toBe(true);
    expect(botRequiresMlsSetup(LEADS_WATCH_ID)).toBe(false);
    expect(MLS_SETUP_INPUTS.map((item) => item.connected)).toEqual([false, false]);
    expect(MLS_SETUP_INPUTS.every((item) => item.required && item.collectsCredentials === false)).toBe(true);
    expect(MLS_SETUP_INPUTS[0].value).toBe("Northeast Florida MLS");
    expect(MLS_SETUP_INPUTS[1].value).toBeNull();
    expect(mlsSetupHasCredentialField()).toBe(false);

    const listings = servicesOnFloor("listings").map((service) => service.product);
    const research = servicesOnFloor("research").map((service) => service.product);
    expect(listings).toEqual(["Crexi", "LoopNet", "Northeast Florida MLS"]);
    expect(research).toEqual(["Northeast Florida MLS"]);
    expect(servicesOnFloor("listings").find((service) => service.product === "LoopNet")?.role).toBe(
      "Comps and inventory",
    );
    expect(servicesOnFloor("listings").every((service) => service.connected === false)).toBe(true);
    expect(servicesOnFloor("research")[0]).toMatchObject({
      providerKnown: true,
      accessSetup: "required",
      collectsCredentials: false,
      sectors: ["commercial", "residential"],
    });
    expect(FLOORS.find((floor) => floor.id === "listings")?.sectors).toEqual(["commercial", "residential"]);
    expect(FLOORS.find((floor) => floor.id === "research")?.sectors).toEqual(["commercial", "residential"]);
  });

  it("keeps marketing, closings, and media on their described floors", () => {
    expect(OFFICE_BOTS.find((bot) => bot.id === MARKETING_DESK_ID)?.role).toBe("Ads, social, email, and content");
    expect(OFFICE_BOTS.find((bot) => bot.id === CLOSING_DESK_ID)?.role).toBe("Contracts and closings");
    expect(OFFICE_BOTS.find((bot) => bot.id === MEDIA_STUDIO_ID)?.floorId).toBe("media");
    expect(SLOTS.find((slot) => slot.id === "hq.manager")?.locked).toBe(true);
    expect(canAssign(MANAGER_ID, "media.desk")).toBe(false);
    expect(canAssign(MEDIA_STUDIO_ID, "hq.manager")).toBe(false);
    expect(canAssign(MEDIA_STUDIO_ID, "listings.desk")).toBe(true);
  });

  it("rejects older roster names and the retired coordinator id", () => {
    for (const bot of EXCLUDED_BOTS) {
      expect(matchBot(bot.name).result).toBe("excluded");
      for (const id of bot.ids) expect(matchBot(id).result).toBe("excluded");
    }
    expect(matchBot("63630cda-0d74-428a-a066-f5ae66bbcba3").result).toBe("excluded");
    expect(matchBot(MANAGER_ID)).toEqual({ result: "allowed", botId: MANAGER_ID });
    expect(matchBot("RE Leads Watch")).toEqual({ result: "allowed", botId: LEADS_WATCH_ID });
    expect(matchBot("someone else").result).toBe("unknown");
    expect(JSON.stringify(OFFICE_BOTS)).not.toContain("63630cda-0d74-428a-a066-f5ae66bbcba3");
  });
});
