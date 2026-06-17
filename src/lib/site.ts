/** Public site name for metadata, JSON-LD, browser tabs, and social previews. */
export const siteName = "Market Bubble";

/** X / Twitter handle for the brand, used in Twitter Card `site` and `creator`. No leading @. */
export const siteTwitterHandle = "MarketBubble";

export const siteDescription =
  "A live show about speculation, attention and culture. Hosted by Banks and Ansem — Thursdays at 1PM PT, simulcast to Twitch, Kick and X.";

/** Primary navigation sections for the dashboard top bar. */
export const NAV_SECTIONS = [
  { label: "Stream", href: "/" },
  { label: "Markets", href: "/markets" },
  { label: "News", href: "/news" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "About", href: "/about" },
] as const;

export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return "http://localhost:3000";
  try {
    return new URL(raw).origin;
  } catch {
    return "http://localhost:3000";
  }
}
