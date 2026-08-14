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
  | "name"
  | "type"
  | "institution"
  | "currency"
  | "balance"
  | "opening_balance"
  | "credit_limit"
>;

/** One row of per-account health: invariant, bank drift, and flags. */
export type AccountReconciliation = Tables<"account_reconciliation_view">;

export const accountsQueryKey = ["accounts"] as const;
export const accountTxnTotalsQueryKey = ["account-txn-totals"] as const;
export const accountReconciliationQueryKey = ["account-reconciliation"] as const;

/**
 * Flag copy. `errors` are states that should not be possible and point at a
 * real problem; `notices` are hygiene. Both come from
 * account_reconciliation_view so the rules live in one place (the DB) rather
 * than being re-implemented per client.
 */
export const reconciliationFlagCopy: Record<string, string> = {
  invariant_broken:
    "Stored balance disagrees with opening balance plus transactions. Something wrote around the triggers.",
  negative_asset:
    "An asset account cannot hold less than nothing. The balance or the history is wrong.",
  over_limit: "Owing more than the credit limit.",
  reconcile_drift:
    "The ledger disagrees with the balance the bank actually showed. Transactions are missing or duplicated.",
  credit_card_in_credit: "Card is in credit rather than owing.",
  never_reconciled: "Never checked against the real bank balance.",
  txns_since_reconcile: "New transactions since the last check.",
  stale_reconcile: "Last checked against the bank over 90 days ago.",
};

export function useAccountReconciliation() {
  return useQuery({
    queryKey: accountReconciliationQueryKey,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("account_reconciliation_view")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw new Error(error.message);
      const map = new Map<string, AccountReconciliation>();
      for (const row of data ?? []) {
        if (row.account_id) map.set(row.account_id, row);
      }
      return map;
    },
  });
}

/**
 * Record what the bank actually showed on a given date. Nothing here touches
 * `balance` — the point is to compare against it, not overwrite it.
 */
export function useReconcileAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      balance,
      date,
    }: {
      id: Account["id"];
      balance: number | null;
      date: string | null;
    }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("accounts")
        .update({ reconciled_balance: balance, reconciled_at: date })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

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
