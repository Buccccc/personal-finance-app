"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { PageHeader } from "@/components/app-shell/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { formatMoney, formatMonth, formatPercent, formatRatio } from "@/lib/format";
import {
  type MonthlyCashflow,
  type MonthlyNetWorth,
  useMonthlyCashflow,
  useMonthlyNetWorth,
} from "@/lib/hooks/trends";
import { AreaChart, BarChart, LineChart } from "./tremor-charts";
import type { TrendChartData } from "./tremor-charts";

type SeriesKey = "cashflow" | "netWorth";
type SliceKey = "mom" | "ytd" | "yoyMonth" | "yoyYtd";
type ChartKind = "line" | "bar" | "area";
type FormatKind = "money" | "percent" | "ratio";
type AggregateKind = "sum" | "point" | "cashflowSavingsRate";

type TrendMonth = {
  month: string;
  year: number;
  monthOfYear: number;
  values: Record<string, number | null>;
};

type MetricConfig = {
  key: string;
  label: string;
  description: string;
  format: FormatKind;
  chart: ChartKind;
  aggregate: AggregateKind;
  color: string;
};

type SeriesConfig = {
  key: SeriesKey;
  label: string;
  description: string;
  metrics: MetricConfig[];
};

type SliceConfig = {
  key: SliceKey;
  label: string;
  description: string;
  comparisonLabel: string;
};

type SlicePoint = {
  month: string;
  monthLabel: string;
  axisLabel: string;
  value: number | null;
  comparison: number | null;
  changePercent: number | null;
};

const seriesConfigs: SeriesConfig[] = [
  {
    key: "cashflow",
    label: "Monthly cash flow",
    description: "Income, expenses, net cash flow, and savings rate by month.",
    metrics: [
      {
        key: "income",
        label: "Income",
        description: "Money coming in.",
        format: "money",
        chart: "bar",
        aggregate: "sum",
        color: "#2563eb",
      },
      {
        key: "expenses",
        label: "Expenses",
        description: "Money going out.",
        format: "money",
        chart: "bar",
        aggregate: "sum",
        color: "#dc2626",
      },
      {
        key: "net_cash_flow",
        label: "Net cash flow",
        description: "Income minus expenses.",
        format: "money",
        chart: "bar",
        aggregate: "sum",
        color: "#16a34a",
      },
      {
        key: "savings_rate",
        label: "Savings rate",
        description: "Net cash flow divided by income.",
        format: "percent",
        chart: "line",
        aggregate: "cashflowSavingsRate",
        color: "#7c3aed",
      },
    ],
  },
  {
    key: "netWorth",
    label: "Monthly net worth",
    description: "Assets, liabilities, net worth, and liquidity ratio by month.",
    metrics: [
      {
        key: "assets",
        label: "Assets",
        description: "Everything you own.",
        format: "money",
        chart: "area",
        aggregate: "point",
        color: "#2563eb",
      },
      {
        key: "liabilities",
        label: "Liabilities",
        description: "Everything you owe.",
        format: "money",
        chart: "area",
        aggregate: "point",
        color: "#dc2626",
      },
      {
        key: "net_worth",
        label: "Net worth",
        description: "Assets minus liabilities.",
        format: "money",
        chart: "area",
        aggregate: "point",
        color: "#16a34a",
      },
      {
        key: "liquidity_ratio",
        label: "Liquidity ratio",
        description: "Liquid assets compared with liabilities.",
        format: "ratio",
        chart: "line",
        aggregate: "point",
        color: "#7c3aed",
      },
    ],
  },
];

const sliceConfigs: SliceConfig[] = [
  {
    key: "mom",
    label: "MoM",
    description: "The monthly values as-is, with change vs the previous month.",
    comparisonLabel: "Previous month",
  },
  {
    key: "ytd",
    label: "YTD",
    description:
      "Cash-flow values accumulate within each calendar year. Net-worth values stay point-in-time.",
    comparisonLabel: "Previous YTD point",
  },
  {
    key: "yoyMonth",
    label: "YoY by month",
    description: "Each month compared with the same month in the previous year.",
    comparisonLabel: "Same month last year",
  },
  {
    key: "yoyYtd",
    label: "YoY by YTD",
    description:
      "This year's year-to-date value compared with last year's value at the same point.",
    comparisonLabel: "Prior-year YTD",
  },
];

function toNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseTrendMonth(month: string | null): Pick<
  TrendMonth,
  "month" | "year" | "monthOfYear"
> | null {
  if (!month) return null;
  const [yearPart, monthPart] = month.split("-");
  const year = Number(yearPart);
  const monthOfYear = Number(monthPart);

  if (!Number.isInteger(year) || !Number.isInteger(monthOfYear)) return null;

  return { month, year, monthOfYear };
}

