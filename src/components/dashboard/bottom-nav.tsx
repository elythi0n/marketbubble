"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Info, LineChart, Radio, Trophy, Users } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { walburn } from "@/lib/fonts";
import { cn } from "@/lib/utils";
import { MarketBubbleLogo } from "./market-bubble-logo";

const LEFT = [
  { href: "/", label: "Stream", icon: Radio },
  { href: "/markets", label: "Markets", icon: LineChart },
] as const;
const RIGHT = [
  { href: "/leaderboard", label: "Ranks", icon: Trophy },
  { href: "/about", label: "About", icon: Info },
] as const;

const itemClass = (active: boolean) =>
  cn(
    "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 transition-colors",
    active ? "text-foreground" : "text-muted-foreground",
  );

const labelClass = cn(walburn.className, "text-[0.62rem] uppercase tracking-[0.04em]");

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: ComponentType<{ className?: string; strokeWidth?: number }>; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={itemClass(active)}>
      <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
      <span className={labelClass}>{label}</span>
    </Link>
  );
}

/**
 * App-style fixed bottom nav. The raised center brand mark opens the channel sheet (the app's
 * "switcher"), like a camera/compose FAB. On the stream page itself the "Stream" slot — which
 * would be a no-op there — turns into an explicit "Channels" item, so the action has a labeled
 * entry point without cluttering the brand mark.
 */
export function BottomNav({ onOpenChannels, liveCount }: { onOpenChannels?: () => void; liveCount?: number }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const fabClass =
    "relative -top-3.5 flex size-[3.25rem] items-center justify-center rounded-full border border-hairline-strong bg-card shadow-[0_10px_26px_-8px_rgba(0,0,0,0.85)] transition-transform active:scale-95";

  const channelsFab: ReactNode = onOpenChannels ? (
    <button type="button" onClick={onOpenChannels} aria-label="Channels" title="Channels" className={fabClass}>
      <MarketBubbleLogo className="size-7 text-foreground" />
    </button>
  ) : (
    <Link href="/?channels=1" aria-label="Channels" title="Channels" className={fabClass}>
      <MarketBubbleLogo className="size-7 text-foreground" />
    </Link>
  );

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-hairline bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
      aria-label="Primary"
    >
      <div className="flex flex-1">
        {/* On the stream page the Stream link does nothing, so the slot becomes Channels. */}
        {isActive("/") && onOpenChannels ? (
          <button type="button" onClick={onOpenChannels} className={itemClass(true)}>
            <span className="relative">
              <Users className="size-5" strokeWidth={2.4} />
              {liveCount && liveCount > 0 ? (
                <span className="absolute -right-2 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-feed-ok px-0.5 font-mono text-[0.52rem] font-bold leading-none text-black">
                  {liveCount}
                </span>
              ) : null}
            </span>
            <span className={labelClass}>Channels</span>
          </button>
        ) : (
          <NavLink {...LEFT[0]} active={isActive("/")} />
        )}
        <NavLink {...LEFT[1]} active={isActive("/markets")} />
      </div>

      {/* Center brand mark = Channels: tap to pick who you're watching. */}
      <div className="flex w-16 shrink-0 items-center justify-center">{channelsFab}</div>

      <div className="flex flex-1">
        {RIGHT.map((it) => (
          <NavLink key={it.href} {...it} active={isActive(it.href)} />
        ))}
      </div>
    </nav>
  );
}
