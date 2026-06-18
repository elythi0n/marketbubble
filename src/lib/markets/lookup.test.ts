import { describe, expect, it } from "vitest";
import { getTicker } from "./lookup";
import { MOCK_TICKERS } from "./mock";

describe("getTicker", () => {
  it("returns undefined for an unknown symbol", () => {
    expect(getTicker("ZZZNOTREAL")).toBeUndefined();
  });

  it("looks up symbols case-insensitively", () => {
    const sample = MOCK_TICKERS[0];
    expect(sample).toBeDefined();
    expect(getTicker(sample.symbol)).toBe(sample);
    expect(getTicker(sample.symbol.toLowerCase())).toBe(sample);
    expect(getTicker(sample.symbol.toUpperCase())).toBe(sample);
  });
});
