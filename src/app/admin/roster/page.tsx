import type { Metadata } from "next";

import { RosterPanel } from "@/components/admin/roster-panel";

export const metadata: Metadata = { title: "Roster · Admin" };

export default function AdminRosterPage() {
  return <RosterPanel />;
}
