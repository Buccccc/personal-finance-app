"use client";

import { useMemo, useState, type FormEvent } from "react";
import { motion } from "motion/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Edit2Icon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/app-shell/page-header";
import {
  allocationSources,
  formatAllocationSource,
  toAllocationSource,
  useAllocationItems,
  useAllocationPools,
  useAllocationSummary,
  useCreateAllocationItem,
  useCreateAllocationPool,
  useDeleteAllocationItem,
  useReorderAllocationItems,
  useUpdateAllocationItem,
  useUpdateAllocationPool,
  type AllocationItem,
  type AllocationPool,
  type AllocationSource,
  type AllocationSummary,
} from "@/lib/hooks/allocations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type PoolFormState = {
  name: string;
  source: AllocationSource;
};

type ItemFormState = {
  name: string;
  amount: string;
  targetAmount: string;
  notes: string;
};

const emptyPoolForm: PoolFormState = {
  name: "",
  source: "balance",
};

const emptyItemForm: ItemFormState = {
  name: "",
  amount: "",
  targetAmount: "",
  notes: "",
};

function itemToForm(item: AllocationItem): ItemFormState {
  return {
    name: item.name,
    amount: String(item.amount),
    targetAmount: item.target_amount === null ? "" : String(item.target_amount),
    notes: item.notes ?? "",
  };
}

