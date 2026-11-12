import { describe, expect, it } from "vitest";
import {
  buildTopicUrl,
  DEFAULT_OFFICE_TOPIC,
  loadLocalSettings,
  planLocationCleanup,
  saveLocalSettings,
  TOPIC_PATTERN,
  validateBaseUrl,
} from "@/lib/ntfy/topic";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    dump: () => Object.fromEntries(values),
  };
}

describe("shared topic handling", () => {
  it("defaults to the office topic so the page can listen with no URL parameters", () => {
    expect(DEFAULT_OFFICE_TOPIC).toBe("re-LRnhJhxZyV4qdIu7g8bVca");
    expect(TOPIC_PATTERN.test(DEFAULT_OFFICE_TOPIC)).toBe(true);
  });

  it("reads a fragment topic and strips it, but ignores a query topic", () => {
    expect(planLocationCleanup({ hash: "#office_topic", search: "" })).toEqual({
      topic: "office_topic",
      nextSearch: "",
      strip: true,
    });
    expect(planLocationCleanup({ hash: "#topic=office_topic", search: "?floor=leads" })).toMatchObject({
      topic: "office_topic",
      nextSearch: "?floor=leads",
      strip: true,
    });
    const query = planLocationCleanup({ hash: "", search: "?topic=from-query&floor=leads" });
    expect(query.topic).toBeNull();
    expect(query.nextSearch).toBe("?floor=leads");
    expect(query.strip).toBe(true);
    expect(planLocationCleanup({ hash: "#has space", search: "" })).toEqual({
      topic: null,
      nextSearch: "",
      strip: true,
    });
  });

  it("builds only https topic urls and refuses to save a topic unless asked", () => {
    expect(validateBaseUrl("http://ntfy.sh")).toBeNull();
    expect(validateBaseUrl("https://user:pass@ntfy.sh")).toBeNull();
    expect(validateBaseUrl("https://ntfy.sh/extra")).toBeNull();
    expect(buildTopicUrl("https://ntfy.sh", "bad topic", "poll", "10m")).toBeNull();
    expect(buildTopicUrl("https://ntfy.sh/", "office_topic", "poll", "10m")).toBe(
      "https://ntfy.sh/office_topic/json?poll=1&since=10m",
    );

    const storage = memoryStorage();
    saveLocalSettings(storage, {
      baseUrl: "https://ntfy.sh",
      topic: "office_topic",
      rememberTopic: false,
    });
    expect(loadLocalSettings(storage).topic).toBe("");
    expect(storage.dump()["re-office.local-settings"]).not.toContain("office_topic");

    saveLocalSettings(storage, {
      baseUrl: "https://ntfy.sh",
      topic: "office_topic",
      rememberTopic: true,
    });
    expect(loadLocalSettings(storage)).toMatchObject({ topic: "office_topic", rememberTopic: true });
  });
});
