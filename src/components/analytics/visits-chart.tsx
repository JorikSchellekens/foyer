"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const config = {
  visits: { label: "Visits", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function VisitsChart({
  data,
}: {
  data: { date: string; visits: number }[];
}) {
  return (
    <ChartContainer config={config} className="h-44 w-full">
      <AreaChart data={data} margin={{ left: -24, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={40}
          tickFormatter={(v: string) =>
            new Date(v).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
            })
          }
        />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(v) =>
                new Date(String(v)).toLocaleDateString("en-GB", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })
              }
            />
          }
        />
        <Area
          dataKey="visits"
          type="monotone"
          fill="var(--color-visits)"
          fillOpacity={0.12}
          stroke="var(--color-visits)"
          strokeWidth={1.75}
        />
      </AreaChart>
    </ChartContainer>
  );
}
