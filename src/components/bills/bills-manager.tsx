"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  addMonths,
  addWeeks,
  addYears,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  isAfter,
  isBefore,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  format as formatDateKey,
} from "date-fns";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Edit2Icon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { formatDate, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/app-shell/page-header";
import {
  formatRecurringFrequency,
  recurringDirections,
  recurringFrequencies,
  useBillAccounts,
  useBillCategories,
  useCreateRecurringItem,
  useDeleteRecurringItem,
  useRecurringItems,
  useUpdateRecurringItem,
  type BillAccount,
  type BillCategory,
  type RecurringDirection,
  type RecurringFrequency,
  type RecurringItem,
  type RecurringItemInsert,
} from "@/lib/hooks/bills";
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
import { Switch } from "@/components/ui/switch";

type BillFormState = {
  name: string;
  amount: string;
  direction: RecurringDirection;
  frequency: RecurringFrequency;
  nextDueDate: string;
  accountId: string;
  categoryId: string;
  active: boolean;
};

type CalendarOccurrence = {
  id: string;
  item: RecurringItem;
  dateKey: string;
};

const unselectedValue = "none";
const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function todayInputValue(): string {
  return formatDateKey(new Date(), "yyyy-MM-dd");
}

function emptyBillForm(): BillFormState {
  return {
    name: "",
    amount: "",
    direction: "out",
    frequency: "monthly",
    nextDueDate: todayInputValue(),
    accountId: "",
    categoryId: "",
    active: true,
  };
}

function billToForm(item: RecurringItem): BillFormState {
  return {
    name: item.name,
    amount: String(item.amount),
    direction: item.direction,
    frequency: item.frequency,
    nextDueDate: item.next_due_date,
    accountId: item.account_id ?? "",
    categoryId: item.category_id ?? "",
    active: item.active,
  };
}

function normaliseBillForm(form: BillFormState): RecurringItemInsert {
  return {
    name: form.name.trim(),
    amount: Number(form.amount),
    direction: form.direction,
    frequency: form.frequency,
    next_due_date: form.nextDueDate,
    account_id: form.accountId || null,
    category_id: form.categoryId || null,
    active: form.active,
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function accountNameById(accounts: BillAccount[]) {
  return new Map(accounts.map((account) => [account.id, account.name]));
}

function categoryNameById(categories: BillCategory[]) {
  return new Map(categories.map((category) => [category.id, category.name]));
}

function displayDirection(direction: RecurringDirection): string {
  return direction === "in" ? "Money in" : "Money out";
}

function directionClasses(direction: RecurringDirection): string {
  return direction === "in"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
}

function parseLocalDate(value: string): Date | null {
  const date = parseISO(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addFrequency(anchor: Date, frequency: RecurringFrequency, count: number) {
  if (frequency === "weekly") return addWeeks(anchor, count);
  if (frequency === "fortnightly") return addWeeks(anchor, count * 2);
  if (frequency === "monthly") return addMonths(anchor, count);
  if (frequency === "quarterly") return addMonths(anchor, count * 3);
  return addYears(anchor, count);
}

function projectOccurrences(
  items: RecurringItem[],
  month: Date,
): CalendarOccurrence[] {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const occurrences: CalendarOccurrence[] = [];

  for (const item of items) {
    if (!item.active) continue;

    const anchor = parseLocalDate(item.next_due_date);
    if (!anchor) continue;

    let step = 0;
    let occurrenceDate = addFrequency(anchor, item.frequency, step);

    while (isAfter(occurrenceDate, monthStart)) {
      step -= 1;
      occurrenceDate = addFrequency(anchor, item.frequency, step);
    }

    while (isBefore(occurrenceDate, monthStart)) {
      step += 1;
      occurrenceDate = addFrequency(anchor, item.frequency, step);
    }

    while (!isAfter(occurrenceDate, monthEnd)) {
      const dateKey = formatDateKey(occurrenceDate, "yyyy-MM-dd");
      occurrences.push({
        id: `${item.id}-${dateKey}`,
        item,
        dateKey,
      });
      step += 1;
      occurrenceDate = addFrequency(anchor, item.frequency, step);
    }
  }

  return occurrences.sort((a, b) => {
    const dateSort = a.dateKey.localeCompare(b.dateKey);
    return dateSort || a.item.name.localeCompare(b.item.name);
  });
}

function totalForOccurrences(occurrences: CalendarOccurrence[]) {
  return occurrences.reduce(
    (totals, occurrence) => {
      if (occurrence.item.direction === "in") {
        totals.in += occurrence.item.amount;
      } else {
        totals.out += occurrence.item.amount;
      }

      totals.net = totals.in - totals.out;
      return totals;
    },
    { in: 0, out: 0, net: 0 },
  );
}

export function BillsManager() {
  const recurringItems = useRecurringItems();
  const accounts = useBillAccounts();
  const categories = useBillCategories();
  const createRecurringItem = useCreateRecurringItem();
  const updateRecurringItem = useUpdateRecurringItem();
  const deleteRecurringItem = useDeleteRecurringItem();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RecurringItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<RecurringItem | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));

  const accountMap = useMemo(
    () => accountNameById(accounts.data ?? []),
    [accounts.data],
  );
  const categoryMap = useMemo(
    () => categoryNameById(categories.data ?? []),
    [categories.data],
  );
  const isLoading =
    recurringItems.isLoading || accounts.isLoading || categories.isLoading;
  const error = recurringItems.error ?? accounts.error ?? categories.error;

  const openCreateDialog = () => {
    setEditingItem(null);
    setIsFormOpen(true);
  };

  const openEditDialog = (item: RecurringItem) => {
    setEditingItem(item);
    setIsFormOpen(true);
  };

  const handleActiveChange = async (item: RecurringItem, active: boolean) => {
    try {
      await updateRecurringItem.mutateAsync({
        id: item.id,
        item: { active },
      });
      toast.success(active ? "Bill activated" : "Bill paused");
    } catch (mutationError) {
      toast.error(getErrorMessage(mutationError));
    }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;

    try {
      await deleteRecurringItem.mutateAsync(deletingItem.id);
      toast.success("Recurring item deleted");
      setDeletingItem(null);
    } catch (mutationError) {
      toast.error(getErrorMessage(mutationError));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bills & Calendar"
        description="Track recurring bills and income, then preview the cash flow they create across each month."
      >
        <Button onClick={openCreateDialog}>
          <PlusIcon />
          Add recurring item
        </Button>
      </PageHeader>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent>
            <p className="text-sm text-destructive">{getErrorMessage(error)}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(420px,1.3fr)]">
        <RecurringItemsList
          items={recurringItems.data ?? []}
          accountMap={accountMap}
          categoryMap={categoryMap}
          isLoading={isLoading}
          isToggling={updateRecurringItem.isPending}
          onCreate={openCreateDialog}
          onEdit={openEditDialog}
          onDelete={setDeletingItem}
          onActiveChange={handleActiveChange}
        />

        <BillsCalendar
          items={recurringItems.data ?? []}
          visibleMonth={visibleMonth}
          onPreviousMonth={() =>
            setVisibleMonth((current) => addMonths(current, -1))
          }
          onNextMonth={() => setVisibleMonth((current) => addMonths(current, 1))}
          isLoading={isLoading}
        />
      </div>

      <BillFormDialog
        item={editingItem}
        accounts={accounts.data ?? []}
        categories={categories.data ?? []}
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSubmit={async (form) => {
          const payload = normaliseBillForm(form);

          if (!payload.name) {
            toast.error("Name is required");
            return;
          }

          if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
            toast.error("Amount must be a positive number");
            return;
          }

          if (!payload.next_due_date) {
            toast.error("Next due date is required");
            return;
          }

          try {
            if (editingItem) {
              await updateRecurringItem.mutateAsync({
                id: editingItem.id,
                item: payload,
              });
              toast.success("Recurring item updated");
            } else {
              await createRecurringItem.mutateAsync(payload);
              toast.success("Recurring item created");
            }
            setIsFormOpen(false);
          } catch (mutationError) {
            toast.error(getErrorMessage(mutationError));
          }
        }}
        isSaving={createRecurringItem.isPending || updateRecurringItem.isPending}
      />

      <DeleteBillDialog
        item={deletingItem}
        open={Boolean(deletingItem)}
        onOpenChange={(open) => {
          if (!open) setDeletingItem(null);
        }}
        onConfirm={handleDelete}
        isDeleting={deleteRecurringItem.isPending}
      />
    </div>
  );
}

function RecurringItemsList({
  items,
  accountMap,
  categoryMap,
  isLoading,
  isToggling,
  onCreate,
  onEdit,
  onDelete,
  onActiveChange,
}: {
  items: RecurringItem[];
  accountMap: Map<string, string>;
  categoryMap: Map<string, string>;
  isLoading: boolean;
  isToggling: boolean;
  onCreate: () => void;
  onEdit: (item: RecurringItem) => void;
  onDelete: (item: RecurringItem) => void;
  onActiveChange: (item: RecurringItem, active: boolean) => Promise<void>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recurring Items</CardTitle>
        <CardDescription>
          Bills and income that repeat on a known schedule.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <RecurringItemsSkeleton />
        ) : items.length > 0 ? (
          items.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.03 }}
            >
              <Card size="sm" className={!item.active ? "opacity-70" : undefined}>
                <CardHeader>
                  <CardTitle>{item.name}</CardTitle>
                  <CardDescription>
                    Due {formatDate(item.next_due_date)} ·{" "}
                    {formatRecurringFrequency(item.frequency)}
                  </CardDescription>
                  <CardAction className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${item.name}`}
                      onClick={() => onEdit(item)}
                    >
                      <Edit2Icon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${item.name}`}
                      onClick={() => onDelete(item)}
                    >
                      <Trash2Icon />
                    </Button>
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular font-medium">
                      {formatMoney(item.amount)}
                    </span>
                    <Badge
                      variant="outline"
                      className={directionClasses(item.direction)}
                    >
                      {displayDirection(item.direction)}
                    </Badge>
                    <Badge variant="secondary">
                      {item.active ? "Active" : "Paused"}
                    </Badge>
                  </div>
                  <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p>Account: {item.account_id ? accountMap.get(item.account_id) ?? "Unknown account" : "None"}</p>
                      <p>
                        Category:{" "}
                        {item.category_id
                          ? categoryMap.get(item.category_id) ?? "Unknown category"
                          : "None"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`active-${item.id}`} className="text-xs">
                        Active
                      </Label>
                      <Switch
                        id={`active-${item.id}`}
                        checked={item.active}
                        disabled={isToggling}
                        onCheckedChange={(checked) =>
                          onActiveChange(item, checked)
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))
        ) : (
          <EmptyState
            title="No recurring items yet"
            description="Add bills, subscriptions, rent, wages, or other repeat payments to fill the calendar."
          >
            <Button onClick={onCreate}>
              <PlusIcon />
              Add recurring item
            </Button>
          </EmptyState>
        )}
      </CardContent>
    </Card>
  );
}

