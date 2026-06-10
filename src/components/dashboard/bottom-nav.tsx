"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Info, LineChart, Radio, Trophy } from "lucide-react";
import type { ComponentType } from "react";

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

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: ComponentType<{ className?: string; strokeWidth?: number }>; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 transition-colors",
        active ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
      <span className={cn(walburn.className, "text-[0.62rem] uppercase tracking-[0.04em]")}>{label}</span>
    </Link>
  );
}

/**
 * App-style fixed bottom nav. The raised center brand mark opens the channel sheet (the app's
 * "switcher"), like a camera/compose FAB; on pages without the sheet it routes home and opens it.
 */
export function BottomNav({ onOpenChannels }: { onOpenChannels?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const fabClass =
    "relative -top-3.5 flex size-[3.25rem] items-center justify-center rounded-full border border-white/12 bg-[#1b1b1f] shadow-[0_10px_26px_-8px_rgba(0,0,0,0.85)] transition-transform active:scale-95";

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

      {/* Center brand mark = Channels: tap to pick who you're watching. */}
      <div className="flex w-16 shrink-0 items-center justify-center">
        {onOpenChannels ? (
          <button type="button" onClick={onOpenChannels} aria-label="Channels" title="Channels" className={fabClass}>
            <MarketBubbleLogo className="size-7 text-foreground" />
          </button>
        ) : (
          <Link href="/?channels=1" aria-label="Channels" title="Channels" className={fabClass}>
            <MarketBubbleLogo className="size-7 text-foreground" />
          </Link>
        )}
      </div>

      <div className="flex flex-1">
        {RIGHT.map((it) => (
          <NavLink key={it.href} {...it} active={isActive(it.href)} />
        ))}
      </div>
    </nav>
  );
}
