"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

export type DashboardMonthMode = "month-to-date" | "last-month";
export type CategoryBreakdownType = "expense" | "income";

export type MonthlyCashflow = Tables<"monthly_cashflow_view">;
export type NetWorthCurrent = Tables<"networth_current_view">;
export type NetWorthHistory = Tables<"networth_history_view">;
export type MonthlyCategoryBreakdown =
  Tables<"monthly_category_breakdown_view">;

export type DashboardData = {
  cashflow: MonthlyCashflow | null;
  currentNetWorth: NetWorthCurrent | null;
  monthEndNetWorth: NetWorthHistory | null;
  expensesByCategory: MonthlyCategoryBreakdown[];
  incomeByCategory: MonthlyCategoryBreakdown[];
};

export const dashboardQueryKeys = {
  month: (monthKey: string) => ["dashboard", monthKey] as const,
};

export function getMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}-01`;
}

export function getRelativeMonthKey(offsetInMonths: number): string {
  const today = new Date();
  const targetMonth = new Date(
    today.getFullYear(),
    today.getMonth() + offsetInMonths,
    1,
  );

  return getMonthKey(targetMonth);
}

export function getMonthOffset(monthKey: string): number {
  const [yearPart, monthPart] = monthKey.slice(0, 7).split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);

  if (!Number.isFinite(year) || !Number.isFinite(month)) return 0;

  const today = new Date();

  return (year - today.getFullYear()) * 12 + month - (today.getMonth() + 1);
}

async function fetchCategoryBreakdown(
  monthKey: string,
  type: CategoryBreakdownType,
): Promise<MonthlyCategoryBreakdown[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("monthly_category_breakdown_view")
    .select("*")
    .eq("month", monthKey)
    .eq("type", type)
    .order("total", { ascending: false });

  if (error) throw new Error(error.message);

  return data ?? [];
}

async function fetchDashboardData(monthKey: string): Promise<DashboardData> {
  const supabase = createClient();

  const [
    cashflowResult,
    currentNetWorthResult,
    monthEndNetWorthResult,
    expensesByCategory,
    incomeByCategory,
  ] = await Promise.all([
    supabase
      .from("monthly_cashflow_view")
      .select("*")
      .eq("month", monthKey)
      .maybeSingle(),
    supabase.from("networth_current_view").select("*").maybeSingle(),
    supabase
      .from("networth_history_view")
      .select("*")
      .eq("month", monthKey)
      .maybeSingle(),
    fetchCategoryBreakdown(monthKey, "expense"),
    fetchCategoryBreakdown(monthKey, "income"),
  ]);

  if (cashflowResult.error) throw new Error(cashflowResult.error.message);
  if (currentNetWorthResult.error) {
    throw new Error(currentNetWorthResult.error.message);
  }
  if (monthEndNetWorthResult.error) {
    throw new Error(monthEndNetWorthResult.error.message);
  }

  return {
    cashflow: cashflowResult.data,
    currentNetWorth: currentNetWorthResult.data,
    monthEndNetWorth: monthEndNetWorthResult.data,
    expensesByCategory,
    incomeByCategory,
  };
}

export function useDashboardData(monthKey: string) {
  return useQuery({
    queryKey: dashboardQueryKeys.month(monthKey),
    queryFn: () => fetchDashboardData(monthKey),
  });
}

// ---------------------------------------------------------------------------
// Category drill-down: the individual transactions behind one breakdown row.
//
// `monthly_category_breakdown_view` does two things to split-bill groups, and
// this mirrors both so an expanded row sums to the total shown on the row:
//   - an expense linked to reimbursements reports NET (amount + income_total)
//   - the reimbursement income rows themselves are dropped entirely
// ---------------------------------------------------------------------------

export type CategoryTransaction = {
  id: string;
  date: string;
  description: string | null;
  amount: number;
  grossAmount: number;
  reimbursed: number;
  accountName: string | null;
  originalAmount: number | null;
  originalCurrency: string | null;
};

type CategoryTransactionsKey = {
  monthKey: string;
  type: CategoryBreakdownType;
  categoryId: string | null;
};

export const categoryTransactionsQueryKeys = {
  detail: ({ monthKey, type, categoryId }: CategoryTransactionsKey) =>
    ["dashboard", "category-transactions", monthKey, type, categoryId] as const,
};

/** First and last ISO day of the month a `YYYY-MM-01` key points at. */
export function getMonthBounds(monthKey: string): { from: string; to: string } {
  const ym = monthKey.slice(0, 7);
  const [year, month] = ym.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();

  return { from: `${ym}-01`, to: `${ym}-${String(lastDay).padStart(2, "0")}` };
}

type RawRow = {
  id: string;
  date: string;
  description: string | null;
  amount: number | string;
  type: string;
  transfer_group_id: string | null;
  original_amount: number | string | null;
  original_currency: string | null;
  accounts: { name: string } | { name: string }[] | null;
};

function accountName(accounts: RawRow["accounts"]): string | null {
  if (!accounts) return null;
  return Array.isArray(accounts) ? (accounts[0]?.name ?? null) : accounts.name;
}

function toNumber(value: number | string | null): number {
  if (value === null) return 0;
  return typeof value === "string" ? Number(value) : value;
}

async function fetchCategoryTransactions({
  monthKey,
  type,
  categoryId,
}: CategoryTransactionsKey): Promise<CategoryTransaction[]> {
  const supabase = createClient();
  const { from, to } = getMonthBounds(monthKey);

  let query = supabase
    .from("transactions")
    .select(
      "id, date, description, amount, type, transfer_group_id, original_amount, original_currency, accounts(name)",
    )
    .eq("type", type)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: false });

  query = categoryId
    ? query.eq("category_id", categoryId)
    : query.is("category_id", null);

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as RawRow[];
  const groupIds = [
    ...new Set(rows.map((r) => r.transfer_group_id).filter(Boolean)),
  ] as string[];

  // Reimbursement maths needs every leg of the group, not just the legs that
  // happen to sit in this category and month.
  const splitTotals = new Map<string, number>();

  if (groupIds.length > 0) {
    const { data: legs, error: legsError } = await supabase
      .from("transactions")
      .select("transfer_group_id, type, amount")
      .in("transfer_group_id", groupIds)
      .neq("type", "transfer");

    if (legsError) throw new Error(legsError.message);

    const tally = new Map<
      string,
      { income: number; expenseCount: number; incomeCount: number }
    >();

    for (const leg of legs ?? []) {
      const key = leg.transfer_group_id;
      if (!key) continue;

      const entry = tally.get(key) ?? {
        income: 0,
        expenseCount: 0,
        incomeCount: 0,
      };

      if (leg.type === "income") {
        entry.income += toNumber(leg.amount);
        entry.incomeCount += 1;
      } else if (leg.type === "expense") {
        entry.expenseCount += 1;
      }

      tally.set(key, entry);
    }

    // Same HAVING clause as the view: a group only nets when it has both legs.
    for (const [key, entry] of tally) {
      if (entry.expenseCount >= 1 && entry.incomeCount >= 1) {
        splitTotals.set(key, entry.income);
      }
    }
  }

  return rows
    .filter(
      // The view drops reimbursement income; it is not money Elias earned.
      (row) =>
        !(
          row.type === "income" &&
          row.transfer_group_id !== null &&
          splitTotals.has(row.transfer_group_id)
        ),
    )
    .map((row) => {
      const gross = toNumber(row.amount);
      const reimbursed =
        row.type === "expense" && row.transfer_group_id
          ? (splitTotals.get(row.transfer_group_id) ?? 0)
          : 0;

      return {
        id: row.id,
        date: row.date,
        description: row.description,
        amount: gross + reimbursed,
        grossAmount: gross,
        reimbursed,
        accountName: accountName(row.accounts),
        originalAmount:
          row.original_amount === null ? null : toNumber(row.original_amount),
        originalCurrency: row.original_currency,
      };
    });
}

export function useCategoryTransactions(
  key: CategoryTransactionsKey,
  enabled: boolean,
) {
  return useQuery({
    queryKey: categoryTransactionsQueryKeys.detail(key),
    queryFn: () => fetchCategoryTransactions(key),
    enabled,
  });
}
