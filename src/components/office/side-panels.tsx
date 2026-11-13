"use client";

import { useMemo, useState } from "react";
import { botById, type FloorId } from "@/lib/office/allowlist";
import { servicesOnFloor } from "@/lib/adapters/placeholders";
import {
  formatOfficeTime,
  formatWorkingDuration,
  recentStatusFeed,
  type DeskActivity,
} from "@/lib/office/activity";
import type { Seat } from "@/lib/office/assignments";
import { FLOORS, slotsForFloor, type SlotId } from "@/lib/office/definitions";
import { figureForOccupant } from "@/lib/office/figures";
import { connectionLine, connectionTone, statusTone, tallyDesks } from "@/lib/office/motion";
import { stackedFloors } from "@/lib/office/scene-layout";
import type { OfficeState } from "@/lib/office/state";
import { formatStreamPhase, type PublicPhase } from "@/lib/ntfy/stream";
import { DEFAULT_NTFY_BASE } from "@/lib/ntfy/topic";

const FLOOR_STACK = stackedFloors();

export function SidePanels({
  state,
  rows,
  now,
  phase,
  focusFloor,
  explode,
  night,
  panelsOpen,
  baseUrl,
  draftTopic,
  remember,
  reveal,
  topicError,
  baseError,
  onBaseUrl,
  onDraftTopic,
  onRemember,
  onReveal,
  onListen,
  onStop,
  onForget,
  onSelect,
  onFocusFloor,
  onExplode,
  onNight,
  onPanels,
  onRestore,
}: {
  state: OfficeState;
  rows: DeskActivity[];
  now: number;
  phase: PublicPhase;
  focusFloor: FloorId | null;
  explode: boolean;
  night: boolean;
  panelsOpen: boolean;
  baseUrl: string;
  draftTopic: string;
  remember: boolean;
  reveal: boolean;
  topicError: string | null;
  baseError: string | null;
  onBaseUrl: (value: string) => void;
  onDraftTopic: (value: string) => void;
  onRemember: (value: boolean) => void;
  onReveal: (value: boolean) => void;
  onListen: () => void;
  onStop: () => void;
  onForget: () => void;
  onSelect: (slotId: SlotId | null) => void;
  onFocusFloor: (floorId: FloorId | null) => void;
  onExplode: (value: boolean) => void;
  onNight: (value: boolean) => void;
  onPanels: (value: boolean) => void;
  onRestore: () => void;
}) {
  const tally = tallyDesks(rows);
  return (
    <>
      <aside className="iso-side iso-left" aria-label="Office terminal">
        <section className="term">
          <h2>ls floors/</h2>
          <button type="button" className="linkish" aria-current={focusFloor === null} onClick={() => onFocusFloor(null)}>
            ./
          </button>
          {FLOOR_STACK.map((floor) => (
            <button
              key={floor.id}
              type="button"
              className="linkish"
              data-floor={floor.id}
              aria-current={focusFloor === floor.id}
              onClick={() => onFocusFloor(floor.id)}
            >
              {floor.label}
            </button>
          ))}
        </section>
        <section className="term term-stats">
          <p>
            <span className="k">waiting</span> <span className={tally.waiting ? "bad" : ""}>{tally.waiting}</span>
          </p>
          <p>
            <span className="k">done</span> <span className={tally.done ? "ok" : ""}>{tally.done}</span>
          </p>
        </section>
        <RoutinesPanel state={state} />
        <ActivityFeed state={state} now={now} />
        <StreamCard
          phase={phase}
          baseUrl={baseUrl}
          draftTopic={draftTopic}
          remember={remember}
          reveal={reveal}
          topicError={topicError}
          baseError={baseError}
          onBaseUrl={onBaseUrl}
          onDraftTopic={onDraftTopic}
          onRemember={onRemember}
          onReveal={onReveal}
          onListen={onListen}
          onStop={onStop}
          onForget={onForget}
          onRestore={onRestore}
        />
      </aside>
      <aside className="iso-side iso-right" aria-label="Team and usage">
        <TeamStatus
          state={state}
          rows={rows}
          onSelect={onSelect}
          onFocusFloor={onFocusFloor}
        />
        <UsagePanel state={state} rows={rows} />
      </aside>
      <footer className="iso-prompt term">
        <p>$ grokbot office --live</p>
        <p className={connectionTone(phase.phase)} data-connection>
          {connectionLine(phase.phase, tally.reported, FLOORS.length)}
        </p>
        <p className="info">{formatStreamPhase(phase)}</p>
        <div className="prompt-actions">
          <button type="button" aria-pressed={explode} onClick={() => onExplode(!explode)}>
            explode
          </button>
          <button type="button" aria-pressed={night} onClick={() => onNight(!night)}>
            night
          </button>
          <button type="button" aria-pressed={panelsOpen} onClick={() => onPanels(!panelsOpen)}>
            panels
          </button>
        </div>
      </footer>
    </>
  );
}

