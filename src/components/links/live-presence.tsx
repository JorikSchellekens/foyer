"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

const LiveContext = createContext<Set<string>>(new Set());

/**
 * Polls which links are being viewed right now and shares the set via context,
 * so any number of LiveDots update from a single request every 10s.
 */
export function LivePresenceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [live, setLive] = useState<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/links/live", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { linkIds: string[] };
        if (!cancelled) setLive(new Set(data.linkIds));
      } catch {
        // transient; keep the last known set
      }
    }
    poll();
    timer.current = setInterval(poll, 10_000);
    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  return <LiveContext.Provider value={live}>{children}</LiveContext.Provider>;
}

/** A pulsing dot shown only while the given link is being viewed. */
export function LiveDot({ linkId }: { linkId: string }) {
  const live = useContext(LiveContext);
  if (!live.has(linkId)) return null;
  return (
    <span
      className="relative inline-flex size-2 shrink-0"
      title="Being viewed now"
    >
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
      <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
    </span>
  );
}
