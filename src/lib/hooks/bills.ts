"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/supabase/types";

export const recurringDirections = ["in", "out"] as const;
export const recurringFrequencies = [
  "weekly",
  "fortnightly",
  "monthly",
  "quarterly",
  "yearly",
] as const;

export type RecurringDirection = (typeof recurringDirections)[number];
export type RecurringFrequency = (typeof recurringFrequencies)[number];

export type RecurringItem = Omit<
  Tables<"recurring_items">,
  "direction" | "frequency"
> & {
  direction: RecurringDirection;
  frequency: RecurringFrequency;
};

export type RecurringItemInsert = Omit<
  TablesInsert<"recurring_items">,
  "id" | "created_at" | "updated_at" | "user_id"
> & {
  direction: RecurringDirection;
  frequency: RecurringFrequency;
};

export type RecurringItemUpdate = Pick<
  TablesUpdate<"recurring_items">,
  | "name"
  | "amount"
  | "direction"
  | "frequency"
  | "next_due_date"
  | "account_id"
  | "category_id"
  | "active"
> & {
  direction?: RecurringDirection;
  frequency?: RecurringFrequency;
};

export type BillAccount = Pick<Tables<"accounts">, "id" | "name">;
export type BillCategory = Pick<Tables<"categories">, "id" | "name">;

export const billsQueryKeys = {
  recurringItems: ["bills", "recurring-items"] as const,
  accounts: ["bills", "accounts"] as const,
  categories: ["bills", "categories"] as const,
};

function isRecurringDirection(value: string): value is RecurringDirection {
  return recurringDirections.includes(value as RecurringDirection);
}

function isRecurringFrequency(value: string): value is RecurringFrequency {
  return recurringFrequencies.includes(value as RecurringFrequency);
}

function normaliseRecurringItem(row: Tables<"recurring_items">): RecurringItem {
  if (!isRecurringDirection(row.direction)) {
    throw new Error(`Unsupported recurring direction: ${row.direction}`);
  }

  if (!isRecurringFrequency(row.frequency)) {
    throw new Error(`Unsupported recurring frequency: ${row.frequency}`);
  }

  return {
    ...row,
    direction: row.direction,
    frequency: row.frequency,
  };
}

export function formatRecurringFrequency(frequency: RecurringFrequency): string {
  return frequency
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function useRecurringItems() {
  return useQuery({
    queryKey: billsQueryKeys.recurringItems,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("recurring_items")
        .select("*")
        .order("next_due_date", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw new Error(error.message);
      return (data ?? []).map(normaliseRecurringItem);
    },
  });
}

export function useBillAccounts() {
  return useQuery({
    queryKey: billsQueryKeys.accounts,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("accounts")
        .select("id, name")
        .order("name", { ascending: true });

      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useBillCategories() {
  return useQuery({
    queryKey: billsQueryKeys.categories,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .order("name", { ascending: true });

      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useCreateRecurringItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (item: RecurringItemInsert) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("recurring_items")
        .insert(item)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return normaliseRecurringItem(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billsQueryKeys.recurringItems });
    },
  });
}

export function useUpdateRecurringItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      item,
    }: {
      id: RecurringItem["id"];
      item: RecurringItemUpdate;
    }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("recurring_items")
        .update(item)
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return normaliseRecurringItem(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billsQueryKeys.recurringItems });
    },
  });
}

export function useDeleteRecurringItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: RecurringItem["id"]) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("recurring_items")
        .delete()
        .eq("id", id);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billsQueryKeys.recurringItems });
    },
  });
}
