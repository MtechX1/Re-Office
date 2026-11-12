"use client";

import { useEffect, useMemo, useState } from "react";
import { botById, chatLinkForBot, OFFICE_BOTS, type BotId, type FloorId } from "@/lib/office/allowlist";
import { canAssign, type Seat } from "@/lib/office/assignments";
import { servicesOnFloor } from "@/lib/adapters/placeholders";
import { botRequiresMlsSetup, MLS_SETUP_INPUTS } from "@/lib/office/mls";
import { FLOORS, slotById, STAVROS, type SlotId } from "@/lib/office/definitions";
import {
  formatOfficeTime,
  formatWorkingDuration,
  recentStatusFeed,
  summarizeDeskActivity,
} from "@/lib/office/activity";
import type { OfficeState } from "@/lib/office/state";
import { formatStreamPhase, type PublicPhase } from "@/lib/ntfy/stream";
import { DEFAULT_NTFY_BASE } from "@/lib/ntfy/topic";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export function SidePanels({
  state,
  phase,
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
  onAssign,
  onRestore,
}: {
  state: OfficeState;
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
  onAssign: (slotId: SlotId, botId: BotId) => void;
  onRestore: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
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
      />
      <DeskDetail state={state} onAssign={onAssign} onRestore={onRestore} />
      <ActivityFeed state={state} />
      <UsagePanel state={state} />
      <RoutinesPanel state={state} />
    </div>
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
}) {
  return (
    <Card>
      <CardHeader className="p-4">
        <CardTitle className="font-display text-lg">Shared stream</CardTitle>
        <CardDescription>{formatStreamPhase(props.phase)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        <div className="space-y-1.5">
          <Label htmlFor="ntfy-base">ntfy host</Label>
          <Input
            id="ntfy-base"
            value={props.baseUrl}
            onChange={(event) => props.onBaseUrl(event.target.value)}
            placeholder={DEFAULT_NTFY_BASE}
            autoComplete="off"
            spellCheck={false}
          />
          {props.baseError ? <p className="text-sm text-[#8c3a32]">{props.baseError}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="shared-topic">Shared topic</Label>
          <Input
            id="shared-topic"
            type={props.reveal ? "text" : "password"}
            value={props.draftTopic}
            onChange={(event) => props.onDraftTopic(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="Office topic is used when this is empty"
          />
          {props.topicError ? <p className="text-sm text-[#8c3a32]">{props.topicError}</p> : null}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={props.remember}
            onChange={(event) => props.onRemember(event.target.checked)}
          />
          Remember the topic in this browser only
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={props.onListen}>
            Listen
          </Button>
          <Button type="button" variant="outline" onClick={props.onStop}>
            Stop
          </Button>
          <Button type="button" variant="ghost" onClick={() => props.onReveal(!props.reveal)}>
            {props.reveal ? "Hide topic" : "Show topic"}
          </Button>
          <Button type="button" variant="ghost" onClick={props.onForget}>
            Forget topic
          </Button>
        </div>
        <p className="text-xs leading-5 text-[#5c5346]">
          One topic for every bot. With no link parameters, the page listens to the office topic. A fragment link
          replaces it for this visit and is then removed from the address bar.
        </p>
      </CardContent>
    </Card>
  );
}

function DeskDetail({
  state,
  onAssign,
  onRestore,
}: {
  state: OfficeState;
  onAssign: (slotId: SlotId, botId: BotId) => void;
  onRestore: () => void;
}) {
  const seat = state.seats.find((item) => item.slotId === state.selectedSlotId) ?? null;
  return (
    <Card>
      <CardHeader className="p-4">
        <CardTitle className="font-display text-lg">Selected desk</CardTitle>
        <CardDescription>
          {seat ? "Roster chat links stay as text. Inbound stream links are never opened." : "Select a desk on a floor."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0">
        {seat ? <DeskBody seat={seat} state={state} onAssign={onAssign} /> : null}
        <Separator />
        <div className="space-y-2">
          <p className="text-sm text-[#3f382f]">
            The confirmed roster seats one bot on each floor. A local arrangement stays in this browser. Excluded bots
            cannot be added.
          </p>
          <Button type="button" variant="outline" onClick={onRestore}>
            Restore confirmed roster
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DeskBody({
  seat,
  state,
  onAssign,
}: {
  seat: Seat;
  state: OfficeState;
  onAssign: (slotId: SlotId, botId: BotId) => void;
}) {
  const slot = slotById(seat.slotId);
  const [choice, setChoice] = useState(seat.occupantId && seat.occupantId !== "stavros" ? seat.occupantId : "");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setChoice(seat.occupantId && seat.occupantId !== "stavros" ? seat.occupantId : "");
  }, [seat.slotId, seat.occupantId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  if (seat.occupantId === "stavros") {
    return (
      <div className="space-y-2 text-sm leading-6">
        <h3 className="font-display text-xl">{STAVROS.name}</h3>
        <Badge variant="secondary">Human caller</Badge>
        <p>{STAVROS.summary}</p>
        <p>Sectors: commercial and residential.</p>
        <p>Vulcan 7 stays his personal dialer. There is no dial control on this desk.</p>
      </div>
    );
  }

  const bot = seat.occupantId ? botById(seat.occupantId) : null;
  const status = bot ? state.statuses[bot.id] : undefined;
  const quiet = bot
    ? (summarizeDeskActivity(state.statusLog, now).find((row) => row.botId === bot.id)?.quiet ?? true)
    : false;
  const look = bot ? state.looks[bot.id] : undefined;
  const groups = bot ? state.groups.filter((group) => group.botIds.includes(bot.id)) : [];
  const services = servicesOnFloor(slot.floorId);
  const eligible = OFFICE_BOTS.filter((candidate) => canAssign(candidate.id, seat.slotId));

  return (
    <div className="space-y-3 text-sm leading-6">
      <div>
        <h3 className="font-display text-xl">{bot ? bot.name : "Unassigned"}</h3>
        <p className="text-[#5c5346]">{slot.title}</p>
      </div>
      {bot ? (
        <>
          <p>{bot.summary}</p>
          <p className="break-all font-mono text-xs">{chatLinkForBot(bot.id)}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void navigator.clipboard?.writeText(chatLinkForBot(bot.id)).catch(() => undefined);
            }}
          >
            Copy chat link
          </Button>
          <p>{quiet || !status ? "quiet" : `${status.status} · ${status.step}`}</p>
          <p>{look ? `${look.label}. ${look.note}` : "No look description received."}</p>
          {groups.length > 0 ? (
            <ul>
              {groups.map((group) => (
                <li key={group.id}>
                  {group.name}: {group.botIds.map((id) => botById(id).name).join(", ")}
                </li>
              ))}
            </ul>
          ) : (
            <p>No group payload received for this desk.</p>
          )}
          {botRequiresMlsSetup(bot.id) ? <MlsChecklist /> : null}
        </>
      ) : (
        <p>This lane is empty in the local arrangement.</p>
      )}
      {services.length > 0 ? (
        <ul className="space-y-1">
          {services.map((service) => (
            <li key={service.id}>
              {service.product} — {service.role} — not connected
              {service.automated ? "" : service.product === "Vulcan 7" ? " — not automated" : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {seat.locked ? (
        <p>This confirmed seat stays with RE Office Manager.</p>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="seat-bot">Local assignment</Label>
          <select
            id="seat-bot"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
          >
            <option value="">Leave unassigned</option>
            {eligible.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            disabled={!choice}
            onClick={() => {
              if (choice) onAssign(seat.slotId, choice as BotId);
            }}
          >
            Seat this bot
          </Button>
        </div>
      )}
    </div>
  );
}

function MlsChecklist() {
  return (
    <div className="rounded-lg border border-[#d5c6aa] bg-[#f7f1e6] p-3">
      <h4 className="font-display text-base">Required setup</h4>
      <ul className="mt-2 space-y-2">
        {MLS_SETUP_INPUTS.map((item) => (
          <li key={item.id}>
            <span className="font-medium">{item.label}</span>
            {item.id === "mls-provider" ? (
              <span> — {item.value} (known, not connected)</span>
            ) : (
              <span> — Required. Not connected. No credentials are collected here.</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActivityFeed({ state }: { state: OfficeState }) {
  const [floor, setFloor] = useState<FloorId | "all">("all");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const rows = useMemo(() => recentStatusFeed(state.statusLog, floor, now), [state.statusLog, floor, now]);

  return (
    <Card>
      <CardHeader className="p-4">
        <CardTitle className="font-display text-lg">Activity</CardTitle>
        <CardDescription>Newest status lines first. The page backfills the last 24 hours.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        <div className="space-y-1.5">
          <Label htmlFor="activity-floor">Floor</Label>
          <select
            id="activity-floor"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={floor}
            onChange={(event) => setFloor(event.target.value as FloorId | "all")}
          >
            <option value="all">All floors</option>
            {FLOORS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm leading-6 text-[#3f382f]">No status lines for this floor in the loaded history.</p>
        ) : (
          <ul className="space-y-3" data-activity-feed>
            {rows.map((entry) => {
              const bot = botById(entry.botId);
              return (
                <li
                  key={entry.id}
                  className="border-b border-[#eadfcd] pb-3 text-sm leading-6 last:border-0"
                  data-activity-row
                  data-bot={bot.name}
                  data-status={entry.status}
                  data-floor={bot.floorId}
                >
                  <p className="text-xs text-[#5c5346]">{formatOfficeTime(entry.at)}</p>
                  <p>
                    {bot.name} · {entry.status}
                  </p>
                  <p>{entry.step}</p>
                </li>
              );
            })}
          </ul>
        )}
        {state.suppressedCount > 0 ? (
          <p className="text-xs leading-5 text-[#5c5346]">Status lines from other bot names are left out of this office.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function UsagePanel({ state }: { state: OfficeState }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const rows = useMemo(() => summarizeDeskActivity(state.statusLog, now), [state.statusLog, now]);

  return (
    <Card>
      <CardHeader className="p-4">
        <CardTitle className="font-display text-lg">Usage</CardTitle>
        <CardDescription>Counted in this browser from today&apos;s status lines. America/New_York.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0 text-sm leading-6">
        <div className="usage-scroll">
          <table className="usage-table" data-usage-table>
            <thead>
              <tr>
                <th>Bot</th>
                <th>Seen</th>
                <th>Status</th>
                <th>Upd</th>
                <th>Start</th>
                <th>Done</th>
                <th>Err</th>
                <th>Working</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.botId} data-usage-bot={row.name}>
                  <td>{row.name}</td>
                  <td>{formatOfficeTime(row.lastSeenAt)}</td>
                  <td data-usage-status>{row.quiet ? "quiet" : row.currentStatus}</td>
                  <td data-usage-updates>{row.updatesToday}</td>
                  <td data-usage-started>{row.startedToday}</td>
                  <td data-usage-done>{row.doneToday}</td>
                  <td data-usage-errors>{row.errorsToday}</td>
                  <td data-usage-working>{formatWorkingDuration(row.workingMsToday)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {state.usage === null ? (
          <p className="text-xs leading-5 text-[#5c5346]">No usage-percentage payload has been received.</p>
        ) : (
          <p className="text-xs leading-5 text-[#5c5346]">
            Received usage payload: total_used_pct {state.usage.totalUsedPct}, resets_at {state.usage.resetsAt}.
            {state.usage.omittedRows > 0 ? " Rows outside this office were omitted." : ""}
          </p>
        )}
      </CardContent>
    </Card>
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
    <Card>
      <CardHeader className="p-4">
        <CardTitle className="font-display text-lg">Routines</CardTitle>
        <CardDescription>Latest list per bot. Nothing here is scheduled.</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 text-sm leading-6" data-routines-panel>
        {lists.length === 0 ? (
          <p>No routine list has arrived.</p>
        ) : (
          <ul className="space-y-3">
            {lists.map((list) => (
              <li key={list.name} data-routines-bot={list.name}>
                <p className="font-medium">{list.name}</p>
                <ul className="list-disc pl-4">
                  {list.items.map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
