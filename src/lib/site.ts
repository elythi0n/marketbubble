/** Public site name for metadata, JSON-LD, and UI. */
export const siteName = "MarketBubble";

export const siteDescription =
  "Kick, Twitch, and X chat unified into one live feed, beside the stream and the markets. The elite streaming dashboard.";

/** Primary navigation sections for the dashboard top bar. */
export const NAV_SECTIONS = [
  { label: "Stream", href: "/" },
  { label: "Markets", href: "/markets" },
  { label: "Leaderboard", href: "/leaderboard" },
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
