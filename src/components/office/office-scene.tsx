"use client";

import { useEffect, useRef, useState } from "react";
import type { BotId } from "@/lib/office/allowlist";
import { botById, chatLinkForBot, OFFICE_BOTS } from "@/lib/office/allowlist";
import { formatOfficeTime, formatWorkingDuration, type DeskActivity } from "@/lib/office/activity";
import { canAssign, type Seat } from "@/lib/office/assignments";
import { slotById, type SlotId } from "@/lib/office/definitions";
import { figureForOccupant } from "@/lib/office/figures";
import type { IsoSnapshot, ProjectPoint } from "@/components/office/iso-types";
import { botRequiresMlsSetup } from "@/lib/office/mls";
import { statusTone } from "@/lib/office/motion";
import { stackedFloors } from "@/lib/office/scene-layout";
import type { OfficeState } from "@/lib/office/state";

const FLOOR_STACK = stackedFloors();

export function OfficeScene({
  state,
  snapshot,
  onSelect,
  onAssign,
}: {
  state: OfficeState;
  snapshot: IsoSnapshot;
  onSelect: (slotId: SlotId | null) => void;
  onAssign: (slotId: SlotId, botId: BotId) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const calloutRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGLineElement>(null);
  const snapshotRef = useRef(snapshot);
  const onSelectRef = useRef(onSelect);
  snapshotRef.current = snapshot;
  onSelectRef.current = onSelect;
  const [webgl, setWebgl] = useState<boolean | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dead = false;
    let dispose = () => {};
    void import("@/components/office/iso-world").then((mod) => {
      if (dead || !canvasRef.current) return;
      dispose = mod.mountIsoOffice(canvasRef.current, {
        getSnapshot: () => snapshotRef.current,
        onSelect: (slotId) => onSelectRef.current(slotId),
        onProject: (point) => placeCallout(point, canvasRef.current, calloutRef.current, lineRef.current),
        onContext: (ok) => {
          if (!dead) setWebgl(ok);
        },
      });
    });
    return () => {
      dead = true;
      dispose();
    };
  }, []);

  const seat = state.seats.find((item) => item.slotId === state.selectedSlotId) ?? null;

  return (
    <>
      <canvas
        ref={canvasRef}
        className="iso-canvas"
        data-office-model="isometric"
        aria-label="Isometric office. Drag to pan, scroll to zoom."
      />
      <svg className="iso-connector" aria-hidden="true">
        <line ref={lineRef} />
      </svg>
      <div ref={calloutRef} className="iso-callout term" data-bot-panel data-show="0">
        {seat ? (
          <SeatCallout
            seat={seat}
            rows={snapshot.rows}
            look={seat.occupantId && seat.occupantId !== "stavros" ? state.looks[seat.occupantId] : undefined}
            onSelect={onSelect}
            onAssign={onAssign}
          />
        ) : null}
      </div>
      {webgl === false ? (
        <p className="iso-fallback">This browser could not start the 3D office. The floor list still tracks the stream.</p>
      ) : null}
    </>
  );
}

function placeCallout(
  point: ProjectPoint | null,
  canvas: HTMLCanvasElement | null,
  callout: HTMLDivElement | null,
  line: SVGLineElement | null,
) {
  if (!callout || !line || !canvas) return;
  if (!point) {
    callout.dataset.show = "0";
    line.style.display = "none";
    return;
  }
  callout.dataset.show = "1";
  const width = callout.offsetWidth || 260;
  const height = callout.offsetHeight || 180;
  const margin = 8;
  let left = point.x + 26;
  if (left + width > canvas.clientWidth - margin) left = point.x - width - 26;
  left = Math.max(margin, Math.min(left, canvas.clientWidth - width - margin));
  let top = point.y - height * 0.35;
  top = Math.max(margin, Math.min(top, canvas.clientHeight - height - margin));
  callout.style.left = `${left}px`;
  callout.style.top = `${top}px`;
  const anchorX = left > point.x ? left : left + width;
  line.style.display = "";
  line.setAttribute("x1", String(point.x));
  line.setAttribute("y1", String(point.y));
  line.setAttribute("x2", String(anchorX));
  line.setAttribute("y2", String(top + 18));
}

