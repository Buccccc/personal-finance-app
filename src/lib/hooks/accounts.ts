"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/supabase/types";

export const accountTypes = [
  "everyday",
  "savings",
  "credit_card",
  "cash",
  "ecash",
] as const;

export type AccountType = (typeof accountTypes)[number];
export type Account = Tables<"accounts">;
export type AccountInsert = Omit<
  TablesInsert<"accounts">,
  "user_id" | "created_at" | "updated_at" | "id" | "basiq_account_id"
>;
export type AccountUpdate = Pick<
  TablesUpdate<"accounts">,
  "name" | "type" | "institution" | "currency" | "balance" | "credit_limit"
>;

export const accountsQueryKey = ["accounts"] as const;
export const accountTxnTotalsQueryKey = ["account-txn-totals"] as const;

/** Recompute today's E-Cash / Savings / credit-card-debt net worth from balances. */
export async function syncAccountNetworth() {
  const supabase = createClient();
  const { error } = await supabase.rpc("sync_account_networth");
  if (error) throw new Error(error.message);
}

/** Net transaction total per account id (credit-card owed = -total). */
export function useAccountTxnTotals() {
  return useQuery({
    queryKey: accountTxnTotalsQueryKey,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("account_txn_totals_view")
        .select("account_id, txn_total");
      if (error) throw new Error(error.message);
      const map = new Map<string, number>();
      for (const row of data ?? []) {
        if (row.account_id) map.set(row.account_id, Number(row.txn_total ?? 0));
      }
      return map;
    },
  });
}

export function useSyncAccountNetworth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: syncAccountNetworth,
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export function formatAccountType(type: string) {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function useAccounts() {
  return useQuery({
    queryKey: accountsQueryKey,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (account: AccountInsert) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("accounts")
        .insert(account)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: async () => {
      await syncAccountNetworth().catch(() => {});
      queryClient.invalidateQueries();
    },
  });
}

export function useUpdateAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      account,
    }: {
      id: Account["id"];
      account: AccountUpdate;
    }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("accounts")
        .update(account)
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: async () => {
      await syncAccountNetworth().catch(() => {});
      queryClient.invalidateQueries();
    },
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: Account["id"]) => {
      const supabase = createClient();
      const { error } = await supabase.from("accounts").delete().eq("id", id);

      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await syncAccountNetworth().catch(() => {});
      queryClient.invalidateQueries();
    },
  });
}
