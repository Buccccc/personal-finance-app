"use client";

import { useState, type FormEvent } from "react";
import {
  CircleCheckIcon,
  Edit2Icon,
  PlusIcon,
  ScaleIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  accountTypes,
  formatAccountType,
  reconciliationFlagCopy,
  useAccountReconciliation,
  useAccounts,
  useCreateAccount,
  useDeleteAccount,
  useReconcileAccount,
  useUpdateAccount,
  type Account,
  type AccountReconciliation,
  type AccountType,
} from "@/lib/hooks/accounts";
import { AccountBadge } from "@/components/account-badge";
import { bankBrand } from "@/lib/bank-brand";
import { formatDate, formatMoney } from "@/lib/format";
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

type AccountFormState = {
  name: string;
  type: AccountType;
  institution: string;
  currency: string;
  balance: string;
  openingBalance: string;
  creditLimit: string;
};

const emptyAccountForm: AccountFormState = {
  name: "",
  type: "everyday",
  institution: "",
  currency: "AUD",
  balance: "",
  openingBalance: "",
  creditLimit: "",
};

/** Today in Melbourne, as YYYY-MM-DD, for defaulting the reconcile date. */
function todayISO() {
  return new Date().toLocaleDateString("en-CA");
}

function accountToForm(account: Account): AccountFormState {
  return {
    name: account.name,
    type: accountTypes.includes(account.type as AccountType)
      ? (account.type as AccountType)
      : "everyday",
    institution: account.institution ?? "",
    currency: account.currency || "AUD",
    balance: String(account.balance ?? 0),
    openingBalance: String(account.opening_balance ?? 0),
    creditLimit: account.credit_limit === null ? "" : String(account.credit_limit),
  };
}

/**
 * Balance and opening balance are two views of one number
 * (balance = opening_balance + sum of transactions), so sending both would be
 * ambiguous. Send whichever the user actually changed and let the DB derive
 * the other; if they touched both, the explicit opening balance wins because
 * it is the more deliberate edit.
 */
function normaliseAccountForm(form: AccountFormState, original: Account | null) {
  const balance = Number(form.balance);
  const openingBalance = Number(form.openingBalance);
  const creditLimit = form.creditLimit.trim() ? Number(form.creditLimit) : null;

  const base = {
    name: form.name.trim(),
    type: form.type,
    institution: form.institution.trim() || null,
    currency: form.currency.trim().toUpperCase() || "AUD",
    credit_limit:
      creditLimit !== null && Number.isFinite(creditLimit) ? creditLimit : null,
  };

  const safeBalance = Number.isFinite(balance) ? balance : 0;
  const safeOpening = Number.isFinite(openingBalance) ? openingBalance : 0;

  if (!original) return { ...base, balance: safeBalance };

  const openingChanged = safeOpening !== Number(original.opening_balance ?? 0);
  const balanceChanged = safeBalance !== Number(original.balance ?? 0);

  if (openingChanged) return { ...base, opening_balance: safeOpening };
  if (balanceChanged) return { ...base, balance: safeBalance };
  return base;
}

/** Errors are real problems; notices are hygiene. */
function hasErrors(row: AccountReconciliation | undefined) {
  return Boolean(row?.errors && row.errors.length > 0);
}