function parseMoneyInput(value: string) {
  if (!value.trim()) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function summaryByPoolId(summaries: AllocationSummary[]) {
  return new Map(
    summaries
      .filter((summary) => summary.pool_id !== null)
      .map((summary) => [summary.pool_id as string, summary]),
  );
}

function itemsByPoolId(items: AllocationItem[]) {
  return items.reduce<Map<string, AllocationItem[]>>((map, item) => {
    const existing = map.get(item.pool_id) ?? [];
    existing.push(item);
    map.set(item.pool_id, existing);
    return map;
  }, new Map());
}

function nextPriorityOrder(items: AllocationItem[]) {
  const highest = items.reduce(
    (max, item) => Math.max(max, item.priority_order),
    0,
  );
  return highest + 1;
}

export function AllocationsManager() {
  const pools = useAllocationPools();
  const items = useAllocationItems();
  const summaries = useAllocationSummary();
  const createPool = useCreateAllocationPool();
  const updatePool = useUpdateAllocationPool();
  const createItem = useCreateAllocationItem();
  const updateItem = useUpdateAllocationItem();
  const deleteItem = useDeleteAllocationItem();
  const reorderItems = useReorderAllocationItems();
  const [isPoolDialogOpen, setIsPoolDialogOpen] = useState(false);
  const [itemDialogPool, setItemDialogPool] = useState<AllocationPool | null>(
    null,
  );
  const [editingItem, setEditingItem] = useState<AllocationItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<AllocationItem | null>(null);

  const groupedItems = useMemo(
    () => itemsByPoolId(items.data ?? []),
    [items.data],
  );
  const summaryMap = useMemo(
    () => summaryByPoolId(summaries.data ?? []),
    [summaries.data],
  );
  const isLoading = pools.isLoading || items.isLoading || summaries.isLoading;

  const openCreateItemDialog = (pool: AllocationPool) => {
    setEditingItem(null);
    setItemDialogPool(pool);
  };

  const openEditItemDialog = (pool: AllocationPool, item: AllocationItem) => {
    setEditingItem(item);
    setItemDialogPool(pool);
  };

  const handleDeleteItem = async () => {
    if (!deletingItem) return;

    try {
      await deleteItem.mutateAsync(deletingItem.id);
      toast.success("Allocation item deleted");
      setDeletingItem(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete allocation item",
      );
    }
  };

  const handleMoveItem = async (
    currentItem: AllocationItem,
    targetItem: AllocationItem,
  ) => {
    try {
      await reorderItems.mutateAsync({ first: currentItem, second: targetItem });
      toast.success("Priority updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reorder item");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Allocations"
        description="Plan virtual envelopes for your balance and savings without changing accounts or transactions."
      >
        <Button onClick={() => setIsPoolDialogOpen(true)}>
          <PlusIcon />
          Add pool
        </Button>
      </PageHeader>

      {isLoading ? (
        <AllocationsSkeleton />
      ) : pools.data && pools.data.length > 0 ? (
        <div className="space-y-4">
          {pools.data.map((pool) => {
            const poolItems = groupedItems.get(pool.id) ?? [];
            const fallbackAllocated = poolItems.reduce(
              (sum, item) => sum + item.amount,
              0,
            );
            const allocated =
              summaryMap.get(pool.id)?.allocated ?? fallbackAllocated;

            return (
              <AllocationPoolCard
                key={pool.id}
                pool={pool}
                items={poolItems}
                allocated={allocated}
                onUpdatePoolTotal={async (manualTotal) => {
                  await updatePool.mutateAsync({
                    id: pool.id,
                    pool: {
                      name: pool.name,
                      source: pool.source,
                      manual_total: manualTotal,
                    },
                  });
                }}
                onAddItem={() => openCreateItemDialog(pool)}
                onEditItem={(item) => openEditItemDialog(pool, item)}
                onDeleteItem={setDeletingItem}
                onMoveItem={handleMoveItem}
                isSavingTotal={updatePool.isPending}
                isReordering={reorderItems.isPending}
              />
            );
          })}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>Create your first allocation pool</CardTitle>
            <CardDescription>
              A pool is a virtual total that you split into smaller envelopes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setIsPoolDialogOpen(true)}>
              <PlusIcon />
              Add pool
            </Button>
          </CardContent>
        </Card>
      )}

      {(pools.isError || items.isError || summaries.isError) && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent>
            <p className="text-sm text-destructive">
              Could not load allocations. Please try refreshing the page.
            </p>
          </CardContent>
        </Card>
      )}

      <PoolFormDialog
        open={isPoolDialogOpen}
        onOpenChange={setIsPoolDialogOpen}
        onSubmit={async (form) => {
          const name = form.name.trim();
          if (!name) {
            toast.error("Pool name is required");
            return;
          }

          try {
            await createPool.mutateAsync({
              name,
              source: form.source,
              manual_total: 0,
            });
            toast.success("Allocation pool created");
            setIsPoolDialogOpen(false);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not save pool");
          }
        }}
        isSaving={createPool.isPending}
      />

      <ItemFormDialog
        pool={itemDialogPool}
        item={editingItem}
        open={Boolean(itemDialogPool)}
        onOpenChange={(open) => {
          if (!open) {
            setItemDialogPool(null);
            setEditingItem(null);
          }
        }}
        onSubmit={async (form) => {
          if (!itemDialogPool) return;

          const name = form.name.trim();
          const amount = parseMoneyInput(form.amount);
          const targetAmount = form.targetAmount.trim()
            ? parseMoneyInput(form.targetAmount)
            : null;

          if (!name) {
            toast.error("Item name is required");
            return;
          }
          if (amount === null || amount < 0) {
            toast.error("Amount must be zero or more");
            return;
          }
          if (targetAmount !== null && targetAmount < 0) {
            toast.error("Target amount must be zero or more");
            return;
          }

          const poolItems = groupedItems.get(itemDialogPool.id) ?? [];
          const itemPayload = {
            name,
            amount,
            target_amount: targetAmount,
            notes: form.notes.trim() || null,
            priority_order:
              editingItem?.priority_order ?? nextPriorityOrder(poolItems),
          };

          try {
            if (editingItem) {
              await updateItem.mutateAsync({
                id: editingItem.id,
                item: itemPayload,
              });
              toast.success("Allocation item updated");
            } else {
              await createItem.mutateAsync({
                ...itemPayload,
                pool_id: itemDialogPool.id,
              });
              toast.success("Allocation item added");
            }
            setItemDialogPool(null);
            setEditingItem(null);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not save item");
          }
        }}
        isSaving={createItem.isPending || updateItem.isPending}
      />

      <DeleteItemDialog
        item={deletingItem}
        open={Boolean(deletingItem)}
        onOpenChange={(open) => {
          if (!open) setDeletingItem(null);
        }}
        onConfirm={handleDeleteItem}
        isDeleting={deleteItem.isPending}
      />
    </div>
  );
}

