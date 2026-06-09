"use client";

const STATIC: Record<string, string> = {
  broadcaster:   "https://files.kick.com/images/badges/broadcaster/badge_image",
  channel_owner: "https://files.kick.com/images/badges/broadcaster/badge_image",
  moderator:     "https://files.kick.com/images/badges/moderator/badge_image",
  og:            "https://files.kick.com/images/badges/og/badge_image",
  vip:           "https://files.kick.com/images/badges/vip/badge_image",
  verified:      "https://files.kick.com/images/badges/verified/badge_image",
  staff:         "https://files.kick.com/images/badges/staff/badge_image",
  sub_gifter:    "https://files.kick.com/images/badges/sub_gifter/badge_image",
};

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
  return STATIC[type];
}