export function AccountsManager() {
  const accounts = useAccounts();
  const reconciliation = useAccountReconciliation();
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null);
  const [reconcilingAccount, setReconcilingAccount] = useState<Account | null>(null);

  const checks = reconciliation.data;
  const flagged = (accounts.data ?? []).filter((account) =>
    hasErrors(checks?.get(account.id)),
  );

  const openCreateDialog = () => {
    setEditingAccount(null);
    setIsFormOpen(true);
  };

  const openEditDialog = (account: Account) => {
    setEditingAccount(account);
    setIsFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingAccount) return;

    try {
      await deleteAccount.mutateAsync(deletingAccount.id);
      toast.success("Account deleted");
      setDeletingAccount(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete account");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
          <p className="text-muted-foreground">
            Manage the bank, card, cash, and e-cash accounts used by your transactions.
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <PlusIcon />
          Add account
        </Button>
      </div>

      {flagged.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TriangleAlertIcon className="size-4 text-destructive" />
              {flagged.length === 1
                ? "1 account needs a look"
                : `${flagged.length} accounts need a look`}
            </CardTitle>
            <CardDescription>
              These balances feed net worth, so a wrong one moves the headline
              figure silently.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {flagged.map((account) => {
              const row = checks?.get(account.id);
              return (
                <div key={account.id} className="text-sm">
                  <span className="font-medium">{account.name}</span>
                  <ul className="mt-1 space-y-1 text-muted-foreground">
                    {(row?.errors ?? []).map((flag) => (
                      <li key={flag}>
                        {reconciliationFlagCopy[flag] ?? flag}
                        {flag === "reconcile_drift" &&
                          row?.reconcile_drift !== null &&
                          row?.reconcile_drift !== undefined && (
                            <> Off by {formatMoney(row.reconcile_drift)}.</>
                          )}
                        {flag === "invariant_broken" &&
                          row?.invariant_drift !== null &&
                          row?.invariant_drift !== undefined && (
                            <> Off by {formatMoney(row.invariant_drift)}.</>
                          )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {accounts.isLoading ? (
        <AccountsSkeleton />
      ) : accounts.data && accounts.data.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {accounts.data.map((account) => (
            <Card
              key={account.id}
              className="lift border-l-4"
              style={{
                borderLeftColor: bankBrand(account.name, account.institution)
                  .bg,
              }}
            >
              <CardHeader>
                <div className="mb-1">
                  <AccountBadge
                    name={account.name}
                    institution={account.institution}
                  />
                </div>
                <CardTitle className="text-base">{account.name}</CardTitle>
                <CardDescription>
                  {account.institution || "No institution saved"}
                </CardDescription>
                <CardAction className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Reconcile ${account.name}`}
                    onClick={() => setReconcilingAccount(account)}
                  >
                    <ScaleIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${account.name}`}
                    onClick={() => openEditDialog(account)}
                  >
                    <Edit2Icon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${account.name}`}
                    onClick={() => setDeletingAccount(account)}
                  >
                    <Trash2Icon />
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-3">
                {account.type === "credit_card" ? (
                  (() => {
                    const limit = account.credit_limit ?? 0;
                    const owed = -(account.balance ?? 0);
                    const available = limit - owed;
                    return (
                      <div className="space-y-1">
                        <div className="flex items-baseline justify-between">
                          <span className="text-xs text-muted-foreground">
                            Available
                          </span>
                          <span className="tabular text-lg font-semibold">
                            {formatMoney(available)}
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                          <span>Owed {formatMoney(owed)}</span>
                          <span>
                            Limit{" "}
                            {account.credit_limit === null
                              ? "—"
                              : formatMoney(limit)}
                          </span>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-muted-foreground">Balance</span>
                    <span className="tabular text-lg font-semibold">
                      {formatMoney(account.balance)}
                    </span>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{formatAccountType(account.type)}</Badge>
                  <Badge variant="outline">{account.currency}</Badge>
                  {hasErrors(checks?.get(account.id)) && (
                    <Badge variant="destructive" className="gap-1">
                      <TriangleAlertIcon className="size-3" />
                      Check
                    </Badge>
                  )}
                </div>
                <ReconcileSummary row={checks?.get(account.id)} />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>Add your first account</CardTitle>
            <CardDescription>
              Accounts are needed before you can record transactions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={openCreateDialog}>
              <PlusIcon />
              Add account
            </Button>
          </CardContent>
        </Card>
      )}

      {accounts.isError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent>
            <p className="text-sm text-destructive">
              {accounts.error instanceof Error
                ? accounts.error.message
                : "Could not load accounts."}
            </p>
          </CardContent>
        </Card>
      )}

      <AccountFormDialog
        account={editingAccount}
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSubmit={async (form) => {
          const account = normaliseAccountForm(form, editingAccount);

          if (!account.name) {
            toast.error("Account name is required");
            return;
          }

          try {
            if (editingAccount) {
              await updateAccount.mutateAsync({ id: editingAccount.id, account });
              toast.success("Account updated");
            } else {
              await createAccount.mutateAsync(account);
              toast.success("Account created");
            }
            setIsFormOpen(false);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not save account");
          }
        }}
        isSaving={createAccount.isPending || updateAccount.isPending}
      />

      <ReconcileDialog
        account={reconcilingAccount}
        row={
          reconcilingAccount ? checks?.get(reconcilingAccount.id) : undefined
        }
        open={Boolean(reconcilingAccount)}
        onOpenChange={(open) => {
          if (!open) setReconcilingAccount(null);
        }}
      />

      <DeleteAccountDialog
        account={deletingAccount}
        open={Boolean(deletingAccount)}
        onOpenChange={(open) => {
          if (!open) setDeletingAccount(null);
        }}
        onConfirm={handleDelete}
        isDeleting={deleteAccount.isPending}
      />
    </div>
  );
}

/**
 * The quiet line under each card: when the balance was last confirmed against
 * the real bank, and by how much the ledger disagreed at that point.
 */
function ReconcileSummary({ row }: { row: AccountReconciliation | undefined }) {
  if (!row) return null;

  if (!row.reconciled_at) {
    return (
      <p className="text-xs text-muted-foreground">
        Never checked against the bank.
      </p>
    );
  }

  const drift = Number(row.reconcile_drift ?? 0);
  const clean = drift === 0;

  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {clean ? (
        <CircleCheckIcon className="size-3 text-emerald-600" />
      ) : (
        <TriangleAlertIcon className="size-3 text-destructive" />
      )}
      {clean ? "Matched the bank" : `Off the bank by ${formatMoney(drift)}`} on{" "}
      {formatDate(row.reconciled_at)}
      {row.notices?.includes("txns_since_reconcile") && " (activity since)"}
    </p>
  );
}

/**
 * Records what the bank actually showed on a date. This is the only check that
 * can catch missing or duplicated transactions — the derived-balance triggers
 * guarantee internal consistency, not truth.
 */
function ReconcileDialog({
  account,
  row,
  open,
  onOpenChange,
}: {
  account: Account | null;
  row: AccountReconciliation | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const reconcile = useReconcileAccount();
  const [balance, setBalance] = useState("");
  const [date, setDate] = useState(todayISO());
  const [wasOpen, setWasOpen] = useState(false);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setBalance(
        account?.reconciled_balance !== null &&
          account?.reconciled_balance !== undefined
          ? String(account.reconciled_balance)
          : String(account?.balance ?? ""),
      );
      setDate(account?.reconciled_at ?? todayISO());
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!account) return;

    const value = Number(balance);
    if (!Number.isFinite(value)) {
      toast.error("Balance must be a number");
      return;
    }

    try {
      await reconcile.mutateAsync({ id: account.id, balance: value, date });
      toast.success("Reconciliation saved");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save reconciliation",
      );
    }
  };

  const handleClear = async () => {
    if (!account) return;
    try {
      await reconcile.mutateAsync({ id: account.id, balance: null, date: null });
      toast.success("Reconciliation cleared");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not clear reconciliation",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reconcile against the bank</DialogTitle>
          <DialogDescription>
            Enter the balance {account?.name ?? "this account"} actually showed
            in the bank on a given date. If it disagrees with the ledger,
            transactions are missing or duplicated.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="reconcile-date">As at</Label>
              <Input
                id="reconcile-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reconcile-balance">Balance the bank showed</Label>
              <Input
                id="reconcile-balance"
                type="number"
                step="0.01"
                value={balance}
                onChange={(event) => setBalance(event.target.value)}
                placeholder="0.00"
                required
              />
            </div>
          </div>

          {row && (
            <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Opening balance</span>
                <span className="tabular">{formatMoney(row.opening_balance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Transactions ({row.txn_count ?? 0})
                </span>
                <span className="tabular">{formatMoney(row.txn_total)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Ledger balance now</span>
                <span className="tabular">{formatMoney(row.balance)}</span>
              </div>
              {row.reconciled_at && (
                <div className="flex justify-between border-t pt-1">
                  <span className="text-muted-foreground">
                    Last checked {formatDate(row.reconciled_at)}
                  </span>
                  <span className="tabular">
                    {Number(row.reconcile_drift ?? 0) === 0
                      ? "matched"
                      : `off by ${formatMoney(row.reconcile_drift)}`}
                  </span>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={handleClear}
              disabled={reconcile.isPending || !account?.reconciled_at}
            >
              Clear
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={reconcile.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={reconcile.isPending}>
                {reconcile.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AccountFormDialog({
  account,
  open,
  onOpenChange,
  onSubmit,
  isSaving,
}: {
  account: Account | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (form: AccountFormState) => Promise<void>;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<AccountFormState>(emptyAccountForm);
  const [wasOpen, setWasOpen] = useState(false);
  const accountTypeItems = Object.fromEntries(
    accountTypes.map((type) => [type, formatAccountType(type)]),
  );

  // Reset the form when the dialog opens — adjust state during render
  // (React-endorsed alternative to setState-in-effect).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(account ? accountToForm(account) : emptyAccountForm);
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{account ? "Edit account" : "Add account"}</DialogTitle>
          <DialogDescription>
            Save the account details you want to use in your finance records.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="account-name">Name</Label>
            <Input
              id="account-name"
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Everyday account"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                items={accountTypeItems}
                value={form.type}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    type: (value ?? "everyday") as AccountType,
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accountTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {formatAccountType(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="account-currency">Currency</Label>
              <Input
                id="account-currency"
                value={form.currency}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    currency: event.target.value,
                  }))
                }
                maxLength={3}
                placeholder="AUD"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="account-institution">Institution</Label>
            <Input
              id="account-institution"
              value={form.institution}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  institution: event.target.value,
                }))
              }
              placeholder="Bank name, card provider, or leave blank"
            />
          </div>

          {form.type === "credit_card" && (
            <div className="space-y-2">
              <Label htmlFor="account-limit">Credit limit</Label>
              <Input
                id="account-limit"
                type="number"
                step="0.01"
                value={form.creditLimit}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    creditLimit: event.target.value,
                  }))
                }
                placeholder="2500"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="account-balance">
              {form.type === "credit_card" ? "Current balance (negative if owing)" : "Current balance"}
            </Label>
            <Input
              id="account-balance"
              type="number"
              step="0.01"
              value={form.balance}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  balance: event.target.value,
                }))
              }
              placeholder="0.00"
            />
            <p className="text-xs text-muted-foreground">
              {form.type === "credit_card"
                ? "Derived as opening balance plus every transaction (owed = −balance). Set it here to state the true balance; the opening balance adjusts to match."
                : "Derived as opening balance plus every transaction. Set it here to state the true balance; the opening balance adjusts to match."}
            </p>
          </div>

          {account && (
            <div className="space-y-2">
              <Label htmlFor="account-opening-balance">Opening balance</Label>
              <Input
                id="account-opening-balance"
                type="number"
                step="0.01"
                value={form.openingBalance}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    openingBalance: event.target.value,
                  }))
                }
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">
                What the account held before its first tracked transaction. Any
                account whose imported history starts mid-life has a non-zero
                opening balance. Change this only if you know the real starting
                figure — the current balance will move with it.
              </p>
            </div>
          )}

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
              {isSaving ? "Saving..." : "Save account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteAccountDialog({
  account,
  open,
  onOpenChange,
  onConfirm,
  isDeleting,
}: {
  account: Account | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  isDeleting: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete account?</DialogTitle>
          <DialogDescription>
            This removes {account ? `"${account.name}"` : "this account"}. If it has
            transactions, the database may prevent deletion.
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

function AccountsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <Card key={index}>
          <CardHeader>
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
