"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import {
  differenceInCalendarDays,
  isValid,
  parseISO,
  startOfToday,
} from "date-fns";
import { motion } from "motion/react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowUpDownIcon,
  CheckIcon,
  Edit2Icon,
  MoreHorizontalIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { useAccounts } from "@/lib/hooks/accounts";
import {
  transactionTypes,
  useCategories,
  type Category,
  type TransactionType,
} from "@/lib/hooks/categories";
import {
  useCreateTransaction,
  useDeleteTransaction,
  useInfiniteTransactions,
  useMerchants,
  useUpdateTransaction,
  useUpdateTransactionCategory,
  type Merchant,
  type Transaction,
  type TransactionSortDirection,
  type TransactionSortField,
} from "@/lib/hooks/transactions";
import { formatDate, formatMoney } from "@/lib/format";
import { AccountBadge } from "@/components/account-badge";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type TransactionFormState = {
  accountId: string;
  date: string;
  description: string;
  amount: string;
  type: TransactionType;
  categoryId: string;
  subcategoryId: string;
  taxDeductible: boolean;
  notes: string;
};

type TransactionFeedRow = Transaction & {
  accountName: string;
  accountInstitution: string | null;
  merchantName: string | null;
  categoryName: string | null;
  subcategoryName: string | null;
};

type TransactionDateGroup = {
  date: string;
  rows: TransactionFeedRow[];
};

const unselectedValue = "none";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function emptyTransactionForm(defaultAccountId = ""): TransactionFormState {
  return {
    accountId: defaultAccountId,
    date: todayIsoDate(),
    description: "",
    amount: "",
    type: "expense",
    categoryId: "",
    subcategoryId: "",
    taxDeductible: false,
    notes: "",
  };
}

function displayTransactionType(type: string) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function toTransactionType(type: string): TransactionType {
  return transactionTypes.includes(type as TransactionType)
    ? (type as TransactionType)
    : "expense";
}

function transactionToForm(transaction: Transaction): TransactionFormState {
  return {
    accountId: transaction.account_id,
    date: transaction.date,
    description: transaction.description ?? "",
    amount: String(transaction.amount),
    type: toTransactionType(transaction.type),
    categoryId: transaction.category_id ?? "",
    subcategoryId: transaction.subcategory_id ?? "",
    taxDeductible: transaction.tax_deductible,
    notes: transaction.notes ?? "",
  };
}

function parentCategories(categories: Category[], type: TransactionType) {
  return categories.filter(
    (category) => category.parent_id === null && category.kind === type,
  );
}

function subcategories(categories: Category[], parentId: string) {
  if (!parentId) return [];
  return categories.filter((category) => category.parent_id === parentId);
}

function categoryById(categories: Category[]) {
  return new Map(categories.map((category) => [category.id, category]));
}

function merchantById(merchants: Merchant[]) {
  return new Map(merchants.map((merchant) => [merchant.id, merchant]));
}

function groupTransactionsByDate(rows: TransactionFeedRow[]) {
  const groups = new Map<string, TransactionFeedRow[]>();

  for (const row of rows) {
    const existing = groups.get(row.date);
    if (existing) {
      existing.push(row);
    } else {
      groups.set(row.date, [row]);
    }
  }

  return Array.from(groups, ([date, groupedRows]) => ({
    date,
    rows: groupedRows,
  }));
}

function relativeDateHint(date: string) {
  const parsedDate = parseISO(date.length <= 10 ? date : date.slice(0, 10));

  if (!isValid(parsedDate)) return "";

  const daysAgo = differenceInCalendarDays(startOfToday(), parsedDate);

  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo > 1) return `${daysAgo} days ago`;
  if (daysAgo === -1) return "Tomorrow";
  return `In ${Math.abs(daysAgo)} days`;
}

function useDebouncedValue(value: string, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);

    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

