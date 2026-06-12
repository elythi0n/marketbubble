import type { Metadata } from "next";

import { GiveawayPanel } from "@/components/admin/giveaway-panel";

export const metadata: Metadata = { title: "Giveaway · Admin" };

export default function AdminGiveawayPage() {
  return <GiveawayPanel />;
}
