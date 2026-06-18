import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedMessage } from "@/lib/feed/types";

// Reset module state between tests: the store's `seen`/`buf`/`names` and dock-activity's `active`
// set are module-level. Re-importing both keeps tests independent.
let store: typeof import("./store");
let dock: typeof import("@/lib/dock-activity");

beforeEach(async () => {
  vi.resetModules();
  store = await import("./store");
  dock = await import("@/lib/dock-activity");
});

function textMsg(id: string, body: string): FeedMessage {
  return {
    id,
    platform: "twitch",
    author: "u",
    segments: [{ type: "text", text: body }],
    ts: "00:00",
    tsMs: 0,
  };
}

describe("setMentionNames", () => {
  it("treats an empty config as none configured", () => {
    store.setMentionNames("");
    expect(store.mentionNamesConfigured()).toBe(false);
  });

  it("treats whitespace-only entries as none configured", () => {
    store.setMentionNames("   ,  ");
    expect(store.mentionNamesConfigured()).toBe(false);
  });

  it("treats one or more comma-separated names as configured", () => {
    store.setMentionNames("banks, blknoiz06");
    expect(store.mentionNamesConfigured()).toBe(true);
  });

  it("strips a leading @ from names", () => {
    store.setMentionNames("@banks");
    expect(store.mentionNamesConfigured()).toBe(true);
  });
});

describe("collectMentions", () => {
  it("is a no-op when no names are configured", () => {
    expect(dock.hasDockActivity("inbox")).toBe(false);
    store.collectMentions([textMsg("a", "hello @banks")]);
    expect(dock.hasDockActivity("inbox")).toBe(false);
  });

  it("marks dock activity when a configured name appears in the message body", () => {
    store.setMentionNames("banks");
    store.collectMentions([textMsg("m1", "yo @banks how's it")]);
    expect(dock.hasDockActivity("inbox")).toBe(true);
  });

  it("matches case-insensitively", () => {
    store.setMentionNames("BANKS");
    store.collectMentions([textMsg("m1", "yo @banks")]);
    expect(dock.hasDockActivity("inbox")).toBe(true);
  });

  it("ignores messages without a configured name", () => {
    store.setMentionNames("banks");
    store.collectMentions([textMsg("m1", "no relevant content here")]);
    expect(dock.hasDockActivity("inbox")).toBe(false);
  });

  it("does not re-mark activity for an already-seen message id", () => {
    store.setMentionNames("banks");
    store.collectMentions([textMsg("dup", "hi @banks")]);
    expect(dock.hasDockActivity("inbox")).toBe(true);

    dock.clearDockActivity("inbox");
    expect(dock.hasDockActivity("inbox")).toBe(false);

    // Same id again — dedup means no fresh match, no fresh activity mark.
    store.collectMentions([textMsg("dup", "hi @banks")]);
    expect(dock.hasDockActivity("inbox")).toBe(false);
  });

  it("matches against emote codes (Kappa renders as Kappa in body text)", () => {
    store.setMentionNames("kappa");
    store.collectMentions([
      {
        id: "e1",
        platform: "twitch",
        author: "u",
        segments: [
          { type: "text", text: "lol " },
          { type: "emote", code: "Kappa", url: "x" },
        ],
        ts: "00:00",
        tsMs: 0,
      },
    ]);
    expect(dock.hasDockActivity("inbox")).toBe(true);
  });

  it("matches against cashtags ($TSLA renders as $TSLA in body text)", () => {
    store.setMentionNames("tsla");
    store.collectMentions([
      {
        id: "c1",
        platform: "twitch",
        author: "u",
        segments: [{ type: "cashtag", symbol: "TSLA" }],
        ts: "00:00",
        tsMs: 0,
      },
    ]);
    expect(dock.hasDockActivity("inbox")).toBe(true);
  });
});

describe("clearMentions", () => {
  it("does not throw when called without prior state", () => {
    expect(() => store.clearMentions()).not.toThrow();
  });
});
