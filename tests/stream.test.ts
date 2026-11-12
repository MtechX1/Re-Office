import { describe, expect, it } from "vitest";
import { runSharedStream } from "@/lib/ntfy/stream";

describe("shared stream", () => {
  it("waits after HTTP 429 and does not invent a live desk", async () => {
    const sleeps: number[] = [];
    const phases: string[] = [];
    const messages: unknown[] = [];
    const controller = new AbortController();
    let calls = 0;
    await runSharedStream({
      baseUrl: "https://ntfy.sh",
      topic: "placeholder",
      since: "10m",
      signal: controller.signal,
      hooks: {
        fetch: async () => {
          calls += 1;
          if (calls > 1) {
            controller.abort();
            throw new DOMException("Aborted", "AbortError");
          }
          return new Response("slow", {
            status: 429,
            headers: { "Retry-After": "1" },
          });
        },
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        onPhase: (phase) => phases.push(phase.phase),
        onMessage: (message) => messages.push(message),
        jitterMs: () => 0,
      },
    });
    expect(sleeps[0]).toBeGreaterThanOrEqual(5000);
    expect(phases).toContain("rate_limited");
    expect(phases).not.toContain("live");
    expect(messages).toEqual([]);
  });

  it("parses one history payload without keeping the transport topic", async () => {
    const messages: unknown[] = [];
    const controller = new AbortController();
    let calls = 0;
    await runSharedStream({
      baseUrl: "https://ntfy.sh",
      topic: "placeholder",
      since: "10m",
      signal: controller.signal,
      hooks: {
        fetch: async () => {
          calls += 1;
          if (calls > 1) {
            controller.abort();
            throw new DOMException("Aborted", "AbortError");
          }
          return new Response(
            `${JSON.stringify({
              id: "hist1",
              event: "message",
              topic: "hidden-topic-value",
              message: JSON.stringify({
                bot: "RE Media Studio",
                status: "done",
                step: "Example shape only",
              }),
            })}\n`,
            { status: 200 },
          );
        },
        sleep: async () => undefined,
        onPhase: () => undefined,
        onMessage: (message) => messages.push(message),
        jitterMs: () => 0,
      },
    });
    expect(messages).toEqual([
      { kind: "status", bot: "RE Media Studio", status: "done", step: "Example shape only" },
    ]);
    expect(JSON.stringify(messages)).not.toContain("hidden-topic-value");
  });

  it("does not call the network for an invalid topic", async () => {
    let called = false;
    const phases: string[] = [];
    await runSharedStream({
      baseUrl: "https://ntfy.sh",
      topic: "not a topic",
      since: "10m",
      signal: new AbortController().signal,
      hooks: {
        fetch: async () => {
          called = true;
          return new Response("");
        },
        sleep: async () => undefined,
        onPhase: (phase) => phases.push(phase.phase),
        onMessage: () => undefined,
      },
    });
    expect(called).toBe(false);
    expect(phases).toContain("stopped");
  });
});
