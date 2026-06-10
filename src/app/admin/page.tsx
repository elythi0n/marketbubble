import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AdminBoard } from "@/components/admin/admin-board";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

// Env is read per-request so ADMIN_DISABLED=1 (or no key configured) makes this route a real 404.
export const dynamic = "force-dynamic";

export default function AdminPage() {
  const disabled = process.env.ADMIN_DISABLED === "1";
  const hasKey = Boolean((process.env.ADMIN_API_KEY || process.env.X_CHAT_API_KEY || "").trim());
  if (disabled || !hasKey) notFound();
  return <AdminBoard />;
}
