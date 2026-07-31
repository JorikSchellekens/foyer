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

/**
 * A quiet accent dot shown while the given link is being viewed.
 *
 * A viewer's heartbeat can land just outside a single poll window, which would
 * blink the dot off and back on. Holding it for slightly longer than one poll
 * after it leaves the set makes presence read as steady rather than twitchy.
 */
export function LiveDot({ linkId }: { linkId: string }) {
  const live = useContext(LiveContext);
  const isLive = live.has(linkId);
  const [shown, setShown] = useState(isLive);

  useEffect(() => {
    if (isLive) {
      setShown(true);
      return;
    }
    const handle = setTimeout(() => setShown(false), 12_000);
    return () => clearTimeout(handle);
  }, [isLive]);

  if (!shown) return null;
  return (
    <span
      className="relative inline-flex size-2 shrink-0 animate-[reveal_var(--dur-reveal)_var(--ease-out-quint)_both]"
      title="Being viewed now"
    >
      <span className="sr-only">Being viewed now</span>
      <span
        aria-hidden
        className="absolute inset-0 rounded-full motion-safe:animate-[pulse-ring_2s_var(--ease-out-soft)_infinite]"
      />
      <span aria-hidden className="relative size-2 rounded-full bg-primary" />
    </span>
  );
}
