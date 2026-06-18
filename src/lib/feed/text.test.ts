import { describe, expect, it } from "vitest";
import { messageText } from "./text";
import type { FeedMessage } from "./types";

function msg(segments: FeedMessage["segments"]): FeedMessage {
  return {
    id: "1",
    platform: "twitch",
    author: "u",
    segments,
    ts: "00:00",
    tsMs: 0,
  };
}

describe("messageText", () => {
  it("returns empty string for an empty message", () => {
    expect(messageText(msg([]))).toBe("");
  });

  it("flattens text, emote, mention, cashtag, and link segments", () => {
    const out = messageText(
      msg([
        { type: "text", text: "yo " },
        { type: "mention", user: "banks" },
        { type: "text", text: " buy " },
        { type: "cashtag", symbol: "TSLA" },
        { type: "text", text: " " },
        { type: "emote", code: "Kappa", url: "x" },
        { type: "text", text: " " },
        { type: "link", href: "https://e.com", text: "e.com" },
      ]),
    );
    expect(out).toBe("yo @banks buy $TSLA Kappa e.com");
  });

  it("trims surrounding whitespace", () => {
    const out = messageText(msg([{ type: "text", text: "  hi  " }]));
    expect(out).toBe("hi");
  });
});
