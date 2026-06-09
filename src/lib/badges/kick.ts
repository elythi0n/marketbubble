"use client";

// Kick renders role badges (broadcaster, moderator, vip, og, staff, sub_gifter, verified) as inline
// SVGs, not CDN images — there's no public image URL (the old files.kick.com/images/badges/* paths
// 403). So those resolve to no URL and the feed renders a styled text chip (MOD, VIP, …) instead.
// Only subscriber badges are real channel-uploaded images.

interface SubBadgeTier {
  months: number;
  imageUrl: string;
}

// slug → sorted subscriber badge tiers (ascending months)
const subRegistry = new Map<string, SubBadgeTier[]>();
const fetchingSlug = new Set<string>();

export async function initKickBadges(slug: string): Promise<void> {
  if (subRegistry.has(slug) || fetchingSlug.has(slug)) return;
  fetchingSlug.add(slug);
  try {
    const res = await fetch(`/api/kick/badges?slug=${encodeURIComponent(slug)}`);
    if (!res.ok) return;
    const { subscriberBadges } = await res.json() as { subscriberBadges: SubBadgeTier[] };
    const sorted = [...subscriberBadges].sort((a, b) => a.months - b.months);
    subRegistry.set(slug, sorted);
  } catch {
    // leave unset so the next connect can retry
    fetchingSlug.delete(slug);
  }
}

export function getKickBadgeUrl(slug: string, type: string, months?: number): string | undefined {
  if (type === "subscriber" || type === "sub") {
    const tiers = subRegistry.get(slug);
    if (tiers?.length) {
      const m = months ?? 1;
      let best: SubBadgeTier | undefined;
      for (const tier of tiers) {
        if (m >= tier.months) best = tier;
        else break;
      }
      return best?.imageUrl;
    }
    return undefined;
  }
  // Role badges have no image; the feed shows a text chip.
  return undefined;
}
