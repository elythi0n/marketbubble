"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LineChart, Radio, Trophy, Users } from "lucide-react";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";
import { MarketBubbleLogo } from "./market-bubble-logo";

const LEFT = [
  { href: "/", label: "Stream", icon: Radio },
  { href: "/markets", label: "Markets", icon: LineChart },
] as const;
const RIGHT = [{ href: "/leaderboard", label: "Ranks", icon: Trophy }] as const;

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: ComponentType<{ className?: string; strokeWidth?: number }>; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[0.62rem] font-medium transition-colors",
        active ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
      {label}
    </Link>
  );
}

/** App-style fixed bottom nav with the brand logo as a raised center item. `onOpenChannels` adds Channels. */
export function BottomNav({ onOpenChannels }: { onOpenChannels?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-white/[0.08] bg-[#141416]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
      aria-label="Primary"
    >
      <div className="flex flex-1">
        {LEFT.map((it) => (
          <NavLink key={it.href} {...it} active={isActive(it.href)} />
        ))}
      </div>

      {/* Center brand mark, raised like an app FAB */}
      <div className="flex w-16 shrink-0 items-center justify-center">
        <Link
          href="/"
          aria-label="MarketBubble home"
          className="relative -top-3.5 flex size-[3.25rem] items-center justify-center rounded-full border border-white/12 bg-[#1b1b1f] shadow-[0_10px_26px_-8px_rgba(0,0,0,0.85)] transition-transform active:scale-95"
        >
          <MarketBubbleLogo className="size-7 text-foreground" />
        </Link>
      </div>

      <div className="flex flex-1">
        {RIGHT.map((it) => (
          <NavLink key={it.href} {...it} active={isActive(it.href)} />
        ))}
        {onOpenChannels ? (
          <button
            type="button"
            onClick={onOpenChannels}
            className="flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[0.62rem] font-medium text-muted-foreground transition-colors active:text-foreground"
          >
            <Users className="size-5" />
            Channels
          </button>
        ) : (
          // On non-dashboard pages, route to the stream page and auto-open the channels sheet.
          <Link
            href="/?channels=1"
            className="flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[0.62rem] font-medium text-muted-foreground transition-colors active:text-foreground"
          >
            <Users className="size-5" />
            Channels
          </Link>
        )}
      </div>
    </nav>
  );
}
