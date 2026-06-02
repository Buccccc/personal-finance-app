"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

export type MonthlyCashflow = Tables<"monthly_cashflow_view">;
export type MonthlyNetWorth = Tables<"networth_history_view">;

export const trendsQueryKeys = {
  cashflow: ["trends", "monthly-cashflow"] as const,
  netWorth: ["trends", "monthly-net-worth"] as const,
};

async function fetchMonthlyCashflow(): Promise<MonthlyCashflow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("monthly_cashflow_view")
    .select("*")
    .order("month", { ascending: true });

  if (error) throw new Error(error.message);

  return data ?? [];
}

async function fetchMonthlyNetWorth(): Promise<MonthlyNetWorth[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("networth_history_view")
    .select("*")
    .order("month", { ascending: true });

  if (error) throw new Error(error.message);

  return data ?? [];
}

export function useMonthlyCashflow() {
  return useQuery({
    queryKey: trendsQueryKeys.cashflow,
    queryFn: fetchMonthlyCashflow,
  });
}

export function useMonthlyNetWorth() {
  return useQuery({
    queryKey: trendsQueryKeys.netWorth,
    queryFn: fetchMonthlyNetWorth,
  });
}
