"use client";

import type { ReactNode } from "react";
import {
  Area,
  AreaChart as RechartsAreaChart,
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart as RechartsLineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";

type ChartDataValue = string | number | null;
export type TrendChartData = Record<string, ChartDataValue>;

type ChartProps = {
  data: TrendChartData[];
  index: string;
  categories: string[];
  colors?: string[];
  valueFormatter?: (value: number) => string;
  /** Tooltip-only formatter. Falls back to valueFormatter (which also drives the axis). */
  tooltipFormatter?: (value: number) => string;
  className?: string;
  /** Colour each bar by whether the value is good or bad — used for MoM difference charts. */
  colorBySign?: boolean;
  /** For colorBySign metrics where an increase is bad (expenses, liabilities). */
  invertSign?: boolean;
};

const POSITIVE = "#16a34a";
const NEGATIVE = "#dc2626";

const defaultColors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];

function getColor(colors: string[] | undefined, index: number) {
  return colors?.[index] ?? defaultColors[index % defaultColors.length];
}

function asNumber(value: ChartDataValue): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean;
  payload?: Array<{
    color?: string;
    dataKey?: string | number;
    name?: string | number;
    value?: ChartDataValue;
  }>;
  label?: string | number;
  valueFormatter?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{label}</p>
      <div className="space-y-1">
        {payload.map((item) => {
          const value = asNumber(item.value ?? null);
          return (
            <div
              key={`${item.dataKey ?? item.name}`}
              className="flex items-center gap-2"
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-muted-foreground">{item.name}</span>
              <span className="font-medium">
                {value === undefined
                  ? "—"
                  : valueFormatter
                    ? valueFormatter(value)
                    : value.toLocaleString("en-AU")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChartShell({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("h-72 w-full min-w-0 overflow-hidden", className)}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export function LineChart({
  data,
  index,
  categories,
  colors,
  valueFormatter,
  tooltipFormatter,
  className,
}: ChartProps) {
  return (
    <ChartShell className={className}>
      <RechartsLineChart data={data} margin={{ top: 8, right: 12, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={index} tickLine={false} axisLine={false} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={76}
          tickFormatter={(value: number) =>
            valueFormatter ? valueFormatter(value) : String(value)
          }
        />
        <Tooltip
          content={
            <ChartTooltip valueFormatter={tooltipFormatter ?? valueFormatter} />
          }
          cursor={false}
        />
        {categories.map((category, categoryIndex) => (
          <Line
            key={category}
            type="monotone"
            dataKey={category}
            name={category}
            stroke={getColor(colors, categoryIndex)}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        ))}
      </RechartsLineChart>
    </ChartShell>
  );
}

export function BarChart({
  data,
  index,
  categories,
  colors,
  valueFormatter,
  tooltipFormatter,
  className,
  colorBySign = false,
  invertSign = false,
}: ChartProps) {
  return (
    <ChartShell className={className}>
      <RechartsBarChart data={data} margin={{ top: 8, right: 12, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={index} tickLine={false} axisLine={false} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={76}
          tickFormatter={(value: number) =>
            valueFormatter ? valueFormatter(value) : String(value)
          }
        />
        {colorBySign && <ReferenceLine y={0} stroke="var(--border)" />}
        <Tooltip
          content={
            <ChartTooltip valueFormatter={tooltipFormatter ?? valueFormatter} />
          }
          cursor={false}
        />
        {categories.map((category, categoryIndex) => (
          <Bar
            key={category}
            dataKey={category}
            name={category}
            fill={getColor(colors, categoryIndex)}
            radius={[4, 4, 0, 0]}
          >
            {colorBySign &&
              data.map((datum, dataIndex) => {
                const raw = datum[category];
                const numeric = typeof raw === "number" ? raw : 0;
                // For expenses and liabilities a rise is the bad outcome, so
                // the sign that gets the red bar flips.
                const isBad = invertSign ? numeric > 0 : numeric < 0;
                return (
                  <Cell key={dataIndex} fill={isBad ? NEGATIVE : POSITIVE} />
                );
              })}
          </Bar>
        ))}
      </RechartsBarChart>
    </ChartShell>
  );
}

export function AreaChart({
  data,
  index,
  categories,
  colors,
  valueFormatter,
  tooltipFormatter,
  className,
}: ChartProps) {
  return (
    <ChartShell className={className}>
      <RechartsAreaChart data={data} margin={{ top: 8, right: 12, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={index} tickLine={false} axisLine={false} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={76}
          tickFormatter={(value: number) =>
            valueFormatter ? valueFormatter(value) : String(value)
          }
        />
        <Tooltip
          content={
            <ChartTooltip valueFormatter={tooltipFormatter ?? valueFormatter} />
          }
          cursor={false}
        />
        {categories.map((category, categoryIndex) => {
          const color = getColor(colors, categoryIndex);
          return (
            <Area
              key={category}
              type="monotone"
              dataKey={category}
              name={category}
              stroke={color}
              fill={color}
              fillOpacity={0.16}
              strokeWidth={2}
              connectNulls
            />
          );
        })}
      </RechartsAreaChart>
    </ChartShell>
  );
}
