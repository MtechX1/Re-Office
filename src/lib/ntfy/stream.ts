import { backoffDelayMs, classifyResponse, parseRetryAfter } from "@/lib/ntfy/backoff";
import { parseTransportPayload, type ParsedMessage, type TransportMeta } from "@/lib/ntfy/parser";
import { buildTopicUrl } from "@/lib/ntfy/topic";

export type StreamPhase =
  | { phase: "connecting"; attempt: number }
  | { phase: "live" }
  | { phase: "rate_limited"; attempt: number; waitMs: number }
  | { phase: "backing_off"; attempt: number; waitMs: number; reason: "http" | "network" | "closed" }
  | { phase: "stopped" };

export type PublicPhase = StreamPhase | { phase: "unconfigured" };

export interface StreamHooks {
  fetch: typeof fetch;
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  onPhase: (phase: StreamPhase) => void;
  onMessage: (message: ParsedMessage, meta: TransportMeta) => void;
  jitterMs?: () => number;
}

const HISTORY_LINE_CAP = 200;

export function formatStreamPhase(phase: PublicPhase): string {
  switch (phase.phase) {
    case "unconfigured":
      return "No shared topic is set in this browser.";
    case "connecting":
      return "Contacting the shared stream.";
    case "live":
      return "Listening on the shared stream. A desk changes only when a validated message arrives.";
    case "rate_limited":
      return `The shared stream returned HTTP 429. Next attempt in ${Math.ceil(phase.waitMs / 1000)}s. No desk is marked online.`;
    case "backing_off":
      return `The shared stream is paused after a ${phase.reason} failure. Next attempt in ${Math.ceil(phase.waitMs / 1000)}s. No desk is marked online.`;
    case "stopped":
      return "Listening is stopped.";
  }
}

export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export async function runSharedStream(options: {
  baseUrl: string;
  topic: string;
  since: string;
  signal: AbortSignal;
  hooks: StreamHooks;
}): Promise<void> {
  const jitter = options.hooks.jitterMs ?? (() => 0);
  let attempt = 0;
  let historyDone = false;
  let since = options.since || "10m";

  while (!options.signal.aborted) {
    options.hooks.onPhase({ phase: "connecting", attempt });
    const url = buildTopicUrl(options.baseUrl, options.topic, historyDone ? "stream" : "poll", since);
    if (!url) {
      options.hooks.onPhase({ phase: "stopped" });
      return;
    }

    let response: Response;
    try {
      response = await options.hooks.fetch(url, {
        signal: options.signal,
        cache: "no-store",
        referrerPolicy: "no-referrer",
        credentials: "omit",
        headers: { Accept: "application/x-ndjson" },
      });
    } catch (error) {
      if (options.signal.aborted || isAbortError(error)) return;
      const waitMs = backoffDelayMs(attempt, null, jitter());
      attempt += 1;
      options.hooks.onPhase({ phase: "backing_off", attempt, waitMs, reason: "network" });
      await options.hooks.sleep(waitMs, options.signal);
      continue;
    }

    if (options.signal.aborted) return;

    if (!response.ok) {
      const retryAfter = parseRetryAfter(response.headers.get("Retry-After"), Date.now());
      const classified = classifyResponse(response.status, attempt, retryAfter, jitter());
      try {
        await response.body?.cancel();
      } catch {
        // Ignore a failed cancel. The status is already known.
      }
      if (classified.kind === "wait") {
        attempt = classified.attempt;
        if (classified.phase === "rate_limited") {
          options.hooks.onPhase({ phase: "rate_limited", attempt, waitMs: classified.waitMs });
        } else {
          options.hooks.onPhase({
            phase: "backing_off",
            attempt,
            waitMs: classified.waitMs,
            reason: "http",
          });
        }
        await options.hooks.sleep(classified.waitMs, options.signal);
      }
      continue;
    }

    if (!historyDone) {
      const text = await response.text();
      let seq = 0;
      let lastId: string | null = null;
      for (const line of text.split(/\n/)) {
        if (!line.trim()) continue;
        seq += 1;
        if (seq > HISTORY_LINE_CAP) break;
        const parsed = parseTransportPayload(line, seq);
        if (parsed.type === "message") {
          options.hooks.onMessage(parsed.message, parsed.meta);
          if (/^[A-Za-z0-9_-]{1,64}$/.test(parsed.meta.eventId)) lastId = parsed.meta.eventId;
        }
      }
      historyDone = true;
      if (lastId) since = lastId;
      continue;
    }

    attempt = 0;
    options.hooks.onPhase({ phase: "live" });
    await readNdjson(response, options.signal, (line, seq) => {
      const parsed = parseTransportPayload(line, seq);
      if (parsed.type !== "message") return;
      options.hooks.onMessage(parsed.message, parsed.meta);
      if (/^[A-Za-z0-9_-]{1,64}$/.test(parsed.meta.eventId)) since = parsed.meta.eventId;
    });
    if (options.signal.aborted) return;
    const waitMs = backoffDelayMs(attempt, null, jitter());
    attempt += 1;
    options.hooks.onPhase({ phase: "backing_off", attempt, waitMs, reason: "closed" });
    await options.hooks.sleep(waitMs, options.signal);
  }
}

async function readNdjson(
  response: Response,
  signal: AbortSignal,
  onLine: (line: string, seq: number) => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  let seq = 0;
  while (!signal.aborted) {
    let done = false;
    let value: Uint8Array | undefined;
    try {
      const next = await reader.read();
      done = next.done;
      value = next.value;
    } catch (error) {
      if (signal.aborted || isAbortError(error)) return;
      return;
    }
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index = buffer.indexOf("\n");
    while (index >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (line.trim()) {
        seq += 1;
        onLine(line, seq);
      }
      index = buffer.indexOf("\n");
    }
  }
}
