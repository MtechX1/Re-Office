export const DEFAULT_NTFY_BASE = "https://ntfy.sh";
/** Office topic. The page listens here when the URL and browser storage have none. */
export const DEFAULT_OFFICE_TOPIC = "re-LRnhJhxZyV4qdIu7g8bVca";
export const TOPIC_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const SINCE_PATTERN = /^(?:10m|all|latest|[A-Za-z0-9_-]{1,64})$/;
export const SESSION_TOPIC_KEY = "re-office.shared-topic";
export const LOCAL_SETTINGS_KEY = "re-office.local-settings";

const QUERY_TOPIC_KEYS = ["topic", "t", "ntfy", "ntfy_topic"];

export interface LocalSettings {
  baseUrl: string;
  topic: string;
  rememberTopic: boolean;
}

export function validateBaseUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (url.search || url.hash) return null;
    if (url.pathname !== "/" && url.pathname !== "") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function readTopicFragment(hash: string): { topic: string | null; shouldStrip: boolean } {
  if (!hash || hash === "#") return { topic: null, shouldStrip: false };
  const body = hash.startsWith("#") ? hash.slice(1) : hash;
  let candidate = body;
  if (body.startsWith("topic=") || body.startsWith("t=")) {
    candidate = body.slice(body.indexOf("=") + 1);
  }
  let decoded = candidate;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    return { topic: null, shouldStrip: true };
  }
  if (!TOPIC_PATTERN.test(decoded)) return { topic: null, shouldStrip: true };
  return { topic: decoded, shouldStrip: true };
}

/** Drops topic query keys without returning their values. Query strings are not a supported topic channel. */
export function stripTopicQuery(search: string): { search: string; removed: boolean } {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  let removed = false;
  for (const key of QUERY_TOPIC_KEYS) {
    if (params.has(key)) {
      params.delete(key);
      removed = true;
    }
  }
  const next = params.toString();
  return { search: next ? `?${next}` : "", removed };
}

export function planLocationCleanup(input: { hash: string; search: string }): {
  topic: string | null;
  nextSearch: string;
  strip: boolean;
} {
  const stripped = stripTopicQuery(input.search);
  const fragment = readTopicFragment(input.hash);
  return {
    topic: fragment.topic,
    nextSearch: stripped.search,
    strip: stripped.removed || fragment.shouldStrip,
  };
}

export function buildTopicUrl(
  base: string,
  topic: string,
  kind: "poll" | "stream",
  since: string,
): string | null {
  const origin = validateBaseUrl(base);
  if (!origin || !TOPIC_PATTERN.test(topic) || !SINCE_PATTERN.test(since)) return null;
  const query = kind === "poll" ? `poll=1&since=${encodeURIComponent(since)}` : `since=${encodeURIComponent(since)}`;
  return `${origin}/${topic}/json?${query}`;
}

export function loadLocalSettings(storage: Pick<Storage, "getItem">): LocalSettings {
  const fallback: LocalSettings = { baseUrl: DEFAULT_NTFY_BASE, topic: "", rememberTopic: false };
  try {
    const raw = storage.getItem(LOCAL_SETTINGS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
    const record = parsed as Record<string, unknown>;
    const baseCandidate = typeof record.baseUrl === "string" ? validateBaseUrl(record.baseUrl) : null;
    const rememberTopic = record.rememberTopic === true;
    const topic =
      rememberTopic && typeof record.topic === "string" && TOPIC_PATTERN.test(record.topic) ? record.topic : "";
    return {
      baseUrl: baseCandidate ?? DEFAULT_NTFY_BASE,
      topic,
      rememberTopic,
    };
  } catch {
    return fallback;
  }
}

export function saveLocalSettings(storage: Pick<Storage, "setItem">, settings: LocalSettings): void {
  const baseUrl = validateBaseUrl(settings.baseUrl) ?? DEFAULT_NTFY_BASE;
  const rememberTopic = settings.rememberTopic === true;
  const topic = rememberTopic && TOPIC_PATTERN.test(settings.topic) ? settings.topic : "";
  storage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify({ baseUrl, topic, rememberTopic }));
}
