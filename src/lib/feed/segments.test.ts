import { describe, expect, it } from "vitest";
import { parseSegments } from "./segments";

const KAPPA = { url: "https://emote/kappa.png" };

describe("parseSegments", () => {
  it("returns an empty array for empty input", () => {
    expect(parseSegments("")).toEqual([]);
  });

  it("returns plain text as a single segment when nothing matches", () => {
    expect(parseSegments("hello world")).toEqual([{ type: "text", text: "hello world" }]);
  });

  it("preserves whitespace between tokens", () => {
    const out = parseSegments("hi   there");
    expect(out).toEqual([{ type: "text", text: "hi   there" }]);
  });

  it("detects an emote when the token matches an emote key exactly", () => {
    const out = parseSegments("lol Kappa nice", { Kappa: KAPPA });
    expect(out).toEqual([
      { type: "text", text: "lol " },
      { type: "emote", code: "Kappa", url: KAPPA.url },
      { type: "text", text: " nice" },
    ]);
  });

  it("does not match emote keys via hasOwnProperty pollution", () => {
    // Using __proto__/toString as keys should not accidentally trigger.
    const out = parseSegments("toString happens", {});
    expect(out).toEqual([{ type: "text", text: "toString happens" }]);
  });

  it("parses cashtags and uppercases the symbol", () => {
    const out = parseSegments("watching $tsla close");
    expect(out).toEqual([
      { type: "text", text: "watching " },
      { type: "cashtag", symbol: "TSLA" },
      { type: "text", text: " close" },
    ]);
  });

  it("absorbs a single trailing [,.!?] into the cashtag match", () => {
    // The anchored regex tolerates one optional trailing punctuation char, so it gets consumed
    // by the cashtag match rather than emitted as its own text segment.
    const out = parseSegments("buy $btc.");
    expect(out).toEqual([
      { type: "text", text: "buy " },
      { type: "cashtag", symbol: "BTC" },
    ]);
  });

  it("leaves a cashtag followed by another punctuation alone as plain text", () => {
    // Two trailing chars do not match the optional single-char punctuation slot, so the whole
    // token falls through to plain text.
    const out = parseSegments("buy $btc!!");
    expect(out).toEqual([{ type: "text", text: "buy $btc!!" }]);
  });

  it("parses mentions and preserves the case of the user token", () => {
    const out = parseSegments("yo @Banks ?", {});
    expect(out).toEqual([
      { type: "text", text: "yo " },
      { type: "mention", user: "Banks" },
      { type: "text", text: " ?" },
    ]);
  });

  it("absorbs a single trailing [,.!?] into the mention match", () => {
    const out = parseSegments("hi @banks!");
    expect(out).toEqual([
      { type: "text", text: "hi " },
      { type: "mention", user: "banks" },
    ]);
  });

  it("leaves a mention with two trailing punctuations alone as plain text", () => {
    const out = parseSegments("hi @banks!?");
    expect(out).toEqual([{ type: "text", text: "hi @banks!?" }]);
  });

  it("parses http(s) links and strips the scheme for display", () => {
    const out = parseSegments("see https://example.com/x");
    expect(out).toEqual([
      { type: "text", text: "see " },
      { type: "link", href: "https://example.com/x", text: "example.com/x" },
    ]);
  });

  it("does not match plain domains as links", () => {
    const out = parseSegments("example.com");
    expect(out).toEqual([{ type: "text", text: "example.com" }]);
  });

  it("rejects mention tokens longer than 30 chars", () => {
    const tooLong = "@" + "a".repeat(31);
    const out = parseSegments(tooLong);
    expect(out).toEqual([{ type: "text", text: tooLong }]);
  });

  it("rejects cashtag tokens longer than 6 chars", () => {
    const out = parseSegments("$ABCDEFG");
    expect(out).toEqual([{ type: "text", text: "$ABCDEFG" }]);
  });
});
