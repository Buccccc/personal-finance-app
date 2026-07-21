"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { categoriesQueryKey } from "@/lib/hooks/categories";
import { syncAccountNetworth } from "@/lib/hooks/accounts";
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/supabase/types";

export type Transaction = Tables<"transactions">;
export type Merchant = Tables<"merchants">;
export type TransactionSortField = "date" | "amount";
export type TransactionSortDirection = "asc" | "desc";
export type InfiniteTransactionsParams = {
  search?: string;
  accountId?: Transaction["account_id"] | null;
  type?: Transaction["type"] | null;
  categoryId?: NonNullable<Transaction["category_id"]> | null;
  uncategorised?: boolean;
  taxDeductible?: boolean | null;
  dateFrom?: Transaction["date"] | null;
  dateTo?: Transaction["date"] | null;
  sortBy?: TransactionSortField;
  sortDirection?: TransactionSortDirection;
  pageSize?: number;
};
export type TransactionsPage = {
  rows: Transaction[];
  total: number;
  pageIndex: number;
  pageSize: number;
};
export type TransactionInsert = Omit<
  TablesInsert<"transactions">,
  | "user_id"
  | "created_at"
  | "updated_at"
  | "id"
  | "ai_category_id"
  | "ai_confidence"
  | "ai_reason"
  | "basiq_transaction_id"
  | "human_verified"
  | "merchant_id"
  | "transfer_group_id"
>;
export type TransactionUpdate = Pick<
  TablesUpdate<"transactions">,
  | "account_id"
  | "date"
  | "description"
  | "amount"
  | "type"
  | "category_id"
  | "subcategory_id"
  | "tax_deductible"
  | "notes"
>;

export const transactionsQueryKey = ["transactions"] as const;
export const merchantsQueryKey = ["merchants"] as const;
export const defaultTransactionsPageSize = 50;

function normaliseInfiniteTransactionsParams(
  params: InfiniteTransactionsParams = {},
) {
  return {
    search: params.search?.trim() ?? "",
    accountId: params.accountId ?? null,
    type: params.type ?? null,
    categoryId: params.categoryId ?? null,
    uncategorised: params.uncategorised ?? false,
    taxDeductible: params.taxDeductible ?? null,
    dateFrom: params.dateFrom ?? null,
    dateTo: params.dateTo ?? null,
    sortBy: params.sortBy ?? "date",
    sortDirection: params.sortDirection ?? "desc",
    pageSize: params.pageSize ?? defaultTransactionsPageSize,
  };
}

export function useTransactions() {
  return useQuery({
    queryKey: transactionsQueryKey,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useInfiniteTransactions(
  params: InfiniteTransactionsParams = {},
) {
  const queryParams = normaliseInfiniteTransactionsParams(params);

  return useInfiniteQuery({
    queryKey: [...transactionsQueryKey, "infinite", queryParams] as const,
    initialPageParam: { pageIndex: 0, total: null as number | null },
    queryFn: async ({ pageParam }) => {
      const supabase = createClient();
      const from = pageParam.pageIndex * queryParams.pageSize;
      const to = from + queryParams.pageSize - 1;
      const shouldRequestCount = pageParam.pageIndex === 0;

      let query = supabase
        .from("transactions")
        .select("*", shouldRequestCount ? { count: "exact" } : undefined);

      if (queryParams.search) {
        query = query.ilike("description", `%${queryParams.search}%`);
      }

      if (queryParams.accountId) {
        query = query.eq("account_id", queryParams.accountId);
      }

      if (queryParams.type) {
        query = query.eq("type", queryParams.type);
      }

      if (queryParams.uncategorised) {
        query = query.is("category_id", null);
      } else if (queryParams.categoryId) {
        query = query.eq("category_id", queryParams.categoryId);
      }

      if (queryParams.taxDeductible !== null) {
        query = query.eq("tax_deductible", queryParams.taxDeductible);
      }

      if (queryParams.dateFrom) {
        query = query.gte("date", queryParams.dateFrom);
      }

      if (queryParams.dateTo) {
        query = query.lte("date", queryParams.dateTo);
      }

      const { data, error, count } = await query
        .order(queryParams.sortBy, {
          ascending: queryParams.sortDirection === "asc",
        })
        .order("id", { ascending: true })
        .range(from, to);

      if (error) throw new Error(error.message);

      return {
        rows: data ?? [],
        total: pageParam.total ?? count ?? 0,
        pageIndex: pageParam.pageIndex,
        pageSize: queryParams.pageSize,
      };
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((total, page) => total + page.rows.length, 0);

      if (loaded >= lastPage.total) {
        return undefined;
      }

      return {
        pageIndex: lastPage.pageIndex + 1,
        total: lastPage.total,
      };
    },
  });
}

export function useMerchants() {
  return useQuery({
    queryKey: merchantsQueryKey,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("merchants")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (transaction: TransactionInsert) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("transactions")
        .insert(transaction)
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

export function useUpdateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      transaction,
    }: {
      id: Transaction["id"];
      transaction: TransactionUpdate;
    }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("transactions")
        .update(transaction)
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

export function useUpdateTransactionCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      categoryId,
      subcategoryId = null,
    }: {
      id: Transaction["id"];
      categoryId: Transaction["category_id"];
      subcategoryId?: Transaction["subcategory_id"];
    }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("transactions")
        .update({ category_id: categoryId, subcategory_id: subcategoryId })
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transactionsQueryKey });
      queryClient.invalidateQueries({ queryKey: categoriesQueryKey });
    },
  });
}

export function useLinkSplitBill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      expenseId,
      incomeIds,
    }: {
      expenseId: Transaction["id"];
      incomeIds: Transaction["id"][];
    }) => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("link_split_bill", {
        p_expense_id: expenseId,
        p_income_ids: incomeIds,
      });

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });
}

export function useUnlinkSplitBill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (txnIds: Transaction["id"][]) => {
      const supabase = createClient();
      const { error } = await supabase.rpc("unlink_split_bill", {
        p_txn_ids: txnIds,
      });

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });
}

// Reimbursement income that is tagged "Split Bill" but not yet linked to its
// expense — surfaced in Review as a gentle nudge. Scoped to the last 60 days:
// there is a deep backlog of historical Split Bill income that predates
// linking, and a permanently large count would just train banner blindness.
export function useUnlinkedSplitBillCount() {
  return useQuery({
    queryKey: [...transactionsQueryKey, "unlinked-split-bills"] as const,
    queryFn: async () => {
      const supabase = createClient();
      const { data: splitCategories, error: categoriesError } = await supabase
        .from("categories")
        .select("id")
        .eq("name", "Split Bill");

      if (categoriesError) throw new Error(categoriesError.message);

      const categoryIds = (splitCategories ?? []).map((category) => category.id);
      if (categoryIds.length === 0) return 0;

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 60);

      const { count, error } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("type", "income")
        .is("transfer_group_id", null)
        .in("category_id", categoryIds)
        .gte("date", cutoff.toISOString().slice(0, 10));

      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: Transaction["id"]) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", id);

      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await syncAccountNetworth().catch(() => {});
      queryClient.invalidateQueries();
    },
  });
}
