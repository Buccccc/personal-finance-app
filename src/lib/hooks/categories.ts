"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/supabase/types";

export const transactionTypes = ["expense", "income", "transfer"] as const;

export type TransactionType = (typeof transactionTypes)[number];
export type Category = Tables<"categories">;
export type CategoryInsert = Omit<
  TablesInsert<"categories">,
  "user_id" | "created_at" | "updated_at" | "id"
> & {
  kind: TransactionType;
};
export type CategoryUpdate = Omit<
  Pick<TablesUpdate<"categories">, "name" | "kind">,
  "kind"
> & {
  kind?: TransactionType;
};

export const categoriesQueryKey = ["categories"] as const;
const transactionsQueryKey = ["transactions"] as const;

export function useCategories() {
  return useQuery({
    queryKey: categoriesQueryKey,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (category: CategoryInsert) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("categories")
        .insert(category)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoriesQueryKey });
      queryClient.invalidateQueries({ queryKey: transactionsQueryKey });
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      category,
    }: {
      id: Category["id"];
      category: CategoryUpdate;
    }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("categories")
        .update(category)
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoriesQueryKey });
      queryClient.invalidateQueries({ queryKey: transactionsQueryKey });
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: Category["id"]) => {
      const supabase = createClient();
      const { error } = await supabase.from("categories").delete().eq("id", id);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoriesQueryKey });
      queryClient.invalidateQueries({ queryKey: transactionsQueryKey });
    },
  });
}
