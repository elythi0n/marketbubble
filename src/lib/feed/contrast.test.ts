import { describe, expect, it } from "vitest";
import { clampForContrast } from "./contrast";

function parseHex(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function channelLuminance(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

function ratioAgainst(hex: string, floorHex: string) {
  const a = luminance(hex);
  const b = luminance(floorHex);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

const DARK_FLOOR = "#0e1626";
const LIGHT_FLOOR = "#f1ede2";

describe("clampForContrast", () => {
  it("returns the dark-mode fallback when input is undefined", () => {
    expect(clampForContrast(undefined, 4.5, true)).toBe("#c9d4e8");
  });

  it("returns the light-mode fallback when input is undefined", () => {
    expect(clampForContrast(undefined, 4.5, false)).toBe("#3a4250");
  });

  it("returns the dark-mode fallback for malformed hex", () => {
    expect(clampForContrast("not-a-color", 4.5, true)).toBe("#c9d4e8");
    expect(clampForContrast("#ZZZ", 4.5, true)).toBe("#c9d4e8");
  });

  it("leaves a color that already passes contrast unchanged", () => {
    // White already passes on dark floor at any sane ratio.
    expect(clampForContrast("#ffffff", 4.5, true)).toBe("#ffffff");
  });

  it("lifts a dim color toward white over the dark floor until it passes", () => {
    const out = clampForContrast("#222222", 4.5, true);
    expect(ratioAgainst(out, DARK_FLOOR)).toBeGreaterThanOrEqual(4.5);
  });

  it("darkens a bright color toward black over the light floor until it passes", () => {
    const out = clampForContrast("#fff080", 4.5, false);
    expect(ratioAgainst(out, LIGHT_FLOOR)).toBeGreaterThanOrEqual(4.5);
  });

  it("accepts hex without leading #", () => {
    const out = clampForContrast("333333", 4.5, true);
    expect(out).toMatch(/^#[0-9a-f]{6}$/);
  });
});
