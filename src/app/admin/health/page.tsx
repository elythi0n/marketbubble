import type { Metadata } from "next";

import { HealthPanel } from "@/components/admin/health-panel";

export const metadata: Metadata = { title: "Health · Admin" };

export default function AdminHealthPage() {
  return <HealthPanel />;
}