function normalizeCashflow(rows: MonthlyCashflow[]): TrendMonth[] {
  return rows
    .map((row) => {
      const parsed = parseTrendMonth(row.month);
      if (!parsed) return null;

      const trendMonth: TrendMonth = {
        ...parsed,
        values: {
          income: toNumber(row.income),
          expenses: toNumber(row.expenses),
          net_cash_flow: toNumber(row.net_cash_flow),
          savings_rate: toNumber(row.savings_rate),
        },
      };

      return trendMonth;
    })
    .filter((row): row is TrendMonth => row !== null);
}

function normalizeNetWorth(rows: MonthlyNetWorth[]): TrendMonth[] {
  return rows
    .map((row) => {
      const parsed = parseTrendMonth(row.month);
      if (!parsed) return null;

      const trendMonth: TrendMonth = {
        ...parsed,
        values: {
          assets: toNumber(row.assets),
          liabilities: toNumber(row.liabilities),
          net_worth: toNumber(row.net_worth),
          liquidity_ratio: toNumber(row.liquidity_ratio),
        },
      };

      return trendMonth;
    })
    .filter((row): row is TrendMonth => row !== null);
}

function axisMonthLabel(month: string): string {
  const date = new Date(`${month.slice(0, 7)}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return month;
  return date.toLocaleDateString("en-AU", { month: "short", year: "2-digit" });
}

function formatMetricValue(value: number | null, format: FormatKind): string {
  if (value === null) return "—";
  if (format === "money") return formatMoney(value);
  if (format === "percent") return formatPercent(value);
  return formatRatio(value);
}

function formatChange(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatPercent(value)}`;
}

function calculateChange(
  value: number | null,
  comparison: number | null,
): number | null {
  if (value === null || comparison === null || comparison === 0) return null;
  return (value - comparison) / Math.abs(comparison);
}

function sumValues(rows: TrendMonth[], key: string): number | null {
  let total = 0;
  let hasValue = false;

  for (const row of rows) {
    const value = row.values[key];
    if (value !== null && value !== undefined) {
      total += value;
      hasValue = true;
    }
  }

  return hasValue ? total : null;
}

function cashflowSavingsRate(rows: TrendMonth[]): number | null {
  const income = sumValues(rows, "income");
  const netCashFlow = sumValues(rows, "net_cash_flow");

  if (income === null || netCashFlow === null || income === 0) return null;
  return netCashFlow / income;
}

function getYtdValue(
  rows: TrendMonth[],
  row: TrendMonth,
  metric: MetricConfig,
): number | null {
  if (metric.aggregate === "point") return row.values[metric.key] ?? null;

  const ytdRows = rows.filter(
    (item) => item.year === row.year && item.monthOfYear <= row.monthOfYear,
  );

  if (metric.aggregate === "cashflowSavingsRate") {
    return cashflowSavingsRate(ytdRows);
  }

  return sumValues(ytdRows, metric.key);
}

function getPriorYearYtdValue(
  rows: TrendMonth[],
  row: TrendMonth,
  metric: MetricConfig,
): number | null {
  if (metric.aggregate === "point") {
    return (
      rows.find(
        (item) =>
          item.year === row.year - 1 && item.monthOfYear === row.monthOfYear,
      )?.values[metric.key] ?? null
    );
  }

  const priorRows = rows.filter(
    (item) =>
      item.year === row.year - 1 && item.monthOfYear <= row.monthOfYear,
  );

  if (metric.aggregate === "cashflowSavingsRate") {
    return cashflowSavingsRate(priorRows);
  }

  return sumValues(priorRows, metric.key);
}

function buildSlicePoints(
  rows: TrendMonth[],
  metric: MetricConfig,
  slice: SliceKey,
): SlicePoint[] {
  return rows.map((row, index) => {
    const previousRow = rows[index - 1];
    const sameMonthLastYear = rows.find(
      (item) =>
        item.year === row.year - 1 && item.monthOfYear === row.monthOfYear,
    );

    let value: number | null;
    let comparison: number | null;

    if (slice === "ytd") {
      value = getYtdValue(rows, row, metric);
      comparison = previousRow ? getYtdValue(rows, previousRow, metric) : null;
    } else if (slice === "yoyMonth") {
      value = row.values[metric.key] ?? null;
      comparison = sameMonthLastYear?.values[metric.key] ?? null;
    } else if (slice === "yoyYtd") {
      value = getYtdValue(rows, row, metric);
      comparison = getPriorYearYtdValue(rows, row, metric);
    } else {
      value = row.values[metric.key] ?? null;
      comparison = previousRow?.values[metric.key] ?? null;
    }

    return {
      month: row.month,
      monthLabel: formatMonth(row.month),
      axisLabel: axisMonthLabel(row.month),
      value,
      comparison,
      changePercent: calculateChange(value, comparison),
    };
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not load trend data.";
}

export function TrendsView() {
  const cashflowQuery = useMonthlyCashflow();
  const netWorthQuery = useMonthlyNetWorth();

  const rowsBySeries = useMemo(
    () => ({
      cashflow: normalizeCashflow(cashflowQuery.data ?? []),
      netWorth: normalizeNetWorth(netWorthQuery.data ?? []),
    }),
    [cashflowQuery.data, netWorthQuery.data],
  );

  const isLoading = cashflowQuery.isLoading || netWorthQuery.isLoading;
  const error = cashflowQuery.error ?? netWorthQuery.error;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className="space-y-6"
    >
      <PageHeader
        title="Trends"
        description="Compare your monthly cash flow and net worth over time. Each tab uses the same monthly Supabase data, then calculates the trend slice in the browser."
      />

      {error && <ErrorState message={getErrorMessage(error)} />}

      <Tabs defaultValue="cashflow" className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          {seriesConfigs.map((series) => (
            <TabsTrigger key={series.key} value={series.key}>
              {series.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {seriesConfigs.map((series) => (
          <TabsContent key={series.key} value={series.key} className="space-y-4">
            <SeriesPanel
              series={series}
              rows={rowsBySeries[series.key]}
              isLoading={isLoading}
            />
          </TabsContent>
        ))}
      </Tabs>
    </motion.div>
  );
}

function SeriesPanel({
  series,
  rows,
  isLoading,
}: {
  series: SeriesConfig;
  rows: TrendMonth[];
  isLoading: boolean;
}) {
  if (isLoading) return <TrendsSkeleton />;

  if (rows.length === 0) {
    return (
      <EmptyState
        title={`No ${series.label.toLowerCase()} data yet`}
        description="Once the Supabase view returns monthly rows, the charts and tables will appear here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{series.label}</CardTitle>
          <CardDescription>{series.description}</CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="mom" className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          {sliceConfigs.map((slice) => (
            <TabsTrigger key={slice.key} value={slice.key}>
              {slice.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {sliceConfigs.map((slice) => (
          <TabsContent key={slice.key} value={slice.key} className="space-y-4">
            <div className="rounded-xl border bg-muted/20 p-4">
              <p className="font-medium">{slice.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {slice.description}
              </p>
            </div>

            <div className="grid min-w-0 gap-4 xl:grid-cols-2">
              {series.metrics.map((metric, index) => (
                <MetricTrendCard
                  key={metric.key}
                  metric={metric}
                  slice={slice}
                  rows={rows}
                  index={index}
                />
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function MetricTrendCard({
  metric,
  slice,
  rows,
  index,
}: {
  metric: MetricConfig;
  slice: SliceConfig;
  rows: TrendMonth[];
  index: number;
}) {
  const points = buildSlicePoints(rows, metric, slice.key);
  const chartData: TrendChartData[] = points.map((point) => ({
    month: point.axisLabel,
    [metric.label]: point.value,
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.04 }}
      className="min-w-0"
    >
      <Card className="h-full min-w-0 lift">
        <CardHeader>
          <CardTitle>{metric.label}</CardTitle>
          <CardDescription>{metric.description}</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 space-y-4">
          <TrendChart metric={metric} data={chartData} />
          <TrendTable points={points} metric={metric} slice={slice} />
        </CardContent>
      </Card>
    </motion.div>
  );
}

function TrendChart({
  metric,
  data,
}: {
  metric: MetricConfig;
  data: TrendChartData[];
}) {
  const props = {
    data,
    index: "month",
    categories: [metric.label],
    colors: [metric.color],
    valueFormatter: (value: number) => formatMetricValue(value, metric.format),
  };

  if (metric.chart === "bar") return <BarChart {...props} />;
  if (metric.chart === "area") return <AreaChart {...props} />;
  return <LineChart {...props} />;
}

function TrendTable({
  points,
  metric,
  slice,
}: {
  points: SlicePoint[];
  metric: MetricConfig;
  slice: SliceConfig;
}) {
  return (
    <div className="max-h-80 overflow-auto overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Month</TableHead>
            <TableHead className="text-right">Value</TableHead>
            <TableHead className="text-right">{slice.comparisonLabel}</TableHead>
            <TableHead className="text-right">Change</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {points.map((point) => (
            <TableRow key={point.month}>
              <TableCell className="font-medium">{point.monthLabel}</TableCell>
              <TableCell className="tabular text-right">
                {formatMetricValue(point.value, metric.format)}
              </TableCell>
              <TableCell className="tabular text-right">
                {formatMetricValue(point.comparison, metric.format)}
              </TableCell>
              <TableCell className="tabular text-right">
                {formatChange(point.changePercent)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function TrendsSkeleton() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </CardHeader>
      </Card>
      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="min-w-0">
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-56" />
            </CardHeader>
            <CardContent className="min-w-0 space-y-4">
              <Skeleton className="h-72 w-full" />
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardContent>
        <p className="text-sm text-destructive">{message}</p>
      </CardContent>
    </Card>
  );
}
