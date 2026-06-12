import type { Metadata } from "next";

import { AnalyticsPage } from "@/components/admin/analytics-page";

export const metadata: Metadata = { title: "Analytics · Admin" };

export default function AdminAnalyticsPage() {
  return <AnalyticsPage />;
}
