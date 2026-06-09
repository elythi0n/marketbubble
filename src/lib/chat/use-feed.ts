"use client";

import { useEffect, useRef, useState } from "react";

import type { FeedMessage } from "@/lib/feed/types";
import { ChatAggregator } from "./aggregator";
import type { ChatProvider, ProviderStatus } from "./provider";

export interface UseFeedResult {
  messages: readonly FeedMessage[];
  statuses: Readonly<Record<string, ProviderStatus>>;
}

/**
 * Subscribe a component to a set of providers through a single aggregator. The factory is invoked
 * once on mount; pass a stable list (e.g. built from channel state) and re-key the component to
 * rebuild when channels change.
 */
export function useFeed(makeProviders: () => ChatProvider[]): UseFeedResult {
  const [messages, setMessages] = useState<readonly FeedMessage[]>([]);
  const [statuses, setStatuses] = useState<Readonly<Record<string, ProviderStatus>>>({});
  const factoryRef = useRef(makeProviders);
  factoryRef.current = makeProviders;

  useEffect(() => {
    const aggregator = new ChatAggregator();
    for (const provider of factoryRef.current()) aggregator.register(provider);
    const offFeed = aggregator.subscribe(setMessages);
    const offStatus = aggregator.subscribeStatus(setStatuses);
    aggregator.start();
    return () => {
      offFeed();
      offStatus();
      aggregator.stop();
    };
  }, []);

  return { messages, statuses };
}
