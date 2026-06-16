"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/lib/theme/theme-context";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  /** Extra classes for the button (size, color overrides, etc.). */
  className?: string;
  /** Wrap in its own TooltipProvider when there isn't one already in the parent tree. */
  standalone?: boolean;
}

/**
 * Icon-only theme toggle. Click cycles the resolved theme between light and dark — Sun glyph
 * means light is active, Moon means dark is active. The icon swap rotate/scale/fades via
 * framer-motion; honors the user's Animations setting through MotionConfig in the dashboard.
 * Auto (system-follow) is offered separately in Settings to keep this affordance one-click.
 */
export function ThemeToggle({ className, standalone = false }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const next = isDark ? "light" : "dark";
  const inner = (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={() => setTheme(next)}
            aria-label={`Switch to ${next} theme`}
            className={cn(
              "flex size-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground",
              className,
            )}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={isDark ? "moon" : "sun"}
                initial={{ rotate: -90, opacity: 0, scale: 0.55 }}
                animate={{ rotate: 0, opacity: 1, scale: 1 }}
                exit={{ rotate: 90, opacity: 0, scale: 0.55 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center justify-center"
              >
                {isDark ? <Moon className="size-5" /> : <Sun className="size-5" />}
              </motion.span>
            </AnimatePresence>
          </button>
        }
      />
      <TooltipContent>Switch to {next} theme</TooltipContent>
    </Tooltip>
  );
  return standalone ? <TooltipProvider>{inner}</TooltipProvider> : inner;
}

/**
 * Floating top-right theme chip for mobile. Fixed-positioned over the page content so it's
 * reachable from every route without adding any chrome to the layout. Hidden on sm+ (the
 * desktop top-nav already carries a toggle). Sits inside the safe-area inset so it clears
 * iOS notches and Android status bars.
 */
export function MobileThemeChip() {
  return (
    <div
      aria-hidden={false}
      className="pointer-events-none fixed right-3 top-[calc(0.5rem+env(safe-area-inset-top))] z-50 sm:hidden"
    >
      <div className="pointer-events-auto">
        <ThemeToggle
          standalone
          className="size-10 rounded-full border border-hairline-strong bg-card/85 text-foreground/80 shadow-[var(--shadow-popover)] backdrop-blur-md hover:text-foreground"
        />
      </div>
    </div>
  );
}

