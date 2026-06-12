import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** Card: icon chip + title + hint header, optional right-side status slot, padded body. */
export function Card({
  title,
  hint,
  icon: Icon,
  status,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  hint?: string;
  icon: LucideIcon;
  status?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Extra classes for the body wrapper (e.g. "flex flex-col" so children can fill the height). */
  bodyClassName?: string;
}) {
  return (
    // No overflow-hidden — floating UI inside (Select listboxes) must be able to spill past the card.
    <div className={cn("flex flex-col rounded-xl border border-white/[0.08] bg-[#161619]/85", className)}>
      <header className="flex flex-none items-center gap-3 rounded-t-xl border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <span className="flex size-8 flex-none items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
          <Icon className="size-4 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <h3 className="text-[0.84rem] font-semibold text-foreground">{title}</h3>
          {hint ? <p className="mt-0.5 truncate text-[0.64rem] text-muted-foreground">{hint}</p> : null}
        </div>
        {status}
      </header>
      <div className={cn("flex-1 px-4 py-3.5", bodyClassName)}>{children}</div>
    </div>
  );
}