function BillsCalendar({
  items,
  visibleMonth,
  onPreviousMonth,
  onNextMonth,
  isLoading,
}: {
  items: RecurringItem[];
  visibleMonth: Date;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  isLoading: boolean;
}) {
  const occurrences = useMemo(
    () => projectOccurrences(items, visibleMonth),
    [items, visibleMonth],
  );
  const occurrencesByDay = useMemo(() => {
    const grouped = new Map<string, CalendarOccurrence[]>();
    for (const occurrence of occurrences) {
      const dayOccurrences = grouped.get(occurrence.dateKey) ?? [];
      dayOccurrences.push(occurrence);
      grouped.set(occurrence.dateKey, dayOccurrences);
    }
    return grouped;
  }, [occurrences]);
  const summary = useMemo(() => totalForOccurrences(occurrences), [occurrences]);
  const gridDays = useMemo(() => {
    const monthStart = startOfMonth(visibleMonth);
    const monthEnd = endOfMonth(visibleMonth);
    return eachDayOfInterval({
      start: startOfWeek(monthStart, { weekStartsOn: 1 }),
      end: endOfWeek(monthEnd, { weekStartsOn: 1 }),
    });
  }, [visibleMonth]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Projected in" value={summary.in} tone="in" />
        <SummaryCard label="Projected out" value={summary.out} tone="out" />
        <SummaryCard label="Net" value={summary.net} tone={summary.net >= 0 ? "in" : "out"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDaysIcon className="size-4" />
            {formatDateKey(visibleMonth, "MMMM yyyy")}
          </CardTitle>
          <CardDescription>
            Projected active recurring items for this month.
          </CardDescription>
          <CardAction className="flex gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Previous month"
              onClick={onPreviousMonth}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next month"
              onClick={onNextMonth}
            >
              <ChevronRightIcon />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <CalendarSkeleton />
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <div className="grid grid-cols-7 border-b bg-muted/40 text-xs font-medium text-muted-foreground">
                {weekDays.map((day) => (
                  <div key={day} className="px-2 py-2 text-center">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {gridDays.map((day) => {
                  const dateKey = formatDateKey(day, "yyyy-MM-dd");
                  const dayOccurrences = occurrencesByDay.get(dateKey) ?? [];
                  const dayTotal = totalForOccurrences(dayOccurrences).net;
                  const isCurrentMonth = isSameMonth(day, visibleMonth);

                  return (
                    <div
                      key={dateKey}
                      className={`min-h-28 border-r border-b p-2 text-sm last:border-r-0 ${
                        isCurrentMonth ? "bg-background" : "bg-muted/20 text-muted-foreground"
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="font-medium">{formatDateKey(day, "d")}</span>
                        {dayOccurrences.length > 0 && (
                          <span
                            className={`tabular text-xs font-medium ${
                              dayTotal >= 0
                                ? "text-emerald-700 dark:text-emerald-300"
                                : "text-red-700 dark:text-red-300"
                            }`}
                          >
                            {formatMoney(dayTotal)}
                          </span>
                        )}
                      </div>
                      <div className="space-y-1">
                        {dayOccurrences.map((occurrence) => (
                          <div
                            key={occurrence.id}
                            className={`rounded-md border px-2 py-1 text-xs ${directionClasses(
                              occurrence.item.direction,
                            )}`}
                            title={occurrence.item.name}
                          >
                            <div className="truncate font-medium">
                              {occurrence.item.name}
                            </div>
                            <div className="tabular">
                              {formatMoney(occurrence.item.amount)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!isLoading && occurrences.length === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              No active recurring items fall in this month yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "in" | "out";
}) {
  return (
    <Card className="lift">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={`tabular text-2xl ${
            tone === "in"
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-red-700 dark:text-red-300"
          }`}
        >
          {formatMoney(value)}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

function BillFormDialog({
  item,
  accounts,
  categories,
  open,
  onOpenChange,
  onSubmit,
  isSaving,
}: {
  item: RecurringItem | null;
  accounts: BillAccount[];
  categories: BillCategory[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (form: BillFormState) => Promise<void>;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<BillFormState>(emptyBillForm);
  const [wasOpen, setWasOpen] = useState(false);
  const directionItems = Object.fromEntries(
    recurringDirections.map((direction) => [direction, displayDirection(direction)]),
  );
  const frequencyItems = Object.fromEntries(
    recurringFrequencies.map((frequency) => [
      frequency,
      formatRecurringFrequency(frequency),
    ]),
  );

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(item ? billToForm(item) : emptyBillForm());
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {item ? "Edit recurring item" : "Add recurring item"}
          </DialogTitle>
          <DialogDescription>
            Save the amount, schedule, and optional account/category used in
            the list and calendar.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="bill-name">Name</Label>
              <Input
                id="bill-name"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Rent, Netflix, salary..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bill-amount">Amount</Label>
              <Input
                id="bill-amount"
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
              />
            </div>

            <div className="space-y-2">
              <Label>Direction</Label>
              <Select
                items={directionItems}
                value={form.direction}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    direction: (value ?? "out") as RecurringDirection,
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {recurringDirections.map((direction) => (
                    <SelectItem key={direction} value={direction}>
                      {displayDirection(direction)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select
                items={frequencyItems}
                value={form.frequency}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    frequency: (value ?? "monthly") as RecurringFrequency,
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {recurringFrequencies.map((frequency) => (
                    <SelectItem key={frequency} value={frequency}>
                      {formatRecurringFrequency(frequency)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bill-next-due">Next due date</Label>
              <Input
                id="bill-next-due"
                type="date"
                value={form.nextDueDate}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    nextDueDate: event.target.value,
                  }))
                }
              />
            </div>

            <OptionalSelect
              label="Account"
              value={form.accountId}
              options={accounts}
              noneLabel="No account"
              onChange={(accountId) =>
                setForm((current) => ({ ...current, accountId }))
              }
            />

            <OptionalSelect
              label="Category"
              value={form.categoryId}
              options={categories}
              noneLabel="No category"
              onChange={(categoryId) =>
                setForm((current) => ({ ...current, categoryId }))
              }
            />

            <div className="flex items-center justify-between rounded-lg border p-3 sm:col-span-2">
              <div className="space-y-1">
                <Label>Active</Label>
                <p className="text-xs text-muted-foreground">
                  Active items appear in the calendar projection.
                </p>
              </div>
              <Switch
                checked={form.active}
                onCheckedChange={(checked) =>
                  setForm((current) => ({ ...current, active: checked }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : item ? "Save changes" : "Create item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OptionalSelect({
  label,
  value,
  options,
  noneLabel,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; name: string }[];
  noneLabel: string;
  onChange: (value: string) => void;
}) {
  const optionItems = {
    [unselectedValue]: noneLabel,
    ...Object.fromEntries(options.map((option) => [option.id, option.name])),
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select
        items={optionItems}
        value={value || unselectedValue}
        onValueChange={(nextValue) =>
          onChange(nextValue === unselectedValue ? "" : (nextValue ?? ""))
        }
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={unselectedValue}>{noneLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DeleteBillDialog({
  item,
  open,
  onOpenChange,
  onConfirm,
  isDeleting,
}: {
  item: RecurringItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  isDeleting: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete recurring item?</DialogTitle>
          <DialogDescription>
            {item
              ? `${item.name} will be removed from the list and future calendar projections.`
              : "This recurring item will be removed."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed p-6 text-center">
      <h3 className="font-medium">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {description}
      </p>
      {children && <div className="mt-4 flex justify-center">{children}</div>}
    </div>
  );
}

function RecurringItemsSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((item) => (
        <Card key={item} size="sm">
          <CardHeader>
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-24" />
            </div>
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border bg-border">
      {Array.from({ length: 35 }).map((_, index) => (
        <div key={index} className="min-h-24 bg-background p-2">
          <Skeleton className="mb-3 h-4 w-6" />
          <Skeleton className="h-5 w-full" />
        </div>
      ))}
    </div>
  );
}
