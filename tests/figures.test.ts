import { describe, expect, it } from "vitest";
import { OFFICE_BOTS } from "@/lib/office/allowlist";
import { initialSeats } from "@/lib/office/assignments";
import { FLOORS } from "@/lib/office/definitions";
import { FIGURES, figureForOccupant, presenceLabel } from "@/lib/office/figures";

describe("desk figures", () => {
  it("gives every confirmed occupant a distinct seated figure before any stream message", () => {
    const seats = initialSeats();
    const figures = seats.map((seat) => figureForOccupant(seat.occupantId));
    expect(figures.every((figure) => figure !== null)).toBe(true);
    expect(figures.map((figure) => figure?.posture)).toEqual(Array(seats.length).fill("seated"));
    const colors = figures.map((figure) => figure?.body);
    expect(new Set(colors).size).toBe(colors.length);
    expect(figureForOccupant("stavros")?.shape).toBe("human");
    for (const bot of OFFICE_BOTS) {
      expect(figureForOccupant(bot.id)).toMatchObject({ name: bot.name, shape: "bot", posture: "seated" });
    }
    expect(Object.keys(FIGURES)).toHaveLength(8);
  });

  it("covers all seven floors and leaves unknown status unknown", () => {
    const floorsWithFigures = new Set(
      initialSeats()
        .map((seat) => seat.occupantId)
        .filter((id): id is NonNullable<typeof id> => id !== null)
        .map((id) => (id === "stavros" ? "leads" : OFFICE_BOTS.find((bot) => bot.id === id)?.floorId)),
    );
    expect([...floorsWithFigures].sort()).toEqual(FLOORS.map((floor) => floor.id).sort());
    expect(presenceLabel("bot", undefined)).toBe("No status received");
    expect(presenceLabel("human", undefined)).toBe("Human caller. No bot status.");
    expect(presenceLabel("empty", undefined)).toBe("Unassigned");
    expect(presenceLabel("bot", { status: "working", step: "Reading a note" })).toBe("working · Reading a note");
    expect(figureForOccupant(null)).toBeNull();
    expect(JSON.stringify(FIGURES)).not.toMatch(/working|idle|waiting_user/);
  });
});