export function TransactionsFeed() {
  const accounts = useAccounts();
  const categories = useCategories();
  const merchants = useMerchants();
  const createTransaction = useCreateTransaction();
  const updateTransaction = useUpdateTransaction();
  const deleteTransaction = useDeleteTransaction();
  const updateTransactionCategory = useUpdateTransactionCategory();
  const [sorting, setSorting] = useState<SortingState>([
    { id: "date", desc: true },
  ]);
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [pageSize, setPageSize] = useState(50);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] =
    useState<Transaction | null>(null);
  const loadMoreRef = useRef<HTMLTableRowElement | null>(null);
  const debouncedSearch = useDebouncedValue(search, 300);
  const primarySort = sorting[0];
  const sortBy: TransactionSortField =
    primarySort?.id === "amount" ? "amount" : "date";
  const sortDirection: TransactionSortDirection =
    (primarySort?.desc ?? true) ? "desc" : "asc";
  const transactions = useInfiniteTransactions({
    search: debouncedSearch,
    accountId: accountFilter === "all" ? null : accountFilter,
    type: typeFilter === "all" ? null : typeFilter,
    categoryId: categoryFilter === "all" ? null : categoryFilter,
    sortBy,
    sortDirection,
    pageSize,
  });

  const accountMap = useMemo(
    () => new Map((accounts.data ?? []).map((account) => [account.id, account])),
    [accounts.data],
  );
  const categoryMap = useMemo(
    () => categoryById(categories.data ?? []),
    [categories.data],
  );
  const merchantMap = useMemo(
    () => merchantById(merchants.data ?? []),
    [merchants.data],
  );
  const loadedTransactions = useMemo(
    () => transactions.data?.pages.flatMap((page) => page.rows) ?? [],
    [transactions.data],
  );
  const totalTransactions = transactions.data?.pages[0]?.total ?? 0;
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = transactions;

  const rows = useMemo<TransactionFeedRow[]>(() => {
    return loadedTransactions.map((transaction) => {
      const account = accountMap.get(transaction.account_id);
      const merchant = transaction.merchant_id
        ? merchantMap.get(transaction.merchant_id)
        : null;
      const category = transaction.category_id
        ? categoryMap.get(transaction.category_id)
        : null;
      const subcategory = transaction.subcategory_id
        ? categoryMap.get(transaction.subcategory_id)
        : null;

      return {
        ...transaction,
        accountName: account?.name ?? "Unknown account",
        accountInstitution: account?.institution ?? null,
        merchantName: merchant?.name ?? null,
        categoryName: category?.name ?? null,
        subcategoryName: subcategory?.name ?? null,
      };
    });
  }, [accountMap, categoryMap, loadedTransactions, merchantMap]);
  const mobileGroups = useMemo(() => groupTransactionsByDate(rows), [rows]);

  const columns = useMemo<ColumnDef<TransactionFeedRow>[]>(
    () => [
      {
        accessorKey: "date",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Date
            <ArrowUpDownIcon />
          </Button>
        ),
        cell: ({ row }) => formatDate(row.original.date),
      },
      {
        accessorKey: "accountName",
        header: "Account",
        cell: ({ row }) => (
          <AccountBadge
            name={row.original.accountName}
            institution={row.original.accountInstitution}
            size="sm"
            showName
            className="max-w-[180px]"
          />
        ),
      },
      {
        id: "merchant",
        header: "Merchant / description",
        cell: ({ row }) => (
          <div className="max-w-[280px]">
            <div className="truncate font-medium">
              {row.original.merchantName ||
                row.original.description ||
                "No description"}
            </div>
            {row.original.merchantName && row.original.description ? (
              <div className="truncate text-xs text-muted-foreground">
                {row.original.description}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "amount",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Amount
            <ArrowUpDownIcon />
          </Button>
        ),
        cell: ({ row }) => {
          const color =
            row.original.type === "income"
              ? "text-emerald-600"
              : row.original.type === "expense"
                ? "text-red-600"
                : "text-foreground";

          return (
            <span className={`font-medium tabular ${color}`}>
              {formatMoney(row.original.amount)}
            </span>
          );
        },
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => (
          <Badge
            variant={row.original.type === "expense" ? "destructive" : "secondary"}
          >
            {displayTransactionType(row.original.type)}
          </Badge>
        ),
      },
      {
        accessorKey: "categoryName",
        header: "Category",
        cell: ({ row }) => (
          <QuickCategorySelect
            transaction={row.original}
            categories={categories.data ?? []}
            isSaving={updateTransactionCategory.isPending}
            onChange={async (categoryId) => {
              try {
                await updateTransactionCategory.mutateAsync({
                  id: row.original.id,
                  categoryId,
                });
                toast.success("Category updated");
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Could not update category",
                );
              }
            }}
          />
        ),
      },
      {
        accessorKey: "subcategoryName",
        header: "Subcategory",
        cell: ({ row }) => row.original.subcategoryName ?? "Uncategorised",
      },
      {
        accessorKey: "tax_deductible",
        header: "Tax",
        cell: ({ row }) =>
          row.original.tax_deductible ? (
            <Badge variant="outline">
              <CheckIcon />
              Deductible
            </Badge>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Open transaction actions"
                />
              }
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openEditDialog(row.original)}>
                <Edit2Icon />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDeletingTransaction(row.original)}
              >
                <Trash2Icon />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [categories.data, updateTransactionCategory],
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    manualFiltering: true,
    manualPagination: true,
    manualSorting: true,
    getCoreRowModel: getCoreRowModel(),
  });

  const isLoading =
    accounts.isLoading ||
    categories.isLoading ||
    transactions.isLoading ||
    merchants.isLoading;
  const hasAccounts = (accounts.data ?? []).length > 0;
  const hasLoadedTransactions = rows.length > 0;
  const hasActiveFilters =
    debouncedSearch.trim().length > 0 ||
    accountFilter !== "all" ||
    typeFilter !== "all" ||
    categoryFilter !== "all";
  const shouldShowEmptyState =
    !hasActiveFilters && !transactions.isLoading && totalTransactions === 0;
  const mobileLoadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const loadMoreNodes = [loadMoreRef.current, mobileLoadMoreRef.current].filter(
      (node): node is HTMLTableRowElement | HTMLDivElement => node !== null,
    );

    if (loadMoreNodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((entry) => entry.isIntersecting) &&
          hasNextPage &&
          !isFetchingNextPage
        ) {
          void fetchNextPage();
        }
      },
      { rootMargin: "240px" },
    );

    for (const loadMoreNode of loadMoreNodes) {
      observer.observe(loadMoreNode);
    }

    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const openCreateDialog = () => {
    setEditingTransaction(null);
    setIsFormOpen(true);
  };

  function openEditDialog(transaction: Transaction) {
    setEditingTransaction(transaction);
    setIsFormOpen(true);
  }

  const handleDelete = async () => {
    if (!deletingTransaction) return;

    try {
      await deleteTransaction.mutateAsync(deletingTransaction.id);
      toast.success("Transaction deleted");
      setDeletingTransaction(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete transaction",
      );
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description="Review, filter, and categorise your transaction feed."
      >
        <Button onClick={openCreateDialog} disabled={!hasAccounts}>
          <PlusIcon />
          Add transaction
        </Button>
      </PageHeader>

      {!isLoading && !hasAccounts ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>Create an account first</CardTitle>
            <CardDescription>
              Transactions need an account so each item can be linked to the right
              place.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button render={<Link href="/accounts" />}>Go to accounts</Button>
          </CardContent>
        </Card>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Feed</CardTitle>
              <CardDescription>
                Search descriptions, then narrow the list with filters.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <TransactionFilters
                search={search}
                onSearchChange={setSearch}
                accountFilter={accountFilter}
                onAccountFilterChange={setAccountFilter}
                typeFilter={typeFilter}
                onTypeFilterChange={setTypeFilter}
                categoryFilter={categoryFilter}
                onCategoryFilterChange={setCategoryFilter}
                accounts={accounts.data ?? []}
                categories={categories.data ?? []}
              />

              <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span className="tabular">
                  Showing {rows.length} of {totalTransactions}
                </span>
                <PageSizeSelect
                  pageSize={pageSize}
                  onPageSizeChange={setPageSize}
                />
              </div>

              {isLoading ? (
                <>
                  <div className="md:hidden">
                    <MobileTransactionsSkeleton />
                  </div>
                  <div className="hidden md:block">
                    <TransactionsSkeleton />
                  </div>
                </>
              ) : shouldShowEmptyState ? (
                <EmptyTransactionsState onAdd={openCreateDialog} />
              ) : hasLoadedTransactions || hasActiveFilters ? (
                <>
                  <MobileTransactionsList
                    groups={mobileGroups}
                    hasNextPage={hasNextPage}
                    isFetchingNextPage={isFetchingNextPage}
                    loadMoreRef={mobileLoadMoreRef}
                    onEdit={openEditDialog}
                  />
                  <div className="-mx-4 hidden overflow-x-auto sm:mx-0 md:block">
                    <div className="min-w-[760px] px-4 sm:min-w-0 sm:px-0">
                      <Table>
                        <TableHeader>
                          {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                              {headerGroup.headers.map((header) => (
                                <TableHead key={header.id}>
                                  {header.isPlaceholder
                                    ? null
                                    : flexRender(
                                        header.column.columnDef.header,
                                        header.getContext(),
                                      )}
                                </TableHead>
                              ))}
                            </TableRow>
                          ))}
                        </TableHeader>
                        <TableBody>
                          {table.getRowModel().rows.length > 0 ? (
                            table.getRowModel().rows.map((row) => (
                              <TableRow key={row.id}>
                                {row.getVisibleCells().map((cell) => (
                                  <TableCell key={cell.id}>
                                    {flexRender(
                                      cell.column.columnDef.cell,
                                      cell.getContext(),
                                    )}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell
                                colSpan={columns.length}
                                className="h-24 text-center text-muted-foreground"
                              >
                                No transactions match these filters.
                              </TableCell>
                            </TableRow>
                          )}
                          {hasNextPage ? (
                            <TableRow ref={loadMoreRef}>
                              <TableCell
                                colSpan={columns.length}
                                className="h-12 text-center text-muted-foreground"
                              >
                                {isFetchingNextPage
                                  ? "Loading more transactions..."
                                  : "Scroll to load more"}
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No transactions match these filters.
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      <TransactionFormDialog
        transaction={editingTransaction}
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        accounts={accounts.data ?? []}
        categories={categories.data ?? []}
        onSubmit={async (form) => {
          const amount = Number(form.amount);

          if (!form.accountId) {
            toast.error("Account is required");
            return;
          }

          if (!Number.isFinite(amount)) {
            toast.error("Amount must be a number");
            return;
          }

          const transaction = {
            account_id: form.accountId,
            date: form.date,
            description: form.description.trim() || null,
            amount,
            type: form.type,
            category_id: form.categoryId || null,
            subcategory_id: form.subcategoryId || null,
            tax_deductible: form.taxDeductible,
            notes: form.notes.trim() || null,
          };

          try {
            if (editingTransaction) {
              await updateTransaction.mutateAsync({
                id: editingTransaction.id,
                transaction,
              });
              toast.success("Transaction updated");
            } else {
              await createTransaction.mutateAsync(transaction);
              toast.success("Transaction added");
            }
            setIsFormOpen(false);
          } catch (error) {
            toast.error(
              error instanceof Error
                ? error.message
                : "Could not save transaction",
            );
          }
        }}
        isSaving={createTransaction.isPending || updateTransaction.isPending}
      />

      <DeleteTransactionDialog
        transaction={deletingTransaction}
        open={Boolean(deletingTransaction)}
        onOpenChange={(open) => {
          if (!open) setDeletingTransaction(null);
        }}
        onConfirm={handleDelete}
        isDeleting={deleteTransaction.isPending}
      />
    </div>
  );
}

function TransactionFilters({
  search,
  onSearchChange,
  accountFilter,
  onAccountFilterChange,
  typeFilter,
  onTypeFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  accounts,
  categories,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  accountFilter: string;
  onAccountFilterChange: (value: string) => void;
  typeFilter: string;
  onTypeFilterChange: (value: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  accounts: { id: string; name: string }[];
  categories: Category[];
}) {
  const categoryOptions = categories.filter(
    (category) => category.parent_id === null,
  );
  const accountFilterItems = {
    all: "All accounts",
    ...Object.fromEntries(accounts.map((a) => [a.id, a.name])),
  };
  const typeFilterItems = {
    all: "All types",
    ...Object.fromEntries(
      transactionTypes.map((t) => [t, displayTransactionType(t)]),
    ),
  };
  const categoryFilterItems = {
    all: "All categories",
    ...Object.fromEntries(categoryOptions.map((c) => [c.id, c.name])),
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(180px,1fr)_180px_160px_180px]">
      <Input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search description or merchant..."
      />

      <Select
        items={accountFilterItems}
        value={accountFilter}
        onValueChange={(value) => onAccountFilterChange(value ?? "all")}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All accounts</SelectItem>
          {accounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              {account.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        items={typeFilterItems}
        value={typeFilter}
        onValueChange={(value) => onTypeFilterChange(value ?? "all")}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          {transactionTypes.map((type) => (
            <SelectItem key={type} value={type}>
              {displayTransactionType(type)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        items={categoryFilterItems}
        value={categoryFilter}
        onValueChange={(value) => onCategoryFilterChange(value ?? "all")}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {categoryOptions.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function PageSizeSelect({
  pageSize,
  onPageSizeChange,
}: {
  pageSize: number;
  onPageSizeChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span>Rows per load</span>
      <Select
        value={String(pageSize)}
        onValueChange={(value) => onPageSizeChange(Number(value ?? 50))}
      >
        <SelectTrigger size="sm" className="w-[90px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {[25, 50, 100, 200].map((size) => (
            <SelectItem key={size} value={String(size)}>
              {size}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function QuickCategorySelect({
  transaction,
  categories,
  isSaving,
  onChange,
}: {
  transaction: TransactionFeedRow;
  categories: Category[];
  isSaving: boolean;
  onChange: (categoryId: string | null) => Promise<void>;
}) {
  const options = parentCategories(categories, toTransactionType(transaction.type));
  const value = transaction.category_id ?? unselectedValue;

  // Always include the currently-assigned category as an option, even if its
  // kind doesn't match the transaction's type — otherwise the Select has no
  // matching item and renders the raw id instead of the name.
  const current = transaction.category_id
    ? (categories.find((c) => c.id === transaction.category_id) ?? null)
    : null;
  const displayOptions =
    current && !options.some((o) => o.id === current.id)
      ? [current, ...options]
      : options;

  return (
    <Select
      value={value}
      onValueChange={(nextValue) =>
        onChange(nextValue === unselectedValue ? null : (nextValue ?? null))
      }
      disabled={isSaving}
      items={{
        [unselectedValue]: "Uncategorised",
        ...Object.fromEntries(
          displayOptions.map((category) => [category.id, category.name]),
        ),
      }}
    >
      <SelectTrigger size="sm" className="w-[150px]">
        <SelectValue placeholder="Uncategorised" />
      </SelectTrigger>
      <SelectContent align="start">
        <SelectItem value={unselectedValue}>Uncategorised</SelectItem>
        {displayOptions.map((category) => (
          <SelectItem key={category.id} value={category.id}>
            {category.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TransactionFormDialog({
  transaction,
  open,
  onOpenChange,
  accounts,
  categories,
  onSubmit,
  isSaving,
}: {
  transaction: Transaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: { id: string; name: string }[];
  categories: Category[];
  onSubmit: (form: TransactionFormState) => Promise<void>;
  isSaving: boolean;
}) {
  const defaultAccountId = accounts[0]?.id ?? "";
  const [form, setForm] = useState<TransactionFormState>(
    emptyTransactionForm(defaultAccountId),
  );
  const [wasOpen, setWasOpen] = useState(false);
  const categoryOptions = parentCategories(categories, form.type);
  const subcategoryOptions = subcategories(categories, form.categoryId);

  // Reset the form when the dialog opens — adjust state during render
  // (React-endorsed alternative to setState-in-effect).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(
        transaction
          ? transactionToForm(transaction)
          : emptyTransactionForm(defaultAccountId),
      );
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(form);
  };

  // value->label maps so base-ui Select triggers show names, not raw ids.
  const accountItems = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
  const typeItems = Object.fromEntries(
    transactionTypes.map((t) => [t, displayTransactionType(t)]),
  );
  const categoryItems = {
    [unselectedValue]: "Uncategorised",
    ...Object.fromEntries(categoryOptions.map((c) => [c.id, c.name])),
  };
  const subcategoryItems = {
    [unselectedValue]: "None",
    ...Object.fromEntries(subcategoryOptions.map((c) => [c.id, c.name])),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-x-hidden overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {transaction ? "Edit transaction" : "Add transaction"}
          </DialogTitle>
          <DialogDescription>
            Record the details, then choose the category that matches this item.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Account</Label>
              <Select
                items={accountItems}
                value={form.accountId}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, accountId: value ?? "" }))
                }
                disabled={accounts.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="transaction-date">Date</Label>
              <Input
                id="transaction-date"
                type="date"
                value={form.date}
                onChange={(event) =>
                  setForm((current) => ({ ...current, date: event.target.value }))
                }
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="transaction-description">Description</Label>
              <Input
                id="transaction-description"
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Coffee, salary, rent..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="transaction-amount">Amount</Label>
              <Input
                id="transaction-amount"
                type="number"
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
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                items={typeItems}
                value={form.type}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    type: toTransactionType(value ?? "expense"),
                    categoryId: "",
                    subcategoryId: "",
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {transactionTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {displayTransactionType(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                items={categoryItems}
                value={form.categoryId || unselectedValue}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    categoryId: value === unselectedValue ? "" : (value ?? ""),
                    subcategoryId: "",
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={unselectedValue}>Uncategorised</SelectItem>
                  {categoryOptions.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Subcategory</Label>
              <Select
                items={subcategoryItems}
                value={form.subcategoryId || unselectedValue}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    subcategoryId: value === unselectedValue ? "" : (value ?? ""),
                  }))
                }
                disabled={subcategoryOptions.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={unselectedValue}>None</SelectItem>
                  {subcategoryOptions.map((subcategory) => (
                    <SelectItem key={subcategory.id} value={subcategory.id}>
                      {subcategory.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-1">
              <Label>Tax deductible</Label>
              <p className="text-xs text-muted-foreground">
                Mark this if the transaction may be claimable at tax time.
              </p>
            </div>
            <Switch
              checked={form.taxDeductible}
              onCheckedChange={(checked) =>
                setForm((current) => ({ ...current, taxDeductible: checked }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="transaction-notes">Notes</Label>
            <Textarea
              id="transaction-notes"
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({ ...current, notes: event.target.value }))
              }
              placeholder="Optional extra details"
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
            <Button type="submit" disabled={isSaving || accounts.length === 0}>
              {isSaving ? "Saving..." : "Save transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteTransactionDialog({
  transaction,
  open,
  onOpenChange,
  onConfirm,
  isDeleting,
}: {
  transaction: Transaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  isDeleting: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete transaction?</DialogTitle>
          <DialogDescription>
            This removes{" "}
            {transaction?.description
              ? `"${transaction.description}"`
              : "this transaction"}{" "}
            from your feed.
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

function MobileTransactionsList({
  groups,
  hasNextPage,
  isFetchingNextPage,
  loadMoreRef,
  onEdit,
}: {
  groups: TransactionDateGroup[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  loadMoreRef: RefObject<HTMLDivElement | null>;
  onEdit: (transaction: Transaction) => void;
}) {
  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground md:hidden">
        No transactions match these filters.
      </div>
    );
  }

  return (
    // Break out of the card's px-4 so rows span the full card width with
    // symmetric left/right padding (native bank-app feel).
    <div className="-mx-4 border-y md:hidden">
      {groups.map((group) => (
        <section key={group.date}>
          <div className="flex items-center justify-between bg-muted/40 px-4 py-2">
            <h3 className="text-sm font-medium">{formatDate(group.date)}</h3>
            <span className="text-xs text-muted-foreground">
              {relativeDateHint(group.date)}
            </span>
          </div>
          <div className="divide-y border-y">
            {group.rows.map((transaction) => (
              <MobileTransactionRow
                key={transaction.id}
                transaction={transaction}
                onEdit={onEdit}
              />
            ))}
          </div>
        </section>
      ))}

      {hasNextPage ? (
        <div
          ref={loadMoreRef}
          className="px-4 py-3 text-center text-xs text-muted-foreground"
        >
          {isFetchingNextPage
            ? "Loading more transactions..."
            : "Scroll to load more"}
        </div>
      ) : null}
    </div>
  );
}

function MobileTransactionRow({
  transaction,
  onEdit,
}: {
  transaction: TransactionFeedRow;
  onEdit: (transaction: Transaction) => void;
}) {
  const title =
    transaction.merchantName || transaction.description || "No description";
  const amountColor =
    transaction.type === "income"
      ? "text-emerald-600"
      : transaction.type === "expense"
        ? "text-red-600"
        : "text-foreground";

  return (
    <button
      type="button"
      className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => onEdit(transaction)}
    >
      <AccountBadge
        name={transaction.accountName}
        institution={transaction.accountInstitution}
        size="sm"
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
          {title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">
            {transaction.categoryName ?? "Uncategorised"}
          </span>
          {transaction.tax_deductible ? (
            <Badge
              variant="outline"
              className="h-4 px-1.5 text-[10px] text-muted-foreground"
            >
              Tax
            </Badge>
          ) : null}
        </div>
      </div>
      <span className={`shrink-0 text-sm font-semibold tabular ${amountColor}`}>
        {formatMoney(transaction.amount)}
      </span>
    </button>
  );
}

function EmptyTransactionsState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-xl border border-dashed p-8 text-center">
      <h3 className="font-medium">No transactions yet</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Add your first transaction to start building a searchable feed.
      </p>
      <Button className="mt-4" onClick={onAdd}>
        <PlusIcon />
        Add transaction
      </Button>
    </div>
  );
}

function TransactionsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="grid grid-cols-6 gap-3">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="col-span-2 h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      ))}
    </div>
  );
}

function MobileTransactionsSkeleton() {
  return (
    <div className="space-y-3 rounded-xl border p-4">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex gap-3">
          <Skeleton className="h-6 w-6 rounded-md" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
