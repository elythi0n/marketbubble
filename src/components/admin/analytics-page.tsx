"use client";

import { useEffect, useMemo, useState } from "react";

import { AnalyticsBoard } from "./analytics-board";
import { createAnalyticsDemoCall } from "./analytics-demo";
import { useAdmin } from "./admin-shell";

/**
 * Context adapter for /admin/analytics. With ?demo=1 the stats endpoints are answered by the
 * client-side demo generator instead of the server, so the page can be demoed with no database
 * and no recorded history.
 */
export function AnalyticsPage() {
  const { call, status, streamers } = useAdmin();

  const [demo, setDemo] = useState(false);
  useEffect(() => {
    setDemo(new URLSearchParams(window.location.search).get("demo") === "1");
  }, []);
  const demoCall = useMemo(() => createAnalyticsDemoCall(), []);

  return (
    <AnalyticsBoard
      call={demo ? demoCall : call}
      enabled={demo || (status?.database.ok ?? false)}
      streamers={streamers}
      demo={demo}
    />
  );
}
