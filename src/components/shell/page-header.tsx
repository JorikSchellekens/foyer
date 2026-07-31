"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The header above every page. It sticks, and condenses once the page has
 * scrolled: title steps down, description folds away, so long tables keep a
 * title and their actions in reach without paying 96px for them.
 *
 * The scroll state comes from an IntersectionObserver on a probe above the
 * header, never from a scroll listener. The probe sits before the header in
 * flow, so condensing cannot move it and the two states cannot oscillate.
 */
export function PageHeader({
  title,
  description,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const probe = useRef<HTMLDivElement>(null);
  const [condensed, setCondensed] = useState(false);

  useEffect(() => {
    const el = probe.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setCondensed(!entry.isIntersecting),
      { threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      {/* 16px tall then pulled straight back out of flow: costs no layout, but
          has to leave the viewport before the header condenses. */}
      <div ref={probe} aria-hidden className="pointer-events-none -mb-4 h-4" />
      <div
        data-condensed={condensed ? "true" : "false"}
        className={cn(
          "group/header sticky top-14 z-30 border-b px-4 py-6 sm:px-8 md:top-0",
          "bg-background supports-backdrop-filter:bg-background/85 supports-backdrop-filter:backdrop-blur-sm",
          "transition-[padding,box-shadow] duration-[var(--dur)] ease-[var(--ease-out-soft)]",
          "data-[condensed=true]:py-3 data-[condensed=true]:shadow-[var(--shadow-raise)]"
        )}
      >
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          {/* Basis rather than flex-1: below ~16rem of title width the actions
              wrap to their own line instead of crushing the title. */}
          <div className="min-w-0 flex-[1_1_16rem]">
            <h1
              className={cn(
                "font-display text-3xl leading-[1.15] tracking-tight text-balance",
                "transition-[font-size] duration-[var(--dur)] ease-[var(--ease-out-soft)]",
                "group-data-[condensed=true]/header:text-xl"
              )}
            >
              {title}
            </h1>
            {description && (
              // max-height rather than display, so the fold is animatable.
              <p
                className={cn(
                  "mt-1.5 max-h-20 max-w-2xl overflow-hidden text-sm text-muted-foreground",
                  "transition-[max-height,opacity,margin] duration-[var(--dur)] ease-[var(--ease-out-soft)]",
                  "group-data-[condensed=true]/header:mt-0",
                  "group-data-[condensed=true]/header:max-h-0",
                  "group-data-[condensed=true]/header:opacity-0"
                )}
              >
                {description}
              </p>
            )}
          </div>
          {children && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {children}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
