import { notFound } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Force per-request rendering so the `SHOWCASE_ENABLED` gate below is evaluated at RUNTIME, not at
 * build time. Without this, `next build` statically prerenders the route — and since the env var
 * isn't set during the Docker image build, the `notFound()` result gets baked in as a permanent
 * 404, so setting SHOWCASE_ENABLED=1 on the running container has no effect.
 */
export const dynamic = "force-dynamic";

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
