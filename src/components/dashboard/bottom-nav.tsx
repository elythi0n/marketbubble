"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Info, LineChart, Newspaper, Radio, Trophy, Users } from "lucide-react";
import type { ComponentType } from "react";

import { walburn } from "@/lib/fonts";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
}

// Five equal slots: Watch · Markets · News (center) · Ranks · About. On the watch page the
// first slot transforms into "Channels" (the channel-switcher sheet) since the Watch link
// itself would be a no-op there.
const NAV: NavItem[] = [
  { href: "/watch",       label: "Watch",   icon: Radio },
  { href: "/markets",     label: "Markets", icon: LineChart },
  { href: "/news",        label: "News",    icon: Newspaper },
  { href: "/leaderboard", label: "Ranks",   icon: Trophy },
  { href: "/about",       label: "About",   icon: Info },
];

const itemClass = (active: boolean) =>
  cn(
    "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 transition-colors",
    active ? "text-foreground" : "text-muted-foreground",
  );

const labelClass = cn(walburn.className, "text-[0.62rem] uppercase tracking-[0.04em]");

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} className={itemClass(active)}>
      <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
      <span className={labelClass}>{item.label}</span>
    </Link>
  );
}

/**
 * App-style fixed bottom nav. Five equal slots, no raised FAB. On the Stream page the leading
 * Stream slot swaps to a "Channels" button (the channel-switcher sheet) since the link itself
 * would be a no-op there; the live-count badge lives on that swap.
 */
export function BottomNav({ onOpenChannels, liveCount }: { onOpenChannels?: () => void; liveCount?: number }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/watch" ? pathname === "/watch" || pathname.startsWith("/watch/") : pathname.startsWith(href);
  const onStream = isActive("/watch") && !!onOpenChannels;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-hairline bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
      aria-label="Primary"
    >
      {NAV.map((item, idx) => {
        if (idx === 0 && onStream) {
          return (
            <button key="channels" type="button" onClick={onOpenChannels} className={itemClass(true)}>
              <span className="relative">
                <Users className="size-5" strokeWidth={2.4} />
                {liveCount && liveCount > 0 ? (
                  <span className="absolute -right-2 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-feed-ok px-0.5 font-mono text-[0.52rem] font-bold leading-none text-background">
                    {liveCount}
                  </span>
                ) : null}
              </span>
              <span className={labelClass}>Channels</span>
            </button>
          );
        }
        return <NavLink key={item.href} item={item} active={isActive(item.href)} />;
      })}
    </nav>
  );
}
