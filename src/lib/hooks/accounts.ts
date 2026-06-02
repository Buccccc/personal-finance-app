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
  "name" | "type" | "institution" | "currency"
>;

export const accountsQueryKey = ["accounts"] as const;

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountsQueryKey });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountsQueryKey });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountsQueryKey });
    },
  });
}