function TeamStatus({
  state,
  rows,
  onSelect,
  onFocusFloor,
}: {
  state: OfficeState;
  rows: DeskActivity[];
  onSelect: (slotId: SlotId | null) => void;
  onFocusFloor: (floorId: FloorId) => void;
}) {
  return (
    <section className="term">
      <h2>team status</h2>
      {FLOOR_STACK.map((floor) => {
        const seats = slotsForFloor(floor.id)
          .map((slot) => state.seats.find((seat) => seat.slotId === slot.id))
          .filter((seat): seat is Seat => Boolean(seat));
        const services = servicesOnFloor(floor.id);
        return (
          <div key={floor.id} className="team-floor" data-team-floor={floor.id}>
            <button type="button" className="linkish" onClick={() => onFocusFloor(floor.id)}>
              {floor.label}
            </button>
            {seats.map((seat) => {
              const figure = figureForOccupant(seat.occupantId);
              const bot = seat.occupantId && seat.occupantId !== "stavros" ? botById(seat.occupantId) : null;
              const row = bot ? rows.find((item) => item.botId === bot.id) : undefined;
              const quiet = bot ? (row?.quiet ?? true) : false;
              const label =
                seat.occupantId === "stavros" ? "human" : quiet ? "quiet" : (row?.currentStatus ?? "quiet");
              const tone = seat.occupantId === "stavros" ? "info" : statusTone(row?.currentStatus ?? null, quiet || !bot);
              return (
                <button
                  key={seat.slotId}
                  type="button"
                  className="linkish team-seat"
                  data-floor-seat={seat.slotId}
                  aria-pressed={state.selectedSlotId === seat.slotId}
                  onClick={() => {
                    onFocusFloor(floor.id);
                    onSelect(seat.slotId);
                  }}
                >
                  <span>{figure?.name ?? "Unassigned"}</span> <span className={tone}>{label}</span>
                </button>
              );
            })}
            {services.map((service) => (
              <p key={service.id} className="info">
                {service.product} · {service.role} · not connected
                {service.product === "Vulcan 7" ? " · not automated" : ""}
              </p>
            ))}
          </div>
        );
      })}
    </section>
  );
}

