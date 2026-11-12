import { useEffect, useState } from "react";
import { botById, type BotId, type FloorId } from "@/lib/office/allowlist";
import { servicesOnFloor } from "@/lib/adapters/placeholders";
import type { Seat } from "@/lib/office/assignments";
import {
  formatWorkingDuration,
  summarizeDeskActivity,
  type DeskActivity,
} from "@/lib/office/activity";
import { FLOORS, slotsForFloor } from "@/lib/office/definitions";
import { figureForOccupant, presenceLabel } from "@/lib/office/figures";
import type { OfficeState } from "@/lib/office/state";
import { BotFigure, EmptyChair } from "@/components/office/bot-figure";

function chipText(product: string): string {
  if (product === "BoldTrail") return "BoldTrail · CRM · not connected";
  if (product === "Vulcan 7") return "Vulcan 7 · personal dialer · not automated";
  if (product === "LoopNet") return "LoopNet · comps and inventory · not connected";
  if (product === "Crexi") return "Crexi · not connected";
  if (product === "Northeast Florida MLS") return "Northeast Florida MLS · access required · not connected";
  return `${product} · not connected`;
}

export function OfficeScene({
  state,
  yaw,
  onYaw,
  onSelect,
}: {
  state: OfficeState;
  yaw: number;
  onYaw: (yaw: number) => void;
  onSelect: (slotId: Seat["slotId"]) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const activity = summarizeDeskActivity(state.statusLog, now);

  return (
    <div className="office-column">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-display text-xs uppercase tracking-[0.22em] text-[#8c6a32]">Model</p>
          <h2 className="font-display text-2xl text-[#1c1915]">Seven floors, each with a seated figure</h2>
        </div>
        <label className="flex min-w-48 flex-1 items-center gap-3 text-sm text-[#5c5346] sm:max-w-xs">
          <span className="shrink-0">Tilt floors</span>
          <input
            type="range"
            min={-18}
            max={18}
            value={yaw}
            onChange={(event) => onYaw(Number(event.target.value))}
            aria-label="Tilt the floor planks"
            className="w-full accent-[#1e3a32]"
          />
        </label>
      </div>
      <div className="office-stage" data-office-model="building" style={{ ["--yaw" as string]: `${yaw}deg` }}>
        {FLOORS.map((floor) => {
          const seats = slotsForFloor(floor.id)
            .map((slot) => state.seats.find((seat) => seat.slotId === slot.id))
            .filter((seat): seat is Seat => Boolean(seat));
          const services = servicesOnFloor(floor.id);
          const summary = activity.find((row) => row.floorId === floor.id) ?? null;
          return (
            <section key={floor.id} className="floor-lane" data-floor={floor.id} aria-labelledby={`floor-${floor.id}`}>
              <div className="floor-label">
                <span className="floor-num">{String(floor.order).padStart(2, "0")}</span>
                <h3 id={`floor-${floor.id}`} className="floor-name">
                  {floor.name}
                </h3>
                <p className="floor-kicker">{floor.kicker}</p>
              </div>
              <div className="floor-stage">
                {summary ? <FloorBadges summary={summary} /> : null}
                <div className="floor-body">
                <div className="floor-cast">
                  {seats.map((seat) => (
                    <DeskStation
                      key={seat.slotId}
                      seat={seat}
                      floorId={floor.id}
                      selected={state.selectedSlotId === seat.slotId}
                      state={state}
                      summary={summary}
                      onSelect={onSelect}
                    />
                  ))}
                </div>
                {services.length > 0 ? (
                  <div className="floor-sources">
                    {services.map((service) => (
                      <p key={service.id} className={`source-chip ${service.centerpiece ? "source-chip-center" : ""}`}>
                        {chipText(service.product)}
                      </p>
                    ))}
                  </div>
                ) : null}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function FloorBadges({ summary }: { summary: DeskActivity }) {
  const presence = summary.quiet ? "quiet" : summary.currentStatus ?? "quiet";
  return (
    <div className="floor-badges" data-floor-badges={summary.floorId}>
      <span className="metric-badge" data-metric="presence">
        {presence}
      </span>
      <span className="metric-badge" data-metric="updates">
        {summary.updatesToday} today
      </span>
      <span className="metric-badge" data-metric="tasks">
        {summary.startedToday} started · {summary.doneToday} done
      </span>
      <span className="metric-badge" data-metric="errors">
        {summary.errorsToday} errors
      </span>
      <span className="metric-badge" data-metric="working">
        {formatWorkingDuration(summary.workingMsToday)} working
      </span>
    </div>
  );
}

function DeskStation({
  seat,
  floorId,
  selected,
  state,
  summary,
  onSelect,
}: {
  seat: Seat;
  floorId: FloorId;
  selected: boolean;
  state: OfficeState;
  summary: DeskActivity | null;
  onSelect: (slotId: Seat["slotId"]) => void;
}) {
  const figure = figureForOccupant(seat.occupantId);
  const bot = seat.occupantId && seat.occupantId !== "stavros" ? botById(seat.occupantId as BotId) : null;
  const kind = seat.occupantId === "stavros" ? "human" : seat.occupantId ? "bot" : "empty";
  const status = bot ? state.statuses[bot.id] : undefined;
  const quiet = kind === "bot" && (summary?.quiet ?? true);
  const label = figure?.name ?? "Unassigned";
  const presence = quiet ? "quiet" : presenceLabel(kind, status);
  const slotTitle = slotsForFloor(floorId).find((slot) => slot.id === seat.slotId)?.title ?? seat.slotId;

  return (
    <button
      type="button"
      className="station"
      data-occupant={seat.occupantId ?? ""}
      data-floor-seat={seat.slotId}
      aria-pressed={selected}
      onClick={() => onSelect(seat.slotId)}
    >
      {figure ? <BotFigure spec={figure} /> : <EmptyChair />}
      <span className="nameplate" title={label}>
        {label}
      </span>
      <span className="seat-role">{seat.occupantId === "stavros" ? "Human caller" : bot?.lane ?? slotTitle}</span>
      <span className="presence" data-status={quiet ? "quiet" : status ? status.status : "unknown"}>
        {presence}
      </span>
    </button>
  );
}
