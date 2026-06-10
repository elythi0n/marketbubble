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
 * Subscribe a component to a set of providers through a single aggregator. The aggregator is
 * (re)built whenever `depsKey` changes, tearing down old connections and opening fresh ones while
 * leaving the React subtree mounted. The latest factory is always read, so callers don't need to
 * memoize it.
 */
export function useFeed(
  makeProviders: () => ChatProvider[],
  depsKey = "",
  seedMessages?: () => readonly FeedMessage[],
): UseFeedResult {
  const [messages, setMessages] = useState<readonly FeedMessage[]>([]);
  const [statuses, setStatuses] = useState<Readonly<Record<string, ProviderStatus>>>({});
  const factoryRef = useRef(makeProviders);
  factoryRef.current = makeProviders;
  const seedRef = useRef(seedMessages);
  seedRef.current = seedMessages;

  useEffect(() => {
    const aggregator = new ChatAggregator();
    const seed = seedRef.current?.();
    if (seed && seed.length > 0) aggregator.seed(seed);
    for (const provider of factoryRef.current()) aggregator.register(provider);
    const offFeed = aggregator.subscribe(setMessages);
    const offStatus = aggregator.subscribeStatus(setStatuses);
    aggregator.start();
    return () => {
      offFeed();
      offStatus();
      aggregator.stop();
    };
  }, [depsKey]);

  return { messages, statuses };
}