function SeatCallout({
  seat,
  rows,
  look,
  onSelect,
  onAssign,
}: {
  seat: Seat;
  rows: DeskActivity[];
  look: { label: string; note: string } | undefined;
  onSelect: (slotId: SlotId | null) => void;
  onAssign: (slotId: SlotId, botId: BotId) => void;
}) {
  const slot = slotById(seat.slotId);
  const floor = FLOOR_STACK.find((item) => item.id === slot.floorId);
  const figure = figureForOccupant(seat.occupantId);
  const bot = seat.occupantId && seat.occupantId !== "stavros" ? botById(seat.occupantId) : null;
  const row = bot ? rows.find((item) => item.botId === bot.id) : undefined;
  const quiet = bot ? (row?.quiet ?? true) : false;
  const statusText =
    seat.occupantId === "stavros" ? "human caller" : bot ? (quiet ? "quiet" : (row?.currentStatus ?? "quiet")) : "empty";
  const tone = seat.occupantId === "stavros" ? "info" : statusTone(row?.currentStatus ?? null, quiet || !bot);
  const step = seat.occupantId === "stavros" ? "Vulcan 7 manual, not automated" : row?.currentStep || "—";
  const today = row
    ? `${row.updatesToday} upd · ${row.startedToday} start · ${row.doneToday} done · ${row.errorsToday} err · ${formatWorkingDuration(row.workingMsToday)}`
    : "—";

  return (
    <>
      <button type="button" className="callout-close" onClick={() => onSelect(null)} aria-label="Close bot panel">
        x
      </button>
      <div className="kv">
        <span className="k">name</span>
        <span>{figure?.name ?? "Unassigned"}</span>
        <span className="k">floor</span>
        <span>{floor?.label ?? slot.floorId}</span>
        <span className="k">status</span>
        <span className={tone}>{statusText}</span>
        <span className="k">step</span>
        <span className="info">{step}</span>
        <span className="k">seen</span>
        <span>{bot ? formatOfficeTime(row?.lastSeenAt ?? null) : "—"}</span>
        <span className="k">today</span>
        <span>{today}</span>
      </div>
      {bot ? (
        <p>
          <button
            type="button"
            onClick={() => {
              window.location.assign(chatLinkForBot(bot.id));
            }}
          >
            open chat
          </button>
          <span className="info"> {chatLinkForBot(bot.id)}</span>
        </p>
      ) : null}
      {look ? (
        <p className="info">
          {look.label}. {look.note}
        </p>
      ) : null}
      {bot && botRequiresMlsSetup(bot.id) ? (
        <p className="info">Northeast Florida MLS access required. Not connected.</p>
      ) : null}
      <SeatAssign seat={seat} onAssign={onAssign} />
    </>
  );
}

function SeatAssign({
  seat,
  onAssign,
}: {
  seat: Seat;
  onAssign: (slotId: SlotId, botId: BotId) => void;
}) {
  const [choice, setChoice] = useState(seat.occupantId && seat.occupantId !== "stavros" ? seat.occupantId : "");
  useEffect(() => {
    setChoice(seat.occupantId && seat.occupantId !== "stavros" ? seat.occupantId : "");
  }, [seat.slotId, seat.occupantId]);
  if (seat.occupantId === "stavros" || seat.locked) {
    return seat.locked ? <p className="dim">Confirmed seat. RE Office Manager stays here.</p> : null;
  }
  const eligible = OFFICE_BOTS.filter((candidate) => canAssign(candidate.id, seat.slotId));
  return (
    <details>
      <summary>seat</summary>
      <label htmlFor="seat-bot">Local assignment</label>
      <select id="seat-bot" value={choice} onChange={(event) => setChoice(event.target.value)}>
        <option value="">Leave unassigned</option>
        {eligible.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!choice}
        onClick={() => {
          if (choice) onAssign(seat.slotId, choice as BotId);
        }}
      >
        Seat this bot
      </button>
    </details>
  );
}
