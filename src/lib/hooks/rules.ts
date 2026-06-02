"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  merchantsAdminQueryKey,
  merchantAliasesQueryKey,
  type Merchant,
  type MerchantAlias,
} from "@/lib/hooks/merchants-admin";
import { transactionsQueryKey } from "@/lib/hooks/transactions";
import { createClient } from "@/lib/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/supabase/types";

export const ruleMatchTypes = [
  "merchant",
  "description_contains",
  "amount",
  "combo",
] as const;
export const runRuleScopes = ["uncategorised", "all"] as const;

export type RuleMatchType = (typeof ruleMatchTypes)[number];
export type RunRuleScope = (typeof runRuleScopes)[number];
export type CategorisationRule = Tables<"categorisation_rules">;
export type TransactionForRules = Pick<
  Tables<"transactions">,
  | "id"
  | "description"
  | "amount"
  | "merchant_id"
  | "category_id"
  | "subcategory_id"
  | "tax_deductible"
>;
export type RuleInsert = Omit<
  TablesInsert<"categorisation_rules">,
  "user_id" | "created_at" | "updated_at" | "id"
>;
export type RuleUpdate = Pick<
  TablesUpdate<"categorisation_rules">,
  | "match_type"
  | "pattern"
  | "amount_min"
  | "amount_max"
  | "merchant_id"
  | "category_id"
  | "subcategory_id"
  | "set_tax_deductible"
  | "priority"
  | "active"
>;
type TransactionRuleUpdate = Pick<
  TablesUpdate<"transactions">,
  "merchant_id" | "category_id" | "subcategory_id" | "tax_deductible"
>;
type PendingTransactionUpdate = {
  id: TransactionForRules["id"];
  update: TransactionRuleUpdate;
  categoryChanged: boolean;
  merchantChanged: boolean;
};
export type RunRulesSummary = {
  total: number;
  categorised: number;
  merchantSet: number;
};

export const rulesQueryKey = ["categorisation-rules"] as const;

export function useCategorisationRules() {
  return useQuery({
    queryKey: rulesQueryKey,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("categorisation_rules")
        .select("*")
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useCreateCategorisationRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rule: RuleInsert) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("categorisation_rules")
        .insert(rule)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rulesQueryKey });
    },
  });
}

export function useUpdateCategorisationRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      rule,
    }: {
      id: CategorisationRule["id"];
      rule: RuleUpdate;
    }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("categorisation_rules")
        .update(rule)
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rulesQueryKey });
    },
  });
}

export function useDeleteCategorisationRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: CategorisationRule["id"]) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("categorisation_rules")
        .delete()
        .eq("id", id);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rulesQueryKey });
    },
  });
}

export function useRunCategorisationRules() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: runCategorisationRules,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transactionsQueryKey });
      queryClient.invalidateQueries({ queryKey: ["review"] });
      queryClient.invalidateQueries({ queryKey: merchantsAdminQueryKey });
      queryClient.invalidateQueries({ queryKey: merchantAliasesQueryKey });
    },
  });
}

async function runCategorisationRules(
  scope: RunRuleScope,
): Promise<RunRulesSummary> {
  const supabase = createClient();
  const [{ data: rules, error: rulesError }, transactions, aliasesResult] =
    await Promise.all([
      supabase
        .from("categorisation_rules")
        .select("*")
        .eq("active", true)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true }),
      fetchTargetTransactions(scope),
      fetchMerchantAliasesWithMerchants(),
    ]);

  if (rulesError) throw new Error(rulesError.message);

  const activeRules = rules ?? [];
  const merchantById = new Map(
    aliasesResult.merchants.map((merchant) => [merchant.id, merchant]),
  );
  const updates = transactions
    .map((transaction) =>
      buildTransactionUpdate(
        transaction,
        activeRules,
        aliasesResult.aliases,
        merchantById,
      ),
    )
    .filter((update): update is PendingTransactionUpdate => update !== null);

  await writeTransactionUpdates(updates);

  return {
    total: transactions.length,
    categorised: updates.filter((update) => update.categoryChanged).length,
    merchantSet: updates.filter((update) => update.merchantChanged).length,
  };
}

async function fetchTargetTransactions(scope: RunRuleScope) {
  const supabase = createClient();
  const pageSize = 1000;
  const transactions: TransactionForRules[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const baseQuery = supabase
      .from("transactions")
      .select(
        "id,description,amount,merchant_id,category_id,subcategory_id,tax_deductible",
      )
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });
    const query =
      scope === "uncategorised" ? baseQuery.is("category_id", null) : baseQuery;
    const { data, error } = await query.range(from, to);

    if (error) throw new Error(error.message);
    transactions.push(...(data ?? []));

    if (!data || data.length < pageSize) break;
  }

  return transactions;
}

