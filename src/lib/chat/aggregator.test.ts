import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatAggregator } from "./aggregator";
import type { ChatProvider, ChatSink, ProviderHandle } from "./provider";
import type { FeedMessage } from "@/lib/feed/types";

function fakeMsg(id: string, tsMs: number, author = "u"): FeedMessage {
  return {
    id,
    platform: "twitch",
    author,
    segments: [{ type: "text", text: id }],
    ts: "00:00",
    tsMs,
  };
}

/** Test provider that captures its sink so the test can push messages on demand. */
function makeProvider(id: string) {
  const handle: ProviderHandle = { stop: vi.fn() };
  let captured: ChatSink | null = null;
  const provider: ChatProvider = {
    id,
    start(sink) {
      captured = sink;
      return handle;
    },
  };
  return {
    provider,
    handle,
    push: (m: FeedMessage) => captured!.message(m),
    status: (s: Parameters<NonNullable<ChatSink["status"]>>[0]) => captured!.status?.(s),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ChatAggregator", () => {
  it("seeds prior messages and reports them to the first subscriber", () => {
    const agg = new ChatAggregator(10, 50);
    agg.seed([fakeMsg("a", 1), fakeMsg("b", 2)]);
    const sub = vi.fn();
    agg.subscribe(sub);
    expect(sub).toHaveBeenCalledTimes(1);
    expect(sub.mock.calls[0][0].map((m: FeedMessage) => m.id)).toEqual(["a", "b"]);
  });

  it("truncates seeded history beyond cap, keeping the most recent", () => {
    const agg = new ChatAggregator(3, 50);
    agg.seed([fakeMsg("a", 1), fakeMsg("b", 2), fakeMsg("c", 3), fakeMsg("d", 4)]);
    const sub = vi.fn();
    agg.subscribe(sub);
    expect(sub.mock.calls[0][0].map((m: FeedMessage) => m.id)).toEqual(["b", "c", "d"]);
  });

  it("coalesces a burst of messages into one flush after flushMs", () => {
    const agg = new ChatAggregator(10, 50);
    const p = makeProvider("p");
    agg.register(p.provider);
    const sub = vi.fn();
    agg.subscribe(sub); // initial empty call
    agg.start();

    p.push(fakeMsg("a", 1));
    p.push(fakeMsg("b", 2));
    p.push(fakeMsg("c", 3));

    // No additional fanout yet — still pending.
    expect(sub).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50);

    expect(sub).toHaveBeenCalledTimes(2);
    expect(sub.mock.calls[1][0].map((m: FeedMessage) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts a flushed batch by tsMs so out-of-order cross-platform messages interleave", () => {
    const agg = new ChatAggregator(10, 50);
    const p = makeProvider("p");
    agg.register(p.provider);
    const sub = vi.fn();
    agg.subscribe(sub);
    agg.start();

    p.push(fakeMsg("late", 3));
    p.push(fakeMsg("early", 1));
    p.push(fakeMsg("mid", 2));

    vi.advanceTimersByTime(50);

    expect(sub.mock.calls[1][0].map((m: FeedMessage) => m.id)).toEqual(["early", "mid", "late"]);
  });

  it("caps the rolling buffer and drops the oldest messages", () => {
    const agg = new ChatAggregator(3, 50);
    const p = makeProvider("p");
    agg.register(p.provider);
    const sub = vi.fn();
    agg.subscribe(sub);
    agg.start();

    for (let i = 0; i < 5; i += 1) p.push(fakeMsg(`m${i}`, i));
    vi.advanceTimersByTime(50);

    expect(sub.mock.calls[1][0].map((m: FeedMessage) => m.id)).toEqual(["m2", "m3", "m4"]);
  });

  it("trims the pending buffer when a hidden tab lets it balloon past 4× cap", () => {
    const agg = new ChatAggregator(10, 50);
    const p = makeProvider("p");
    agg.register(p.provider);
    const sub = vi.fn();
    agg.subscribe(sub);
    agg.start();

    // 50 messages > 4 × 10 cap → overflow guard kicks in and trims to 2× cap before the flush.
    for (let i = 0; i < 50; i += 1) p.push(fakeMsg(`m${i}`, i));
    vi.advanceTimersByTime(50);

    const ids = sub.mock.calls[1][0].map((m: FeedMessage) => m.id);
    // After overflow trims to 2× cap (20) and the final flush slices to cap (10), the newest 10 remain.
    expect(ids).toEqual(["m40", "m41", "m42", "m43", "m44", "m45", "m46", "m47", "m48", "m49"]);
  });

  it("fans status updates out to status subscribers", () => {
    const agg = new ChatAggregator(10, 50);
    const p = makeProvider("twitch");
    agg.register(p.provider);
    const sub = vi.fn();
    agg.subscribeStatus(sub);
    agg.start();

    p.status("connecting");
    p.status("open");

    // Initial empty snapshot + two updates.
    expect(sub).toHaveBeenCalledTimes(3);
    expect(sub.mock.calls[2][0]).toEqual({ twitch: "open" });
  });

  it("stops all provider handles and clears the pending flush timer", () => {
    const agg = new ChatAggregator(10, 50);
    const p = makeProvider("p");
    agg.register(p.provider);
    agg.start();
    p.push(fakeMsg("a", 1));

    agg.stop();
    expect(p.handle.stop).toHaveBeenCalledTimes(1);

    // After stop, pending timer is cleared — advancing should not throw or call dead listeners.
    const sub = vi.fn();
    agg.subscribe(sub);
    vi.advanceTimersByTime(100);
    expect(sub).toHaveBeenCalledTimes(1); // only the initial snapshot
  });

  it("unsubscribes cleanly", () => {
    const agg = new ChatAggregator(10, 50);
    const p = makeProvider("p");
    agg.register(p.provider);
    const sub = vi.fn();
    const unsub = agg.subscribe(sub);
    agg.start();

    unsub();
    p.push(fakeMsg("a", 1));
    vi.advanceTimersByTime(50);

    // Only the initial snapshot — no fanout after unsubscribe.
    expect(sub).toHaveBeenCalledTimes(1);
  });
});
