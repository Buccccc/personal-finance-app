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