function ActivityFeed({ state, now }: { state: OfficeState; now: number }) {
  const [floor, setFloor] = useState<FloorId | "all">("all");
  const feed = useMemo(() => recentStatusFeed(state.statusLog, floor, now), [state.statusLog, floor, now]);
  return (
    <section className="term">
      <h2>tail -f activity.log</h2>
      <label htmlFor="activity-floor">floor</label>
      <select
        id="activity-floor"
        value={floor}
        onChange={(event) => setFloor(event.target.value as FloorId | "all")}
      >
        <option value="all">all</option>
        {FLOORS.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      {feed.length === 0 ? (
        <p className="dim">No status lines for this floor in the loaded history.</p>
      ) : (
        <ul data-activity-feed>
          {feed.map((entry) => {
            const bot = botById(entry.botId);
            return (
              <li
                key={entry.id}
                data-activity-row
                data-bot={bot.name}
                data-status={entry.status}
                data-floor={bot.floorId}
              >
                <p className="dim">{formatOfficeTime(entry.at)}</p>
                <p>
                  <span className={statusTone(entry.status, false)}>{bot.name}</span> · {entry.status}
                </p>
                <p className="info">{entry.step}</p>
              </li>
            );
          })}
        </ul>
      )}
      {state.suppressedCount > 0 ? (
        <p className="dim">Status lines from other bot names are left out of this office.</p>
      ) : null}
    </section>
  );
}

function UsagePanel({ state, rows }: { state: OfficeState; rows: DeskActivity[] }) {
  const ranked = [...rows].sort((a, b) => b.updatesToday - a.updatesToday || a.name.localeCompare(b.name));
  const max = Math.max(1, ...ranked.map((row) => row.updatesToday));
  return (
    <section className="term">
      <h2>top --by usage</h2>
      <p className="info">Bars are today&apos;s status updates, scaled to the busiest desk. America/New_York.</p>
      <ul data-usage-table>
        {ranked.map((row) => (
          <li key={row.botId} data-usage-bot={row.name}>
            <p>
              {row.name}{" "}
              <span className={statusTone(row.currentStatus, row.quiet)} data-usage-status>
                {row.quiet ? "quiet" : row.currentStatus}
              </span>
            </p>
            <div className="bar" aria-hidden="true">
              <span className={statusTone(row.currentStatus, row.quiet)} style={{ width: `${(row.updatesToday / max) * 100}%` }} />
            </div>
            <p className="dim">
              <span data-usage-updates>{row.updatesToday}</span> upd · <span data-usage-started>{row.startedToday}</span>{" "}
              start · <span data-usage-done>{row.doneToday}</span> done ·{" "}
              <span data-usage-errors className={row.errorsToday ? "bad" : ""}>
                {row.errorsToday}
              </span>{" "}
              err · <span data-usage-working>{formatWorkingDuration(row.workingMsToday)}</span>
              {" · "}
              {formatOfficeTime(row.lastSeenAt)}
            </p>
          </li>
        ))}
      </ul>
      {state.usage === null ? (
        <p className="dim">No usage-percentage payload has been received.</p>
      ) : (
        <p className="info">
          Received usage payload: total_used_pct {state.usage.totalUsedPct}, resets_at {state.usage.resetsAt}.
          {state.usage.omittedRows > 0 ? " Rows outside this office were omitted." : ""}
        </p>
      )}
    </section>
  );
}

function RoutinesPanel({ state }: { state: OfficeState }) {
  const grouped = new Map<string, { name: string; items: string[] }>();
  for (const routine of state.inactiveRoutines) {
    const key = routine.botId ?? "office";
    const name = routine.botId ? botById(routine.botId).name : "Office";
    const current = grouped.get(key) ?? { name, items: [] };
    current.items.push(routine.name);
    grouped.set(key, current);
  }
  const lists = [...grouped.values()];
  return (
    <section className="term" data-routines-panel>
      <h2>crontab -l</h2>
      <p className="dim">Nothing here is scheduled.</p>
      {lists.length === 0 ? (
        <p>No routine list has arrived.</p>
      ) : (
        <ul>
          {lists.map((list) => (
            <li key={list.name} data-routines-bot={list.name}>
              <p>{list.name}</p>
              <ul>
                {list.items.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StreamCard(props: {
  phase: PublicPhase;
  baseUrl: string;
  draftTopic: string;
  remember: boolean;
  reveal: boolean;
  topicError: string | null;
  baseError: string | null;
  onBaseUrl: (value: string) => void;
  onDraftTopic: (value: string) => void;
  onRemember: (value: boolean) => void;
  onReveal: (value: boolean) => void;
  onListen: () => void;
  onStop: () => void;
  onForget: () => void;
  onRestore: () => void;
}) {
  return (
    <details className="term">
      <summary>stream</summary>
      <p className="info">{formatStreamPhase(props.phase)}</p>
      <label htmlFor="ntfy-base">ntfy host</label>
      <input
        id="ntfy-base"
        value={props.baseUrl}
        onChange={(event) => props.onBaseUrl(event.target.value)}
        placeholder={DEFAULT_NTFY_BASE}
        autoComplete="off"
        spellCheck={false}
      />
      {props.baseError ? <p className="bad">{props.baseError}</p> : null}
      <label htmlFor="shared-topic">Shared topic</label>
      <input
        id="shared-topic"
        type={props.reveal ? "text" : "password"}
        value={props.draftTopic}
        onChange={(event) => props.onDraftTopic(event.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      {props.topicError ? <p className="bad">{props.topicError}</p> : null}
      <label className="check">
        <input type="checkbox" checked={props.remember} onChange={(event) => props.onRemember(event.target.checked)} />
        Remember the topic in this browser only
      </label>
      <div className="prompt-actions">
        <button type="button" onClick={props.onListen}>
          Listen
        </button>
        <button type="button" onClick={props.onStop}>
          Stop
        </button>
        <button type="button" onClick={() => props.onReveal(!props.reveal)}>
          {props.reveal ? "Hide topic" : "Show topic"}
        </button>
        <button type="button" onClick={props.onForget}>
          Forget topic
        </button>
        <button type="button" onClick={props.onRestore}>
          Restore roster
        </button>
      </div>
      <p className="dim">
        One topic for every bot. A fragment link replaces it for this visit and is then removed from the address bar.
        Inbound stream links stay text and are never opened.
      </p>
    </details>
  );
}
