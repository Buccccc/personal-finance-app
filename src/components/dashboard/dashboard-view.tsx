"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/app-shell/page-header";
import {
  formatMoney,
  formatMonth,
  formatPercent,
  formatRatio,
} from "@/lib/format";
import {
  getMonthKey,
  getMonthOffset,
  getRelativeMonthKey,
  useDashboardData,
  type MonthlyCashflow,
  type MonthlyCategoryBreakdown,
  type NetWorthCurrent,
  type NetWorthHistory,
} from "@/lib/hooks/dashboard";

type CategoryChartItem = {
  name: string;
  value: number;
  txnCount: number;
};

type MonthOption = {
  key: string;
  label: string;
};

const chartColours = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--primary)",
];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to load dashboard.";
}

function toMoneyNumber(value: number | null | undefined): number {
  return value ?? 0;
}

function hasMoneyValue(value: number | null | undefined): value is number {
  return value !== null && value !== undefined;
}

function buildMonthOptions(): MonthOption[] {
  const options: MonthOption[] = [];
  const cursor = new Date();
  cursor.setDate(1);

  const earliestMonth = new Date(2024, 11, 1);

  while (cursor >= earliestMonth) {
    const key = getMonthKey(cursor);

    options.push({
      key,
      label: formatMonth(key),
    });

    cursor.setMonth(cursor.getMonth() - 1);
  }

  return options;
}

function categoryRowsToChartItems(
  rows: MonthlyCategoryBreakdown[],
): CategoryChartItem[] {
  return rows
    .map((row) => {
      const value = Math.abs(row.total ?? 0);
      const name = row.category_name ?? "Uncategorised";

      return {
        name,
        value,
        txnCount: row.txn_count ?? 0,
      };
    })
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
}

