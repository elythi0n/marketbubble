"use client";

import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Minimal hover tooltip: shows `content` in a fixed, portaled popup centered above the trigger.
 * Pointer-events are disabled on the popup so it never steals hover. Used for cashtag market data
 * and viewer info in the feed.
 */
export function HoverCard({
  children,
  content,
  className,
}: {
  children: ReactNode;
  content: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const show = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top });
  };
  const hide = () => setPos(null);

  return (
    <span ref={ref} className={className} onMouseEnter={show} onMouseLeave={hide} onClick={hide}>
      {children}
      {pos && typeof document !== "undefined"
        ? createPortal(
            <div
              role="tooltip"
              className="pointer-events-none fixed z-[120] -translate-x-1/2 -translate-y-full pb-2"
              style={{ left: pos.x, top: pos.y }}
            >
              <div className="w-56 rounded-lg border border-hairline-strong bg-card p-3 shadow-[0_18px_46px_-18px_rgba(0,0,0,0.8)]">
                {content}
              </div>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
