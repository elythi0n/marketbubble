"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function BentoGrid({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "grid auto-rows-[15rem] grid-cols-1 gap-4 sm:auto-rows-[16rem] sm:grid-cols-2 lg:auto-rows-[16.5rem] lg:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

type BentoCardProps = {
  className?: string;
  name: string;
  description: string;
  Icon?: LucideIcon;
  /** Custom (e.g. colored, branded) icon node; replaces the tinted Lucide box. */
  iconNode?: ReactNode;
  eyebrow?: string;
  background?: ReactNode;
};

export function BentoCard({ className, name, description, Icon, iconNode, eyebrow, background }: BentoCardProps) {
  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-[1.35rem] border border-hairline-strong bg-gradient-to-b from-overlay-weak to-overlay-weak/60",
        "p-5 shadow-[var(--shadow-card)] backdrop-blur-sm transition-all duration-300",
        "hover:-translate-y-0.5 hover:border-blue-200/25 hover:from-overlay-medium hover:to-overlay-weak hover:shadow-[0_22px_58px_-26px_rgba(91,140,255,0.45)]",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-blue-300/10 blur-2xl transition-opacity duration-300 group-hover:bg-blue-200/16" />
        <div className="absolute -left-10 bottom-[-5.5rem] h-40 w-40 rounded-full bg-indigo-200/8 blur-2xl opacity-60 transition-all duration-300 group-hover:bottom-[-4.5rem] group-hover:opacity-90" />
      </div>
      {background ? (
        <div className="pointer-events-none absolute inset-0 z-[1] transition-transform duration-300 group-hover:scale-[1.03]">
          {background}
        </div>
      ) : null}

      <div className="relative z-10 flex h-full flex-col">
        {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-100/58">{eyebrow}</p> : null}

        {iconNode ? (
          <div className="mt-auto inline-flex size-[3.35rem] items-center justify-center rounded-2xl border border-hairline-strong bg-overlay-weak shadow-[var(--shadow-popover)] transition-all duration-300 group-hover:border-hairline-strong group-hover:bg-overlay-medium">
            {iconNode}
          </div>
        ) : Icon ? (
          <div className="mt-auto inline-flex size-[3.35rem] items-center justify-center rounded-2xl border border-blue-200/25 bg-blue-300/8 text-blue-50 shadow-[0_0_30px_-14px_rgba(91,140,255,0.65)] transition-all duration-300 group-hover:border-blue-100/35 group-hover:bg-blue-300/14 group-hover:shadow-[0_0_40px_-14px_rgba(91,140,255,0.9)]">
            <Icon className="size-[1.85rem]" strokeWidth={1.9} aria-hidden />
          </div>
        ) : null}

        <h3 className="mt-4 text-xl font-semibold leading-tight text-foreground sm:text-[1.42rem]">{name}</h3>
        <p className="mt-2 max-w-[28ch] text-sm leading-relaxed text-blue-50/78 sm:text-[0.98rem]">{description}</p>
      </div>
    </article>
  );
}
