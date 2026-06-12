import type { Metadata } from "next";

import { ControlsPanel } from "@/components/admin/controls-panel";

export const metadata: Metadata = { title: "Controls · Admin" };

export default function AdminControlsPage() {
  return <ControlsPanel />;
}
