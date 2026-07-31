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
 * A viewer's heartbeat can land just outside a single poll window. Keeping an
 * id live for longer than one interval after it was last seen stops the dot
 * blinking off and straight back on. Smoothing lives here, in the one place
 * that knows when each id was last observed, so every dot stays a pure
 * function of the set.
 */
const GRACE_MS = 25_000;

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
  const lastSeen = useRef(new Map<string, number>());

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/links/live", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { linkIds: string[] };
        if (cancelled) return;
        const now = Date.now();
        for (const id of data.linkIds) lastSeen.current.set(id, now);
        for (const [id, at] of lastSeen.current) {
          if (now - at > GRACE_MS) lastSeen.current.delete(id);
        }
        setLive(new Set(lastSeen.current.keys()));
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

/** A quiet accent dot shown while the given link is being viewed. */
export function LiveDot({ linkId }: { linkId: string }) {
  const live = useContext(LiveContext);
  if (!live.has(linkId)) return null;
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