function AllocationPoolCard({
  pool,
  items,
  allocated,
  onUpdatePoolTotal,
  onAddItem,
  onEditItem,
  onDeleteItem,
  onMoveItem,
  isSavingTotal,
  isReordering,
}: {
  pool: AllocationPool;
  items: AllocationItem[];
  allocated: number;
  onUpdatePoolTotal: (manualTotal: number) => Promise<void>;
  onAddItem: () => void;
  onEditItem: (item: AllocationItem) => void;
  onDeleteItem: (item: AllocationItem) => void;
  onMoveItem: (
    currentItem: AllocationItem,
    targetItem: AllocationItem,
  ) => Promise<void>;
  isSavingTotal: boolean;
  isReordering: boolean;
}) {
  const [manualTotal, setManualTotal] = useState(String(pool.manual_total));
  const [lastPoolId, setLastPoolId] = useState(pool.id);
  const [lastPoolTotal, setLastPoolTotal] = useState(pool.manual_total);
  const total = Number(pool.manual_total);
  const unallocated = total - allocated;
  const progress = total > 0 ? Math.min((allocated / total) * 100, 100) : 0;

  if (pool.id !== lastPoolId || pool.manual_total !== lastPoolTotal) {
    setLastPoolId(pool.id);
    setLastPoolTotal(pool.manual_total);
    setManualTotal(String(pool.manual_total));
  }

  const handleSaveTotal = async () => {
    const parsedTotal = parseMoneyInput(manualTotal);
    if (parsedTotal === null || parsedTotal < 0) {
      toast.error("Pool total must be zero or more");
      return;
    }

    try {
      await onUpdatePoolTotal(parsedTotal);
      toast.success("Pool total updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save pool total");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {pool.name}
          <Badge variant="secondary">{formatAllocationSource(pool.source)}</Badge>
        </CardTitle>
        <CardDescription>
          Split this virtual total into priority-ordered envelopes.
        </CardDescription>
        <CardAction>
          <Button onClick={onAddItem} size="sm">
            <PlusIcon />
            Add item
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-[minmax(180px,1fr)_auto_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor={`pool-total-${pool.id}`}>Pool total</Label>
            <div className="flex gap-2">
              <Input
                id={`pool-total-${pool.id}`}
                type="number"
                min="0"
                step="0.01"
                value={manualTotal}
                onChange={(event) => setManualTotal(event.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleSaveTotal}
                disabled={isSavingTotal}
              >
                {isSavingTotal ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>

          <MoneyStat label="Allocated" value={allocated} />
          <MoneyStat
            label="Unallocated"
            value={unallocated}
            isNegative={unallocated < 0}
          />
        </div>

        <ProgressBar
          value={progress}
          isOver={allocated > total && total > 0}
          label={`${progress.toFixed(0)}% allocated`}
        />

        {items.length > 0 ? (
          <div className="space-y-3">
            {items.map((item, index) => (
              <AllocationItemRow
                key={item.id}
                item={item}
                isFirst={index === 0}
                isLast={index === items.length - 1}
                onMoveUp={() => onMoveItem(item, items[index - 1])}
                onMoveDown={() => onMoveItem(item, items[index + 1])}
                onEdit={() => onEditItem(item)}
                onDelete={() => onDeleteItem(item)}
                isReordering={isReordering}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            No items yet. Add an item to start carving up this pool.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MoneyStat({
  label,
  value,
  isNegative = false,
}: {
  label: string;
  value: number;
  isNegative?: boolean;
}) {
  return (
    <div className="lift rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={
          isNegative
            ? "tabular font-semibold text-destructive"
            : "tabular font-semibold text-foreground"
        }
      >
        {formatMoney(value)}
      </div>
    </div>
  );
}

function ProgressBar({
  value,
  isOver,
  label,
}: {
  value: number;
  isOver: boolean;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={
            isOver
              ? "h-full rounded-full bg-destructive transition-all"
              : "h-full rounded-full bg-primary transition-all"
          }
          style={{ width: `${value}%` }}
        />
      </div>
      <p className="tabular text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function AllocationItemRow({
  item,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
  isReordering,
}: {
  item: AllocationItem;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isReordering: boolean;
}) {
  const targetAmount = item.target_amount ?? 0;
  const hasTarget = targetAmount > 0;
  const targetProgress = hasTarget
    ? Math.min((item.amount / targetAmount) * 100, 100)
    : 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border bg-card p-3 transition-colors hover:bg-muted/30"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{item.name}</span>
            <Badge variant="outline" className="tabular">
              {formatMoney(item.amount)}
            </Badge>
          </div>

          {hasTarget && (
            <div className="max-w-sm space-y-1">
              <div className="tabular text-xs text-muted-foreground">
                {formatMoney(item.amount)} of {formatMoney(targetAmount)}
              </div>
              <ProgressBar
                value={targetProgress}
                isOver={item.amount > targetAmount}
                label={`${targetProgress.toFixed(0)}% of target`}
              />
            </div>
          )}

          {item.notes && (
            <p className="text-sm text-muted-foreground">{item.notes}</p>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Move ${item.name} up`}
            onClick={onMoveUp}
            disabled={isFirst || isReordering}
          >
            <ArrowUpIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Move ${item.name} down`}
            onClick={onMoveDown}
            disabled={isLast || isReordering}
          >
            <ArrowDownIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit ${item.name}`}
            onClick={onEdit}
          >
            <Edit2Icon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${item.name}`}
            onClick={onDelete}
          >
            <Trash2Icon />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

function PoolFormDialog({
  open,
  onOpenChange,
  onSubmit,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (form: PoolFormState) => Promise<void>;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<PoolFormState>(emptyPoolForm);
  const [wasOpen, setWasOpen] = useState(false);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(emptyPoolForm);
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add allocation pool</DialogTitle>
          <DialogDescription>
            Create a new virtual total that can be split into envelopes.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="pool-name">Name</Label>
            <Input
              id="pool-name"
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Holiday spending"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Source</Label>
            <Select
              value={form.source}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  source: toAllocationSource(value ?? "balance"),
                }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allocationSources.map((source) => (
                  <SelectItem key={source} value={source}>
                    {formatAllocationSource(source)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save pool"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ItemFormDialog({
  pool,
  item,
  open,
  onOpenChange,
  onSubmit,
  isSaving,
}: {
  pool: AllocationPool | null;
  item: AllocationItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (form: ItemFormState) => Promise<void>;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<ItemFormState>(emptyItemForm);
  const [wasOpen, setWasOpen] = useState(false);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(item ? itemToForm(item) : emptyItemForm);
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? "Edit item" : "Add item"}</DialogTitle>
          <DialogDescription>
            {pool
              ? `Save an envelope inside "${pool.name}".`
              : "Save an allocation envelope."}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="item-name">Name</Label>
            <Input
              id="item-name"
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Groceries"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="item-amount">Amount</Label>
              <Input
                id="item-amount"
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    amount: event.target.value,
                  }))
                }
                placeholder="0.00"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-target">Target amount</Label>
              <Input
                id="item-target"
                type="number"
                min="0"
                step="0.01"
                value={form.targetAmount}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    targetAmount: event.target.value,
                  }))
                }
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="item-notes">Notes</Label>
            <Textarea
              id="item-notes"
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({ ...current, notes: event.target.value }))
              }
              placeholder="Optional details"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteItemDialog({
  item,
  open,
  onOpenChange,
  onConfirm,
  isDeleting,
}: {
  item: AllocationItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  isDeleting: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete item?</DialogTitle>
          <DialogDescription>
            This removes {item ? `"${item.name}"` : "this allocation item"} from
            the virtual plan only.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AllocationsSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 2 }).map((_, index) => (
        <Card key={index}>
          <CardHeader>
            <Skeleton className="h-5 w-52" />
            <Skeleton className="h-4 w-72" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
