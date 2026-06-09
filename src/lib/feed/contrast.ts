/**
 * Clamp a username color so it stays legible on the chat background. Platform-provided colors are
 * often too dark on our deep-navy floor; we blend toward white until WCAG contrast passes.
 */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function toHex({ r, g, b }: Rgb): string {
  const h = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

const DARK_FLOOR: Rgb = { r: 0x0e, g: 0x16, b: 0x26 }; // matches --card

/**
 * Return a hex color that meets `minRatio` against the chat surface, nudging toward white as needed.
 * Falls back to a neutral light gray when the input is missing or unparseable.
 */
export function clampForContrast(color: string | undefined, minRatio = 4.5): string {
  const fallback = "#c9d4e8";
  if (!color) return fallback;
  const base = parseHex(color);
  if (!base) return fallback;

  const target: Rgb = { r: 255, g: 255, b: 255 };
  let current = base;
  for (let i = 0; i < 12; i += 1) {
    if (contrastRatio(current, DARK_FLOOR) >= minRatio) break;
    current = mix(current, target, 0.12);
  }
  return toHex(current);
}
