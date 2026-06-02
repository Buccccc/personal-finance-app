"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/supabase/types";

export type Merchant = Tables<"merchants">;
export type MerchantAlias = Tables<"merchant_aliases">;
export type MerchantInsert = Omit<
  TablesInsert<"merchants">,
  "user_id" | "created_at" | "updated_at" | "id"
>;
export type MerchantUpdate = Pick<
  TablesUpdate<"merchants">,
  "name" | "default_category_id"
>;
export type MerchantAliasInsert = Omit<
  TablesInsert<"merchant_aliases">,
  "user_id" | "created_at" | "id"
>;

export const merchantsAdminQueryKey = ["merchants", "admin"] as const;
export const merchantAliasesQueryKey = ["merchant-aliases"] as const;

export function useAdminMerchants() {
  return useQuery({
    queryKey: merchantsAdminQueryKey,
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

export function useMerchantAliases() {
  return useQuery({
    queryKey: merchantAliasesQueryKey,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("merchant_aliases")
        .select("*")
        .order("pattern", { ascending: true });

      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

function invalidateMerchants(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: merchantsAdminQueryKey });
  queryClient.invalidateQueries({ queryKey: ["merchants"] });
}

export function useCreateMerchant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (merchant: MerchantInsert) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("merchants")
        .insert(merchant)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      invalidateMerchants(queryClient);
    },
  });
}

export function useUpdateMerchant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      merchant,
    }: {
      id: Merchant["id"];
      merchant: MerchantUpdate;
    }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("merchants")
        .update(merchant)
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      invalidateMerchants(queryClient);
    },
  });
}

export function useDeleteMerchant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: Merchant["id"]) => {
      const supabase = createClient();
      const { error } = await supabase.from("merchants").delete().eq("id", id);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidateMerchants(queryClient);
      queryClient.invalidateQueries({ queryKey: merchantAliasesQueryKey });
    },
  });
}

export function useCreateMerchantAlias() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (alias: MerchantAliasInsert) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("merchant_aliases")
        .insert(alias)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: merchantAliasesQueryKey });
    },
  });
}

export function useDeleteMerchantAlias() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: MerchantAlias["id"]) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("merchant_aliases")
        .delete()
        .eq("id", id);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: merchantAliasesQueryKey });
    },
  });
}