async function fetchMerchantAliasesWithMerchants() {
  const supabase = createClient();
  const [
    { data: aliases, error: aliasesError },
    { data: merchants, error: merchantsError },
  ] = await Promise.all([
    supabase.from("merchant_aliases").select("*").order("pattern"),
    supabase.from("merchants").select("*").order("name"),
  ]);

  if (aliasesError) throw new Error(aliasesError.message);
  if (merchantsError) throw new Error(merchantsError.message);

  return {
    aliases: aliases ?? [],
    merchants: merchants ?? [],
  };
}

function buildTransactionUpdate(
  transaction: TransactionForRules,
  rules: CategorisationRule[],
  aliases: MerchantAlias[],
  merchantById: Map<Merchant["id"], Merchant>,
): PendingTransactionUpdate | null {
  const matchingRule = rules.find((rule) => ruleMatchesTransaction(rule, transaction));

  if (matchingRule) {
    return createPendingUpdate(transaction, {
      category_id: matchingRule.category_id,
      subcategory_id: matchingRule.subcategory_id,
      tax_deductible: matchingRule.set_tax_deductible ?? undefined,
    });
  }

  const normalisedDescription = normaliseText(transaction.description);
  if (!normalisedDescription) return null;

  const matchingAlias = aliases.find((alias) => {
    const pattern = normaliseText(alias.pattern);
    return pattern.length > 0 && normalisedDescription.includes(pattern);
  });
  if (!matchingAlias) return null;

  const merchant = merchantById.get(matchingAlias.merchant_id);
  return createPendingUpdate(transaction, {
    merchant_id: matchingAlias.merchant_id,
    category_id:
      merchant?.default_category_id && !transaction.category_id
        ? merchant.default_category_id
        : undefined,
  });
}

function ruleMatchesTransaction(
  rule: CategorisationRule,
  transaction: TransactionForRules,
) {
  const matchType = rule.match_type as RuleMatchType;

  if (matchType === "merchant") {
    return Boolean(rule.merchant_id && transaction.merchant_id === rule.merchant_id);
  }

  if (matchType === "description_contains") {
    return descriptionContainsPattern(transaction.description, rule.pattern);
  }

  if (matchType === "amount") {
    return amountInRange(transaction.amount, rule.amount_min, rule.amount_max);
  }

  if (matchType === "combo") {
    const merchantMatches = rule.merchant_id
      ? transaction.merchant_id === rule.merchant_id
      : true;
    return (
      merchantMatches &&
      descriptionContainsPattern(transaction.description, rule.pattern) &&
      amountInRange(transaction.amount, rule.amount_min, rule.amount_max)
    );
  }

  return false;
}

function descriptionContainsPattern(
  description: string | null,
  pattern: string | null,
) {
  const normalisedDescription = normaliseText(description);
  const normalisedPattern = normaliseText(pattern);
  return (
    normalisedDescription.length > 0 &&
    normalisedPattern.length > 0 &&
    normalisedDescription.includes(normalisedPattern)
  );
}

function amountInRange(
  amount: number,
  amountMin: number | null,
  amountMax: number | null,
) {
  const aboveMinimum = amountMin === null || amount >= amountMin;
  const belowMaximum = amountMax === null || amount <= amountMax;
  return aboveMinimum && belowMaximum;
}

function normaliseText(value: string | null) {
  return (value ?? "").trim().toLocaleLowerCase();
}

function createPendingUpdate(
  transaction: TransactionForRules,
  nextValues: TransactionRuleUpdate,
): PendingTransactionUpdate | null {
  const update: TransactionRuleUpdate = {};

  if (
    nextValues.merchant_id !== undefined &&
    nextValues.merchant_id !== transaction.merchant_id
  ) {
    update.merchant_id = nextValues.merchant_id;
  }

  if (
    nextValues.category_id !== undefined &&
    nextValues.category_id !== transaction.category_id
  ) {
    update.category_id = nextValues.category_id;
  }

  if (
    nextValues.subcategory_id !== undefined &&
    nextValues.subcategory_id !== transaction.subcategory_id
  ) {
    update.subcategory_id = nextValues.subcategory_id;
  }

  if (
    nextValues.tax_deductible !== undefined &&
    nextValues.tax_deductible !== transaction.tax_deductible
  ) {
    update.tax_deductible = nextValues.tax_deductible;
  }

  if (Object.keys(update).length === 0) return null;

  return {
    id: transaction.id,
    update,
    categoryChanged: update.category_id !== undefined && update.category_id !== null,
    merchantChanged: update.merchant_id !== undefined,
  };
}

async function writeTransactionUpdates(updates: PendingTransactionUpdate[]) {
  const supabase = createClient();
  const chunkSize = 25;

  for (let index = 0; index < updates.length; index += chunkSize) {
    const chunk = updates.slice(index, index + chunkSize);
    await Promise.all(
      chunk.map(async ({ id, update }) => {
        const { error } = await supabase
          .from("transactions")
          .update(update)
          .eq("id", id);

        if (error) throw new Error(error.message);
      }),
    );
  }
}
