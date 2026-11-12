export const MIN_BACKOFF_MS = 5_000;
export const MAX_EXPONENTIAL_MS = 120_000;
export const ABSOLUTE_MAX_BACKOFF_MS = 15 * 60 * 1000;

export function backoffDelayMs(attempt: number, retryAfterSeconds: number | null, jitterMs = 0): number {
  const safeAttempt = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0;
  const exponential = Math.min(MAX_EXPONENTIAL_MS, MIN_BACKOFF_MS * 2 ** safeAttempt);
  const retryMs =
    retryAfterSeconds != null && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds * 1000
      : 0;
  const jitter = Number.isFinite(jitterMs) && jitterMs > 0 ? jitterMs : 0;
  return Math.min(ABSOLUTE_MAX_BACKOFF_MS, Math.max(MIN_BACKOFF_MS, exponential, retryMs) + jitter);
}

export function parseRetryAfter(header: string | null, nowMs: number): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed || trimmed.length > 64) return null;
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    return seconds;
  }
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  const delta = date - nowMs;
  if (delta <= 0) return null;
  return delta / 1000;
}

export type HttpClass =
  | { kind: "open" }
  | {
      kind: "wait";
      phase: "rate_limited" | "backing_off";
      waitMs: number;
      attempt: number;
    };

/** Classifies the stream only. It never produces a bot online/idle status. */
export function classifyResponse(
  status: number,
  attempt: number,
  retryAfterSeconds: number | null,
  jitterMs = 0,
): HttpClass {
  if (status >= 200 && status < 300) return { kind: "open" };
  const waitMs = backoffDelayMs(attempt, retryAfterSeconds, jitterMs);
  if (status === 429) {
    return { kind: "wait", phase: "rate_limited", waitMs, attempt: attempt + 1 };
  }
  return { kind: "wait", phase: "backing_off", waitMs, attempt: attempt + 1 };
}
