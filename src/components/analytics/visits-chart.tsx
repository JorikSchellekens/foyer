"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";

const config = {
  visits: { label: "Visits", color: "var(--chart-1)" },
} satisfies ChartConfig;

const fullDate = (v: string) =>
  new Date(v).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

/**
 * Paper tooltip: the metric with its unit leads, the date follows. Written here
 * rather than via ChartTooltipContent so the number keeps the mono face and the
 * card keeps the app's float elevation.
 */
function VisitsTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: { date?: string; visits?: number } }[];
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  const n = point.visits ?? 0;
  return (
    <div className="pointer-events-none rounded-md border bg-popover px-3 py-2 shadow-[var(--shadow-float)]">
      <div className="font-mono text-sm tabular text-foreground">
        {n} {n === 1 ? "visit" : "visits"}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">
        {fullDate(String(point.date))}
      </div>
    </div>
  );
}

export function VisitsChart({
  data,
}: {
  data: { date: string; visits: number }[];
}) {
  // Reveal once on mount, then hold still: recharts otherwise replays its
  // animation on every re-render, which reads as a glitch during navigation.
  const reduce = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );
  const [revealing, setRevealing] = useState(!reduce);
  useEffect(() => {
    if (!revealing) return;
    const id = setTimeout(() => setRevealing(false), 600);
    return () => clearTimeout(id);
  }, [revealing]);

  const peak = Math.max(...data.map((d) => d.visits), 0);

  if (data.length === 0 || peak === 0)
    return (
      <div className="flex h-44 items-center justify-center rounded-md border border-dashed">
        <p className="text-sm text-muted-foreground">
          No visits in this window yet.
        </p>
      </div>
    );

  return (
    <ChartContainer config={config} className="reveal h-44 w-full">
      <AreaChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid
          vertical={false}
          stroke="var(--border)"
          strokeOpacity={0.7}
        />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          minTickGap={44}
          className="font-mono tabular"
          tickFormatter={(v: string) =>
            new Date(v).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
            })
          }
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          width={28}
          tickCount={4}
          domain={[0, (max: number) => Math.max(max, 1)]}
          className="font-mono tabular"
        />
        <ChartTooltip
          content={<VisitsTooltip />}
          // A hairline cursor makes the reader aim at a day, not at a pixel.
          cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
          offset={12}
          animationDuration={0}
        />
        <Area
          dataKey="visits"
          type="monotone"
          fill="var(--color-visits)"
          fillOpacity={0.1}
          stroke="var(--color-visits)"
          strokeWidth={2}
          isAnimationActive={revealing}
          animationBegin={0}
          animationDuration={420}
          // A single point has no line to draw, so show its dot unconditionally.
          dot={data.length === 1 ? { r: 3.5, strokeWidth: 0 } : false}
          activeDot={{
            r: 4,
            strokeWidth: 2,
            stroke: "var(--card)",
            fill: "var(--color-visits)",
          }}
        />
      </AreaChart>
    </ChartContainer>
  );
}
