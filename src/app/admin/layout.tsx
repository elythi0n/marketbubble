import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { AdminShell } from "@/components/admin/admin-shell";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

// Env is read per-request so ADMIN_DISABLED=1 (or no key configured) makes every admin route a real 404.
export const dynamic = "force-dynamic";

/**
 * Shared layout for all /admin/* pages. The client shell inside holds the login gate and the
 * in-memory admin key, so moving between admin pages never asks for the key twice.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const disabled = process.env.ADMIN_DISABLED === "1";
  const hasKey = Boolean((process.env.ADMIN_API_KEY || process.env.X_CHAT_API_KEY || "").trim());
  if (disabled || !hasKey) notFound();
  return <AdminShell>{children}</AdminShell>;
}
