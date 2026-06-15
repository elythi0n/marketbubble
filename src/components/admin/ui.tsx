"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

/** Shared visual primitives for the admin pages (extracted from the old single-page board). */

export const SOLID_BTN =
  "inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[0.76rem] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-30";
export const GHOST_BTN =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-hairline-strong bg-overlay-weak px-3 text-[0.76rem] font-medium text-foreground transition-colors hover:bg-overlay-medium disabled:opacity-35";
export const QUIET_BTN =
  "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[0.76rem] font-medium text-muted-foreground transition-colors hover:bg-overlay-weak hover:text-foreground disabled:opacity-35";
export const INPUT =
  "w-full rounded-lg border border-hairline bg-overlay-weak px-3 py-2 text-[0.8rem] text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-hairline-strong";

export function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export function LiveChip({ label = "live" }: { label?: string }) {
  return (
    <span className="flex flex-none items-center gap-1.5 rounded-md border border-feed-ok/25 bg-feed-ok/[0.08] px-2 py-1 text-[0.62rem] font-bold uppercase tracking-wide text-feed-ok">
      <span className="size-1.5 rounded-full bg-feed-ok" />
      {label}
    </span>
  );
}

/**
 * Icon button that copies `value` and pops into a green checkmark for a moment. Pass a function
 * for values that need the runtime origin (e.g. absolute overlay URLs).
 */
export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string | (() => string);
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(typeof value === "function" ? value() : value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — leave the icon as-is */
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      className={cn(
        "inline-flex size-6 flex-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-overlay-weak hover:text-foreground",
        copied && "text-feed-ok hover:text-feed-ok",
        className,
      )}
    >
      {copied ? <Check className="mb-pop size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

export function StatusDot({ ok }: { ok: boolean | null }) {
  return (
    <span
      className={cn(
        "size-2 flex-none rounded-full",
        ok === null ? "bg-muted-foreground/50" : ok ? "bg-feed-ok shadow-[0_0_6px_rgba(70,196,90,0.5)]" : "bg-feed-danger",
      )}
      aria-hidden
    />
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("relative h-[18px] w-8 flex-none rounded-full transition-colors", checked ? "bg-feed-ok/80" : "bg-overlay-strong")}
    >
      <span className={cn("absolute left-[2px] top-[2px] size-[14px] rounded-full bg-foreground transition-transform", checked ? "translate-x-[14px]" : "translate-x-0")} />
    </button>
  );
}

/**
 * Fully custom dropdown (no native option list): themed trigger, dark floating listbox with
 * check on the active entry. Closes on pick, outside click, or Escape; basic arrow-key support.
 */
export function Select<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const step = (dir: 1 | -1) => {
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + dir + options.length) % options.length];
    if (next) onChange(next.value);
  };

  const current = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (open) step(e.key === "ArrowDown" ? 1 : -1);
            else setOpen(true);
          }
        }}
        className={cn(INPUT, "flex cursor-pointer items-center justify-between gap-2 py-1.5 text-left text-[0.76rem]")}
      >
        <span className="truncate text-foreground">{current?.label ?? value}</span>
        <ChevronDown className={cn("size-3.5 flex-none text-muted-foreground transition-transform duration-150", open && "rotate-180")} />
      </button>

      {open ? (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className="absolute inset-x-0 top-[calc(100%+4px)] z-30 flex flex-col gap-0.5 rounded-lg border border-hairline bg-card/95 p-1 shadow-[0_18px_46px_-12px_rgba(0,0,0,0.85)] backdrop-blur-sm"
        >
          {options.map((o) => {
            const active = o.value === value;
            return (
              <li key={o.value} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[0.76rem] transition-colors",
                    active ? "bg-overlay-medium text-foreground" : "text-foreground/75 hover:bg-overlay-weak hover:text-foreground",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {active ? <Check className="size-3.5 flex-none text-feed-ok" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
