"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@/lib/supabase/types";

export type NetWorthKind = "asset" | "liability";

export type NetWorthClass = Omit<Tables<"networth_classes">, "kind"> & {
  kind: NetWorthKind;
};

export type ValueEntry = Tables<"value_entries">;
export type NetWorthCurrent = Tables<"networth_current_view">;

export type NetWorthItemWithValues = Tables<"networth_items"> & {
  networthClass: NetWorthClass;
  entries: ValueEntry[];
  latestEntry: ValueEntry | null;
};

const netWorthQueryKeys = {
  current: ["net-worth", "current"] as const,
  classes: ["net-worth", "classes"] as const,
  items: ["net-worth", "items"] as const,
};

function isNetWorthKind(kind: string): kind is NetWorthKind {
  return kind === "asset" || kind === "liability";
}

function normaliseClass(row: Tables<"networth_classes">): NetWorthClass {
  if (!isNetWorthKind(row.kind)) {
    throw new Error(`Unsupported net worth class kind: ${row.kind}`);
  }

  return {
    ...row,
    kind: row.kind,
  };
}

function sortEntriesNewestFirst(entries: ValueEntry[]): ValueEntry[] {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date));
}

async function fetchNetWorthClasses(): Promise<NetWorthClass[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("networth_classes")
    .select("*")
    .order("kind", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;

  return (data ?? []).map(normaliseClass);
}

async function fetchNetWorthItems(): Promise<NetWorthItemWithValues[]> {
  const supabase = createClient();

  const [classesResult, itemsResult] = await Promise.all([
    supabase.from("networth_classes").select("*"),
    supabase
      .from("networth_items")
      .select("*")
      .order("name", { ascending: true }),
  ]);

  if (classesResult.error) throw classesResult.error;
  if (itemsResult.error) throw itemsResult.error;

  const classesById = new Map(
    (classesResult.data ?? []).map((row) => {
      const networthClass = normaliseClass(row);
      return [networthClass.id, networthClass] as const;
    }),
  );

  const items = itemsResult.data ?? [];
  const itemIds = items.map((item) => item.id);

  let entries: ValueEntry[] = [];
  if (itemIds.length > 0) {
    const entriesResult = await supabase
      .from("value_entries")
      .select("*")
      .in("item_id", itemIds)
      .order("date", { ascending: false });

    if (entriesResult.error) throw entriesResult.error;
    entries = entriesResult.data ?? [];
  }

  const entriesByItemId = new Map<string, ValueEntry[]>();
  for (const entry of entries) {
    const currentEntries = entriesByItemId.get(entry.item_id) ?? [];
    currentEntries.push(entry);
    entriesByItemId.set(entry.item_id, currentEntries);
  }

  const itemsWithValues: NetWorthItemWithValues[] = [];

  for (const item of items) {
    const networthClass = classesById.get(item.class_id);
    if (!networthClass) continue;

    const sortedEntries = sortEntriesNewestFirst(
      entriesByItemId.get(item.id) ?? [],
    );

    itemsWithValues.push({
      ...item,
      networthClass,
      entries: sortedEntries,
      latestEntry: sortedEntries[0] ?? null,
    });
  }

  return itemsWithValues;
}

async function fetchNetWorthCurrent(): Promise<NetWorthCurrent | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("networth_current_view")
    .select("*")
    .maybeSingle();

  if (error) throw error;

  return data;
}

export function useNetWorthCurrent() {
  return useQuery({
    queryKey: netWorthQueryKeys.current,
    queryFn: fetchNetWorthCurrent,
  });
}

export function useNetWorthClasses() {
  return useQuery({
    queryKey: netWorthQueryKeys.classes,
    queryFn: fetchNetWorthClasses,
  });
}

export function useNetWorthItems() {
  return useQuery({
    queryKey: netWorthQueryKeys.items,
    queryFn: fetchNetWorthItems,
  });
}

export function useAddNetWorthClass() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      name,
      kind,
      isLiquid,
      isCurrent,
    }: {
      name: string;
      kind: NetWorthKind;
      isLiquid: boolean;
      isCurrent: boolean;
    }) => {
      const supabase = createClient();
      const payload: TablesInsert<"networth_classes"> = {
        name,
        kind,
        is_liquid: isLiquid,
        is_current: isCurrent,
      };

      const { data, error } = await supabase
        .from("networth_classes")
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return normaliseClass(data);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: netWorthQueryKeys.classes }),
        queryClient.invalidateQueries({ queryKey: netWorthQueryKeys.items }),
        queryClient.invalidateQueries({ queryKey: netWorthQueryKeys.current }),
      ]);
    },
  });
}

export function useUpdateNetWorthClass() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      name,
      kind,
      isLiquid,
      isCurrent,
    }: {
      id: string;
      name: string;
      kind: NetWorthKind;
      isLiquid: boolean;
      isCurrent: boolean;
    }) => {
      const supabase = createClient();
      const payload: TablesUpdate<"networth_classes"> = {
        name,
        kind,
        is_liquid: isLiquid,
        is_current: isCurrent,
      };

      const { data, error } = await supabase
        .from("networth_classes")
        .update(payload)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return normaliseClass(data);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: netWorthQueryKeys.classes }),
        queryClient.invalidateQueries({ queryKey: netWorthQueryKeys.items }),
        queryClient.invalidateQueries({ queryKey: netWorthQueryKeys.current }),
      ]);
    },
  });
}

export function useAddNetWorthItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      name,
      classId,
    }: {
      name: string;
      classId: string;
    }) => {
      const supabase = createClient();
      const payload: TablesInsert<"networth_items"> = {
        name,
        class_id: classId,
        active: true,
      };

      const { data, error } = await supabase
        .from("networth_items")
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: netWorthQueryKeys.items });
      await queryClient.invalidateQueries({
        queryKey: netWorthQueryKeys.current,
      });
    },
  });
}

export function useSetItemActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      itemId,
      active,
    }: {
      itemId: string;
      active: boolean;
    }) => {
      const supabase = createClient();
      const payload: TablesUpdate<"networth_items"> = { active };

      const { data, error } = await supabase
        .from("networth_items")
        .update(payload)
        .eq("id", itemId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: netWorthQueryKeys.items }),
        queryClient.invalidateQueries({ queryKey: netWorthQueryKeys.current }),
      ]);
    },
  });
}

export function useUpsertValueEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      itemId,
      date,
      value,
    }: {
      itemId: string;
      date: string;
      value: number;
    }) => {
      const supabase = createClient();
      const payload: TablesInsert<"value_entries"> = {
        item_id: itemId,
        date,
        value,
      };

      const { data, error } = await supabase
        .from("value_entries")
        .upsert(payload, { onConflict: "item_id,date" })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: netWorthQueryKeys.items }),
        queryClient.invalidateQueries({ queryKey: netWorthQueryKeys.current }),
      ]);
    },
  });
}

export function useDeleteValueEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entryId: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("value_entries")
        .delete()
        .eq("id", entryId);

      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: netWorthQueryKeys.items }),
        queryClient.invalidateQueries({ queryKey: netWorthQueryKeys.current }),
      ]);
    },
  });
}