export function DashboardView() {
  // 0 = current month (month-to-date), -1 = last month, etc. Capped at 0 (no future).
  const [offset, setOffset] = useState(0);
  const monthKey = getRelativeMonthKey(offset);
  const dashboard = useDashboardData(monthKey);
  const data = dashboard.data;
  const monthLabel = formatMonth(monthKey);
  const isCurrent = offset === 0;
  const isLast = offset === -1;
  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const earliestMonthKey = monthOptions.at(-1)?.key ?? monthKey;
  const earliestOffset = getMonthOffset(earliestMonthKey);
  const isEarliest = monthKey === earliestMonthKey;

  const expenseItems = useMemo(
    () => categoryRowsToChartItems(data?.expensesByCategory ?? []),
    [data?.expensesByCategory],
  );
  const incomeItems = useMemo(
    () => categoryRowsToChartItems(data?.incomeByCategory ?? []),
    [data?.incomeByCategory],
  );

  useEffect(() => {
    if (dashboard.error) {
      toast.error(getErrorMessage(dashboard.error));
    }
  }, [dashboard.error]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="A monthly snapshot of cash flow, category spending, and net worth."
      >
        <div className="hidden gap-1 sm:flex">
          <Button
            variant={isCurrent ? "default" : "outline"}
            size="sm"
            onClick={() => setOffset(0)}
          >
            This month
          </Button>
          <Button
            variant={isLast ? "default" : "outline"}
            size="sm"
            onClick={() => setOffset(-1)}
          >
            Last month
          </Button>
        </div>
      </PageHeader>

      <div className="flex items-center justify-between rounded-lg border bg-card px-3 py-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous month"
          disabled={isEarliest}
          onClick={() => setOffset((o) => Math.max(earliestOffset, o - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Select
          value={monthKey}
          onValueChange={(value) => setOffset(getMonthOffset(value ?? monthKey))}
        >
          <SelectTrigger
            aria-label="Select dashboard month"
            className="h-auto min-w-40 border-0 bg-transparent px-3 py-1 text-center shadow-none hover:bg-accent"
          >
            <div className="flex min-w-0 flex-col items-center">
              <SelectValue className="justify-center font-heading text-sm font-semibold" />
              <span className="text-xs text-muted-foreground">
                {isCurrent ? "Month to date" : "Full month"}
              </span>
            </div>
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {monthOptions.map((month) => (
              <SelectItem key={month.key} value={month.key}>
                {month.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Next month"
          disabled={isCurrent}
          onClick={() => setOffset((o) => Math.min(0, o + 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {dashboard.error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent>
            <p className="text-sm text-destructive">
              {getErrorMessage(dashboard.error)}
            </p>
          </CardContent>
        </Card>
      )}

      <KpiGrid
        isLoading={dashboard.isLoading}
        cashflow={data?.cashflow ?? null}
        currentNetWorth={data?.currentNetWorth ?? null}
        monthEndNetWorth={data?.monthEndNetWorth ?? null}
        monthLabel={monthLabel}
        isCurrent={isCurrent}
      />

      {!dashboard.isLoading && !data?.cashflow && (
        <EmptyStateCard
          title={`No cash flow data for ${monthLabel}`}
          description="Imported data currently ends before this selected month, so the monthly totals are empty."
        />
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <CategoryBreakdownCard
          title="Expenses by category"
          description={`Where money went in ${monthLabel}.`}
          emptyTitle="No expenses for this month"
          emptyDescription="There are no expense categories to show for the selected month."
          items={expenseItems}
          isLoading={dashboard.isLoading}
        />
        <CategoryBreakdownCard
          title="Income by category"
          description={`Where money came from in ${monthLabel}.`}
          emptyTitle="No income for this month"
          emptyDescription="There are no income categories to show for the selected month."
          items={incomeItems}
          isLoading={dashboard.isLoading}
        />
      </div>
    </div>
  );
}

function KpiGrid({
  isLoading,
  cashflow,
  currentNetWorth,
  monthEndNetWorth,
  monthLabel,
  isCurrent,
}: {
  isLoading: boolean;
  cashflow: MonthlyCashflow | null;
  currentNetWorth: NetWorthCurrent | null;
  monthEndNetWorth: NetWorthHistory | null;
  monthLabel: string;
  isCurrent: boolean;
}) {
  const selectedNetWorth = isCurrent ? currentNetWorth : monthEndNetWorth;
  const hasSelectedNetWorth = selectedNetWorth !== null;
  const netWorthMissingDescription = isCurrent
    ? "No current value found"
    : "No month-end value found";

  const cards = [
    {
      title: "Total income",
      value: cashflow ? formatMoney(toMoneyNumber(cashflow.income)) : "-",
      description: cashflow ? monthLabel : "No monthly row found",
    },
    {
      title: "Total expenses",
      value: cashflow ? formatMoney(-toMoneyNumber(cashflow.expenses)) : "-",
      description: cashflow ? monthLabel : "No monthly row found",
    },
    {
      title: "Net cash flow",
      value: cashflow ? formatMoney(toMoneyNumber(cashflow.net_cash_flow)) : "-",
      description: cashflow
        ? toMoneyNumber(cashflow.net_cash_flow) >= 0
          ? "Income minus expenses"
          : "Expenses exceeded income"
        : "No monthly row found",
    },
    {
      title: "Savings rate",
      value: cashflow ? formatPercent(cashflow.savings_rate) : "-",
      description: "Share of income kept",
    },
    {
      title: isCurrent ? "Current net worth" : "Net worth (month-end)",
      value: hasMoneyValue(selectedNetWorth?.net_worth)
        ? formatMoney(selectedNetWorth.net_worth)
        : "—",
      description: hasSelectedNetWorth
        ? "Total assets minus liabilities"
        : netWorthMissingDescription,
    },
    {
      title: isCurrent ? "Current liquid worth" : "Liquid worth (month-end)",
      value: hasMoneyValue(selectedNetWorth?.liquid_assets)
        ? formatMoney(selectedNetWorth.liquid_assets)
        : "—",
      description:
        selectedNetWorth?.liquidity_ratio != null
          ? `Liquidity ${formatRatio(selectedNetWorth.liquidity_ratio)}`
          : hasSelectedNetWorth
            ? "Cash + liquid assets"
            : netWorthMissingDescription,
    },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((card, index) => (
        <motion.div
          key={card.title}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: index * 0.035 }}
        >
          <Card className="lift">
            <CardHeader>
              <CardDescription>{card.title}</CardDescription>
              <CardTitle className="tabular text-2xl">
                {isLoading ? <Skeleton className="h-7 w-32" /> : card.value}
              </CardTitle>
              <CardDescription>{card.description}</CardDescription>
            </CardHeader>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

function CategoryBreakdownCard({
  title,
  description,
  emptyTitle,
  emptyDescription,
  items,
  isLoading,
}: {
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  items: CategoryChartItem[];
  isLoading: boolean;
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
    >
      <Card className="h-full">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <CategorySkeleton />
          ) : items.length > 0 ? (
            <div className="space-y-5">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={items}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="58%"
                      outerRadius="82%"
                      paddingAngle={2}
                      strokeWidth={2}
                    >
                      {items.map((item, index) => (
                        <Cell
                          key={item.name}
                          fill={chartColours[index % chartColours.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => formatMoney(Number(value))}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={items.slice(0, 8)}
                    layout="vertical"
                    margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
                  >
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      tickFormatter={(value) => formatMoney(Number(value))}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={110}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip
                      formatter={(value) => formatMoney(Number(value))}
                    />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                      {items.slice(0, 8).map((item, index) => (
                        <Cell
                          key={item.name}
                          fill={chartColours[index % chartColours.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-2">
                {items.slice(0, 6).map((item, index) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor:
                            chartColours[index % chartColours.length],
                        }}
                      />
                      <span className="truncate">{item.name}</span>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-medium">{formatMoney(item.value)}</div>
                      <div className="text-xs text-muted-foreground">
                        {Math.round((item.value / total) * 100)}% -{" "}
                        {item.txnCount} txns
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState title={emptyTitle} description={emptyDescription} />
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function CategorySkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="mx-auto size-48 rounded-full" />
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-11/12" />
        <Skeleton className="h-10 w-10/12" />
      </div>
    </div>
  );
}

function EmptyStateCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card className="border-dashed bg-muted/20">
      <CardContent>
        <EmptyState title={title} description={description} />
      </CardContent>
    </Card>
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
    <div className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 p-6 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
