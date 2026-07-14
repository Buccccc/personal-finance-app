"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "motion/react";
import { toast } from "sonner";
import { useAccounts } from "@/lib/hooks/accounts";
import {
  transactionTypes,
  useCategories,
  type Category,
  type TransactionType,
} from "@/lib/hooks/categories";
import {
  useCategoriseTransaction,
  useReviewQueue,
  useSetTaxDeductible,
  useSkipTransaction,
  type ReviewTransaction,
} from "@/lib/hooks/review";
import Link from "next/link";
import { useUnlinkedSplitBillCount } from "@/lib/hooks/transactions";
import { formatDate, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

type SwipeDirection = "left" | "right";
type PendingSelection = {
  transactionId: ReviewTransaction["id"];
  categoryId: string;
  subcategoryId: string;
} | null;
type PendingTaxDeductible = {
  transactionId: ReviewTransaction["id"];
  taxDeductible: ReviewTransaction["tax_deductible"];
} | null;

const swipeThreshold = 120;

function displayTransactionType(type: string) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function getAmountClass(type: string) {
  if (type === "income") return "text-emerald-600";
  if (type === "expense") return "text-red-600";
  return "text-foreground";
}

function toTransactionType(type: string): TransactionType {
  return transactionTypes.includes(type as TransactionType)
    ? (type as TransactionType)
    : "expense";
}

function parentCategories(categories: Category[], type: TransactionType) {
  return categories.filter(
    (category) => category.parent_id === null && category.kind === type,
  );
}

function childCategories(categories: Category[], parentId: string) {
  return categories.filter((category) => category.parent_id === parentId);
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function shouldIgnoreKeyboardShortcut(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return Boolean(
    target.closest(
      "input, textarea, select, button, [role='dialog'], [contenteditable='true']",
    ),
  );
}

export function ReviewMode() {
  const reviewQueue = useReviewQueue();
  const accounts = useAccounts();
  const categories = useCategories();
  const unlinkedSplitBills = useUnlinkedSplitBillCount();
  const categoriseTransaction = useCategoriseTransaction();
  const skipTransaction = useSkipTransaction();
  const setTaxDeductible = useSetTaxDeductible();
  const [reviewedIds, setReviewedIds] = useState<Set<ReviewTransaction["id"]>>(
    () => new Set(),
  );
  const [pendingSelection, setPendingSelection] =
    useState<PendingSelection>(null);
  const [pendingTaxDeductible, setPendingTaxDeductible] =
    useState<PendingTaxDeductible>(null);
  const [pendingType, setPendingType] = useState<{
    transactionId: ReviewTransaction["id"];
    type: TransactionType;
  } | null>(null);
  const [exitDirection, setExitDirection] = useState<SwipeDirection>("left");

  const visibleTransactions = useMemo(() => {
    return (reviewQueue.data?.rows ?? []).filter(
      (transaction) => !reviewedIds.has(transaction.id),
    );
  }, [reviewQueue.data?.rows, reviewedIds]);

  const currentTransaction = visibleTransactions[0] ?? null;
  const remainingCount = visibleTransactions.length;
  const totalCount = Math.max(
    reviewQueue.data?.total ?? 0,
    remainingCount + reviewedIds.size,
  );

  const accountNames = useMemo(() => {
    return new Map((accounts.data ?? []).map((account) => [account.id, account.name]));
  }, [accounts.data]);

  const categoryList = categories.data ?? [];
  const selectedCategoryId =
    currentTransaction &&
    pendingSelection?.transactionId === currentTransaction.id
      ? pendingSelection.categoryId
      : "";
  const selectedSubcategoryId =
    currentTransaction &&
    pendingSelection?.transactionId === currentTransaction.id
      ? pendingSelection.subcategoryId
      : "";
  const taxDeductible =
    currentTransaction &&
    pendingTaxDeductible?.transactionId === currentTransaction.id
      ? pendingTaxDeductible.taxDeductible
      : (currentTransaction?.tax_deductible ?? false);
  const effectiveType: TransactionType =
    currentTransaction && pendingType?.transactionId === currentTransaction.id
      ? pendingType.type
      : toTransactionType(currentTransaction?.type ?? "expense");

  function handleTypeChange(nextType: TransactionType) {
    if (!currentTransaction) return;
    setPendingType({ transactionId: currentTransaction.id, type: nextType });
    // Kind changed → any chosen category no longer applies.
    setPendingSelection(null);
  }
  const selectedCategory =
    categoryList.find((category) => category.id === selectedCategoryId) ?? null;
  const selectedSubcategory =
    categoryList.find((category) => category.id === selectedSubcategoryId) ??
    null;

  const skipCurrent = useCallback(() => {
    if (!currentTransaction) return;

    setExitDirection("left");
    skipTransaction.mutate({ id: currentTransaction.id });
    setReviewedIds((current) => new Set(current).add(currentTransaction.id));
  }, [currentTransaction, skipTransaction]);

  const acceptCurrent = useCallback(async () => {
    if (
      !currentTransaction ||
      !selectedCategoryId ||
      categoriseTransaction.isPending
    ) {
      return;
    }

    const transactionId = currentTransaction.id;
    setExitDirection("right");
    setReviewedIds((current) => new Set(current).add(transactionId));

    try {
      await categoriseTransaction.mutateAsync({
        id: transactionId,
        categoryId: selectedCategoryId,
        subcategoryId: selectedSubcategoryId || null,
        taxDeductible,
        type: effectiveType,
      });
      toast.success("Transaction categorised");
    } catch (error) {
      setReviewedIds((current) => {
        const next = new Set(current);
        next.delete(transactionId);
        return next;
      });
      toast.error(getErrorMessage(error, "Could not categorise transaction"));
    }
  }, [
    categoriseTransaction,
    currentTransaction,
    selectedCategoryId,
    selectedSubcategoryId,
    taxDeductible,
    effectiveType,
  ]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (shouldIgnoreKeyboardShortcut(event.target)) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        skipCurrent();
      }

      if (event.key === "ArrowRight" && selectedCategoryId) {
        event.preventDefault();
        void acceptCurrent();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [acceptCurrent, selectedCategoryId, skipCurrent]);

  async function handleTaxDeductibleChange(checked: boolean) {
    if (!currentTransaction) return;

    const previousValue = taxDeductible;
    setPendingTaxDeductible({
      transactionId: currentTransaction.id,
      taxDeductible: checked,
    });

    try {
      await setTaxDeductible.mutateAsync({
        id: currentTransaction.id,
        taxDeductible: checked,
      });
    } catch (error) {
      setPendingTaxDeductible({
        transactionId: currentTransaction.id,
        taxDeductible: previousValue,
      });
      toast.error(getErrorMessage(error, "Could not update tax setting"));
    }
  }

  const isLoading =
    reviewQueue.isLoading || accounts.isLoading || categories.isLoading;
  const loadError = reviewQueue.error ?? accounts.error ?? categories.error;

  return (
    <div className="flex min-h-[70vh] flex-col gap-8">
      <PageHeader
        title="Review"
        description="Swipe or use the buttons to categorise uncategorised transactions."
      >
        <div className="tabular rounded-full border px-3 py-1 text-sm text-muted-foreground">
          {isLoading ? "Loading queue..." : `${remainingCount} of ${totalCount} left`}
        </div>
      </PageHeader>

      {(unlinkedSplitBills.data ?? 0) > 0 ? (
        <Card className="mx-auto w-full max-w-xl border-dashed">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              {unlinkedSplitBills.data} reimbursement
              {unlinkedSplitBills.data === 1 ? "" : "s"} not linked to their
              expense yet.
            </span>
            <Button
              variant="outline"
              size="sm"
              render={<Link href="/transactions" />}
            >
              Link now
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {loadError ? (
        <Card className="mx-auto w-full max-w-xl">
          <CardHeader>
            <CardTitle>Could not load review queue</CardTitle>
            <CardDescription>{getErrorMessage(loadError, "Try again.")}</CardDescription>
          </CardHeader>
        </Card>
      ) : isLoading ? (
        <ReviewSkeleton />
      ) : currentTransaction ? (
        <section className="flex flex-1 flex-col items-center justify-center gap-6">
          <div className="relative w-full max-w-xl sm:h-[34rem]">
            {/* Opaque deck backing cards for depth (no content, no transparency). */}
            {visibleTransactions.slice(1, 3).map((transaction, index) => (
              <div
                key={transaction.id}
                aria-hidden
                className="absolute inset-0 rounded-xl border bg-card shadow-sm"
                style={{
                  transform: `translateY(${(index + 1) * 14}px) scale(${
                    1 - (index + 1) * 0.04
                  })`,
                  zIndex: 0,
                }}
              />
            ))}

            <AnimatePresence mode="popLayout" custom={exitDirection}>
              <SwipeableTransactionCard
                key={currentTransaction.id}
                transaction={currentTransaction}
                accountName={
                  accountNames.get(currentTransaction.account_id) ??
                  "Unknown account"
                }
                categories={categoryList}
                selectedType={effectiveType}
                onTypeChange={handleTypeChange}
                selectedCategory={selectedCategory}
                selectedSubcategory={selectedSubcategory}
                taxDeductible={taxDeductible}
                isSaving={
                  categoriseTransaction.isPending || setTaxDeductible.isPending
                }
                exitDirection={exitDirection}
                onCategorySelect={(category) => {
                  setPendingSelection({
                    transactionId: currentTransaction.id,
                    categoryId: category.id,
                    subcategoryId: "",
                  });
                }}
                onSubcategorySelect={(subcategory) =>
                  setPendingSelection({
                    transactionId: currentTransaction.id,
                    categoryId: selectedCategoryId,
                    subcategoryId: subcategory.id,
                  })
                }
                onTaxDeductibleChange={(checked) => {
                  void handleTaxDeductibleChange(checked);
                }}
                onSwipeLeft={skipCurrent}
                onSwipeRight={() => {
                  void acceptCurrent();
                }}
              />
            </AnimatePresence>
          </div>

          <div className="flex w-full max-w-xl gap-3">
            <Button
              className="h-11 flex-1"
              variant="outline"
              onClick={skipCurrent}
              disabled={categoriseTransaction.isPending}
            >
              Skip
            </Button>
            <Button
              className="h-11 flex-1"
              onClick={() => void acceptCurrent()}
              disabled={!selectedCategoryId || categoriseTransaction.isPending}
            >
              ✓ Accept
            </Button>
          </div>
        </section>
      ) : (
        <Card className="mx-auto w-full max-w-xl border-dashed">
          <CardHeader className="text-center">
            <CardTitle>All caught up — nothing to review</CardTitle>
            <CardDescription>
              Every transaction in the current queue has either been reviewed or
              skipped for this session.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}

function SwipeableTransactionCard({
  transaction,
  accountName,
  categories,
  selectedType,
  onTypeChange,
  selectedCategory,
  selectedSubcategory,
  taxDeductible,
  isSaving,
  exitDirection,
  onCategorySelect,
  onSubcategorySelect,
  onTaxDeductibleChange,
  onSwipeLeft,
  onSwipeRight,
}: {
  transaction: ReviewTransaction;
  accountName: string;
  categories: Category[];
  selectedType: TransactionType;
  onTypeChange: (type: TransactionType) => void;
  selectedCategory: Category | null;
  selectedSubcategory: Category | null;
  taxDeductible: boolean;
  isSaving: boolean;
  exitDirection: SwipeDirection;
  onCategorySelect: (category: Category) => void;
  onSubcategorySelect: (category: Category) => void;
  onTaxDeductibleChange: (checked: boolean) => void;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-250, 0, 250], [-12, 0, 12]);
  const opacity = useTransform(x, [-250, 0, 250], [0.72, 1, 0.72]);
  const subcategoryOptions = selectedCategory
    ? childCategories(categories, selectedCategory.id)
    : [];

  function handleDragEnd(
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) {
    if (info.offset.x <= -swipeThreshold) {
      onSwipeLeft();
      return;
    }

    if (info.offset.x >= swipeThreshold && selectedCategory) {
      onSwipeRight();
    }
  }

  return (
    <motion.div
      className="relative z-10 touch-pan-y sm:absolute sm:inset-0"
      style={{ x, rotate, opacity }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.8}
      onDragEnd={handleDragEnd}
      initial={{ opacity: 0, scale: 0.96, y: 24 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{
        x: exitDirection === "right" ? 720 : -720,
        opacity: 0,
        rotate: exitDirection === "right" ? 18 : -18,
      }}
      transition={{ type: "spring", stiffness: 280, damping: 28 }}
    >
      <Card className="flex h-full flex-col shadow-xl">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardDescription>{formatDate(transaction.date)}</CardDescription>
              <CardTitle className="mt-2 text-4xl">
                <span className={`tabular ${getAmountClass(transaction.type)}`}>
                  {formatMoney(transaction.amount)}
                </span>
              </CardTitle>
            </div>
            <Badge
              variant={transaction.type === "expense" ? "destructive" : "secondary"}
            >
              {displayTransactionType(transaction.type)}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col gap-5">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Bank description
            </p>
            <p className="text-xl font-medium leading-snug">
              {transaction.description || "No description"}
            </p>
            <p className="text-sm text-muted-foreground">{accountName}</p>
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium">Type</p>
            <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
              {transactionTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onTypeChange(t)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                    selectedType === t
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3">
            <CategoryPicker
              label="Category"
              buttonText={selectedCategory?.name ?? "Choose a category"}
              emptyText="No matching categories."
              categories={parentCategories(categories, selectedType)}
              selectedCategoryId={selectedCategory?.id ?? ""}
              onSelect={onCategorySelect}
            />

            <CategoryPicker
              label="Subcategory"
              buttonText={selectedSubcategory?.name ?? "Optional subcategory"}
              emptyText="No subcategories for this category."
              categories={subcategoryOptions}
              selectedCategoryId={selectedSubcategory?.id ?? ""}
              onSelect={onSubcategorySelect}
              disabled={!selectedCategory || subcategoryOptions.length === 0}
            />
          </div>

          <div className="mt-auto flex items-center justify-between rounded-xl border p-4">
            <div>
              <p className="font-medium">Tax-deductible</p>
              <p className="text-sm text-muted-foreground">
                Turn this on if it may be claimable at tax time.
              </p>
            </div>
            <Switch
              checked={taxDeductible}
              onCheckedChange={onTaxDeductibleChange}
              disabled={isSaving}
            />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function CategoryPicker({
  label,
  buttonText,
  emptyText,
  categories,
  selectedCategoryId,
  disabled = false,
  onSelect,
}: {
  label: string;
  buttonText: string;
  emptyText: string;
  categories: Category[];
  selectedCategoryId: string;
  disabled?: boolean;
  onSelect: (category: Category) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <Button
        className="h-11 w-full justify-start"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        <span className={selectedCategoryId ? "" : "text-muted-foreground"}>
          {buttonText}
        </span>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title={`Choose ${label.toLowerCase()}`}
        description={`Search and choose a ${label.toLowerCase()}.`}
      >
        <Command>
          <CommandInput placeholder={`Search ${label.toLowerCase()}...`} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup heading={label}>
              {categories.map((category) => (
                <CommandItem
                  key={category.id}
                  value={`${category.name} ${category.id}`}
                  data-checked={category.id === selectedCategoryId}
                  onSelect={() => {
                    onSelect(category);
                    setOpen(false);
                  }}
                >
                  {category.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </div>
  );
}

function ReviewSkeleton() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6">
      <div className="w-full max-w-xl rounded-xl border p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <Skeleton className="mt-6 h-12 w-44" />
        <Skeleton className="mt-10 h-8 w-full" />
        <Skeleton className="mt-3 h-5 w-40" />
        <Skeleton className="mt-8 h-11 w-full" />
        <Skeleton className="mt-3 h-11 w-full" />
        <Skeleton className="mt-8 h-20 w-full" />
      </div>
    </section>
  );
}
