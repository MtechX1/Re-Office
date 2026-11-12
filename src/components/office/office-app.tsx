"use client";

import { useEffect, useRef, useState } from "react";
import { OfficeScene } from "@/components/office/office-scene";
import { SidePanels } from "@/components/office/side-panels";
import { loadArrangement, saveArrangement } from "@/lib/office/assignments";
import {
  applyInbound,
  assignOfficeSeat,
  createOfficeState,
  restoreRoster,
  selectSlot,
  type OfficeState,
} from "@/lib/office/state";
import { abortableSleep, formatStreamPhase, runSharedStream, type PublicPhase } from "@/lib/ntfy/stream";
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
  const [yaw, setYaw] = useState(0);
  const [started, setStarted] = useState(false);
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
    setStarted(true);
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
    <div className="min-h-screen">
      <header className="border-b border-[#d5c6aa] bg-[#f7f1e6]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-display text-xs uppercase tracking-[0.22em] text-[#8c6a32]">Stavros</p>
              <h1 className="font-display text-3xl leading-none sm:text-4xl">RE Office</h1>
            </div>
            <p className="max-w-xl text-sm leading-6 text-[#3f382f]">{formatStreamPhase(phase)}</p>
          </div>
          <p className="max-w-3xl text-sm leading-6 text-[#5c5346]">
            Commercial and residential. Seven confirmed desks, one shared stream, and no live connection to BoldTrail,
            Vulcan 7, Crexi, LoopNet, or Northeast Florida MLS.
          </p>
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="lg:col-start-2 lg:row-start-1">
          <SidePanels
            state={state}
            phase={phase}
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
            onAssign={(slotId, botId) => setState((current) => assignOfficeSeat(current, slotId, botId))}
            onRestore={() => setState((current) => restoreRoster(current))}
          />
        </div>
        <div className="lg:col-start-1 lg:row-start-1">
          <OfficeScene
            state={state}
            yaw={yaw}
            onYaw={setYaw}
            onSelect={(slotId) => setState((current) => selectSlot(current, slotId))}
          />
        </div>
      </main>
    </div>
  );
}
