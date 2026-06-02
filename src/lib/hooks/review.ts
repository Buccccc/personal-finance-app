"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

export type ReviewTransaction = Tables<"transactions">;

export const reviewQueueQueryKey = ["review", "queue"] as const;

const transactionsQueryKey = ["transactions"] as const;

type ReviewQueueResult = {
  rows: ReviewTransaction[];
  total: number;
};

type CategoriseTransactionInput = {
  id: ReviewTransaction["id"];
  categoryId: NonNullable<ReviewTransaction["category_id"]>;
  subcategoryId?: ReviewTransaction["subcategory_id"];
  taxDeductible?: ReviewTransaction["tax_deductible"];
  // Optionally reclassify the transaction's type (e.g. a "transfer" that's
  // really an expense — splitting a bill with a friend).
  type?: ReviewTransaction["type"];
};

type SetTaxDeductibleInput = {
  id: ReviewTransaction["id"];
  taxDeductible: ReviewTransaction["tax_deductible"];
};

type SkipTransactionInput = {
  id: ReviewTransaction["id"];
};

export function useReviewQueue(limit = 100) {
  return useQuery({
    queryKey: [...reviewQueueQueryKey, limit] as const,
    queryFn: async (): Promise<ReviewQueueResult> => {
      const supabase = createClient();
      const { data, error, count } = await supabase
        .from("transactions")
        .select("*", { count: "exact" })
        .is("category_id", null)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw new Error(error.message);

      return {
        rows: data ?? [],
        total: count ?? data?.length ?? 0,
      };
    },
  });
}

export function useCategoriseTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      categoryId,
      subcategoryId = null,
      taxDeductible,
      type,
    }: CategoriseTransactionInput) => {
      const supabase = createClient();
      const update = {
        category_id: categoryId,
        subcategory_id: subcategoryId,
        human_verified: true,
        ...(type === undefined ? {} : { type }),
        ...(taxDeductible === undefined
          ? {}
          : { tax_deductible: taxDeductible }),
      };
      const { data, error } = await supabase
        .from("transactions")
        .update(update)
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reviewQueueQueryKey });
      queryClient.invalidateQueries({ queryKey: transactionsQueryKey });
    },
  });
}

export function useSkipTransaction() {
  return useMutation({
    mutationFn: async ({ id }: SkipTransactionInput) => id,
  });
}

export function useSetTaxDeductible() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, taxDeductible }: SetTaxDeductibleInput) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("transactions")
        .update({ tax_deductible: taxDeductible })
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transactionsQueryKey });
    },
  });
}
