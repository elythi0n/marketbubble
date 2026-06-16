import { notFound } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Showcase is an internal tool — every view, panel, and admin screen in one tall page. Not for
 * public traffic. Gated behind `SHOWCASE_ENABLED=1` so production deploys keep it dark; set the
 * env var locally (or in a preview deploy) to expose `/showcase` again. The layout is a Server
 * Component, so the env check runs before any of the (heavy, client-only) page code ships.
 */
export default function ShowcaseLayout({ children }: { children: ReactNode }) {
  if (process.env.SHOWCASE_ENABLED !== "1") notFound();
  return <>{children}</>;
}
