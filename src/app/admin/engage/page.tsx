import type { Metadata } from "next";

import { EngagePanel } from "@/components/admin/engage-panel";

export const metadata: Metadata = { title: "Engage · Admin" };

export default function AdminEngagePage() {
  return <EngagePanel />;
}
