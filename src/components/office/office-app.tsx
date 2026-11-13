"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { OfficeScene } from "@/components/office/office-scene";
import { SidePanels } from "@/components/office/side-panels";
import type { IsoSnapshot } from "@/components/office/iso-types";
import { loadArrangement, saveArrangement } from "@/lib/office/assignments";
import { summarizeDeskActivity } from "@/lib/office/activity";
import type { FloorId } from "@/lib/office/allowlist";
import {
  applyInbound,
  assignOfficeSeat,
  createOfficeState,
  restoreRoster,
  selectSlot,
  type OfficeState,
} from "@/lib/office/state";
import { abortableSleep, runSharedStream, type PublicPhase } from "@/lib/ntfy/stream";
import {
  DEFAULT_NTFY_BASE,
  DEFAULT_OFFICE_TOPIC,
  loadLocalSettings,
  planLocationCleanup,
  saveLocalSettings,
  SESSION_TOPIC_KEY,
  TOPIC_PATTERN,
  validateBaseUrl,
} from "@/lib/ntfy/topic";

export function OfficeApp() {
  const [state, setState] = useState<OfficeState>(createOfficeState);
  const [phase, setPhase] = useState<PublicPhase>({ phase: "unconfigured" });
  const [baseUrl, setBaseUrl] = useState(DEFAULT_NTFY_BASE);
  const [draftTopic, setDraftTopic] = useState("");
  const [activeTopic, setActiveTopic] = useState("");
  const [remember, setRemember] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [topicError, setTopicError] = useState<string | null>(null);
  const [baseError, setBaseError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [focusFloor, setFocusFloor] = useState<FloorId | null>(null);
  const [explode, setExplode] = useState(false);
  const [night, setNight] = useState(false);
  const [panelsOpen, setPanelsOpen] = useState(true);
  const [clientReady, setClientReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const skipArrangementSave = useRef(true);

  useEffect(() => {
    const plan = planLocationCleanup({ hash: window.location.hash, search: window.location.search });
    if (plan.topic) window.sessionStorage.setItem(SESSION_TOPIC_KEY, plan.topic);
    if (plan.strip) {
      window.history.replaceState(null, "", window.location.pathname + plan.nextSearch);
    }
    const local = loadLocalSettings(window.localStorage);
    const sessionRaw = window.sessionStorage.getItem(SESSION_TOPIC_KEY) ?? "";
    const sessionTopic = TOPIC_PATTERN.test(sessionRaw) ? sessionRaw : "";
    const remembered = TOPIC_PATTERN.test(local.topic) ? local.topic : "";
    const nextTopic = plan.topic || sessionTopic || remembered || DEFAULT_OFFICE_TOPIC;
    setBaseUrl(local.baseUrl);
    setRemember(local.rememberTopic);
    setDraftTopic(nextTopic);
    if (TOPIC_PATTERN.test(nextTopic)) setActiveTopic(nextTopic);
    const seats = loadArrangement(window.localStorage);
    if (seats) setState((current) => ({ ...current, seats }));
    if (window.matchMedia("(max-width: 860px)").matches) setPanelsOpen(false);
    setClientReady(true);
    setStarted(true);
  }, []);

  useEffect(() => {
    setNow(Date.now());
  }, [state.statusLog]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!started) return;
    if (skipArrangementSave.current) {
      skipArrangementSave.current = false;
      return;
    }
    saveArrangement(window.localStorage, state.seats);
  }, [started, state.seats]);

  useEffect(() => {
    if (!started) return;
    const base = validateBaseUrl(baseUrl);
    if (!TOPIC_PATTERN.test(activeTopic) || !base) {
      setPhase({ phase: "unconfigured" });
      return;
    }
    const controller = new AbortController();
    void runSharedStream({
      baseUrl: base,
      topic: activeTopic,
      since: "24h",
      signal: controller.signal,
      hooks: {
        fetch: globalThis.fetch.bind(globalThis),
        sleep: abortableSleep,
        onPhase: (next) => setPhase(next),
        onMessage: (message, meta) => {
          setState((current) => applyInbound(current, message, meta));
        },
      },
    });
    return () => controller.abort();
  }, [started, activeTopic, baseUrl]);

  const rows = useMemo(() => summarizeDeskActivity(state.statusLog, now), [state.statusLog, now]);
  const snapshot: IsoSnapshot = {
    seats: state.seats,
    selectedSlotId: state.selectedSlotId,
    rows,
    explode,
    night,
    focusFloor,
  };

  function listen() {
    const base = validateBaseUrl(baseUrl);
    if (!base) {
      setBaseError("Use an https host with no path, login, or query.");
      return;
    }
    if (!TOPIC_PATTERN.test(draftTopic)) {
      setTopicError("Use letters, numbers, dashes, or underscores, up to 64 characters.");
      return;
    }
    setBaseError(null);
    setTopicError(null);
    setBaseUrl(base);
    saveLocalSettings(window.localStorage, {
      baseUrl: base,
      topic: draftTopic,
      rememberTopic: remember,
    });
    window.sessionStorage.setItem(SESSION_TOPIC_KEY, draftTopic);
    setActiveTopic(draftTopic);
  }

  function stop() {
    setActiveTopic("");
    setPhase({ phase: "stopped" });
  }

  function forget() {
    setDraftTopic("");
    setActiveTopic("");
    setRemember(false);
    setTopicError(null);
    window.sessionStorage.removeItem(SESSION_TOPIC_KEY);
    saveLocalSettings(window.localStorage, { baseUrl, topic: "", rememberTopic: false });
    setPhase({ phase: "unconfigured" });
  }

  return (
    <div
      className={`iso-app${clientReady ? " iso-client" : ""}`}
      data-panels={panelsOpen ? "open" : "closed"}
      data-office-model="isometric"
    >
      <h1 className="sr-only">Stavros RE Office</h1>
      <OfficeScene
        state={state}
        snapshot={snapshot}
        onSelect={(slotId) => setState((current) => selectSlot(current, slotId))}
        onAssign={(slotId, botId) => setState((current) => assignOfficeSeat(current, slotId, botId))}
      />
      <SidePanels
        state={state}
        rows={rows}
        now={now}
        phase={phase}
        focusFloor={focusFloor}
        explode={explode}
        night={night}
        panelsOpen={panelsOpen}
        baseUrl={baseUrl}
        draftTopic={draftTopic}
        remember={remember}
        reveal={reveal}
        topicError={topicError}
        baseError={baseError}
        onBaseUrl={(value) => {
          setBaseUrl(value);
          setBaseError(null);
        }}
        onDraftTopic={(value) => {
          setDraftTopic(value);
          setTopicError(null);
        }}
        onRemember={setRemember}
        onReveal={setReveal}
        onListen={listen}
        onStop={stop}
        onForget={forget}
        onSelect={(slotId) => setState((current) => selectSlot(current, slotId))}
        onFocusFloor={setFocusFloor}
        onExplode={setExplode}
        onNight={setNight}
        onPanels={setPanelsOpen}
        onRestore={() => setState((current) => restoreRoster(current))}
      />
    </div>
  );
}
