"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/supabase/types";

export const allocationSources = ["balance", "savings"] as const;

export type AllocationSource = (typeof allocationSources)[number];
export type AllocationPool = Tables<"allocation_pools">;
export type AllocationItem = Tables<"allocation_items">;
export type AllocationSummary = Tables<"allocation_summary_view">;
export type AllocationPoolInsert = Omit<
  TablesInsert<"allocation_pools">,
  "user_id" | "created_at" | "updated_at" | "id" | "linked_account_id"
>;
export type AllocationPoolUpdate = Pick<
  TablesUpdate<"allocation_pools">,
  "name" | "source" | "manual_total"
>;
export type AllocationItemInsert = Omit<
  TablesInsert<"allocation_items">,
  "user_id" | "created_at" | "updated_at" | "id"
>;
export type AllocationItemUpdate = Pick<
  TablesUpdate<"allocation_items">,
  "name" | "amount" | "target_amount" | "notes" | "priority_order"
>;

export const allocationPoolsQueryKey = ["allocation-pools"] as const;
export const allocationItemsQueryKey = ["allocation-items"] as const;
export const allocationSummaryQueryKey = ["allocation-summary"] as const;

function invalidateAllocations(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  queryClient.invalidateQueries({ queryKey: allocationPoolsQueryKey });
  queryClient.invalidateQueries({ queryKey: allocationItemsQueryKey });
  queryClient.invalidateQueries({ queryKey: allocationSummaryQueryKey });
}

export function formatAllocationSource(source: string) {
  if (source === "balance") return "Balance";
  if (source === "savings") return "Savings";
  return source.charAt(0).toUpperCase() + source.slice(1);
}

export function toAllocationSource(source: string): AllocationSource {
  return allocationSources.includes(source as AllocationSource)
    ? (source as AllocationSource)
    : "balance";
}

export function useAllocationPools() {
  return useQuery({
    queryKey: allocationPoolsQueryKey,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("allocation_pools")
        .select("*")
        .order("source", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useAllocationItems() {
  return useQuery({
    queryKey: allocationItemsQueryKey,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("allocation_items")
        .select("*")
        .order("priority_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useAllocationSummary() {
  return useQuery({
    queryKey: allocationSummaryQueryKey,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("allocation_summary_view")
        .select("*");

      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useCreateAllocationPool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pool: AllocationPoolInsert) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("allocation_pools")
        .insert(pool)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => invalidateAllocations(queryClient),
  });
}

export function useUpdateAllocationPool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      pool,
    }: {
      id: AllocationPool["id"];
      pool: AllocationPoolUpdate;
    }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("allocation_pools")
        .update(pool)
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => invalidateAllocations(queryClient),
  });
}

export function useCreateAllocationItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (item: AllocationItemInsert) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("allocation_items")
        .insert(item)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => invalidateAllocations(queryClient),
  });
}

export function useUpdateAllocationItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      item,
    }: {
      id: AllocationItem["id"];
      item: AllocationItemUpdate;
    }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("allocation_items")
        .update(item)
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => invalidateAllocations(queryClient),
  });
}

export function useDeleteAllocationItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: AllocationItem["id"]) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("allocation_items")
        .delete()
        .eq("id", id);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => invalidateAllocations(queryClient),
  });
}

export function useReorderAllocationItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      first,
      second,
    }: {
      first: Pick<AllocationItem, "id" | "priority_order">;
      second: Pick<AllocationItem, "id" | "priority_order">;
    }) => {
      const supabase = createClient();
      const { error: firstError } = await supabase
        .from("allocation_items")
        .update({ priority_order: second.priority_order })
        .eq("id", first.id);

      if (firstError) throw new Error(firstError.message);

      const { error: secondError } = await supabase
        .from("allocation_items")
        .update({ priority_order: first.priority_order })
        .eq("id", second.id);

      if (secondError) throw new Error(secondError.message);
    },
    onSuccess: () => invalidateAllocations(queryClient),
  });
}
