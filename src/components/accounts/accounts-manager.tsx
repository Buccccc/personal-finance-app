"use client";

import { useState, type FormEvent } from "react";
import { Edit2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  accountTypes,
  formatAccountType,
  useAccounts,
  useAccountTxnTotals,
  useCreateAccount,
  useDeleteAccount,
  useUpdateAccount,
  type Account,
  type AccountType,
} from "@/lib/hooks/accounts";
import { AccountBadge } from "@/components/account-badge";
import { bankBrand } from "@/lib/bank-brand";
import { formatMoney } from "@/lib/format";
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
  creditLimit: string;
};

const emptyAccountForm: AccountFormState = {
  name: "",
  type: "everyday",
  institution: "",
  currency: "AUD",
  balance: "",
  creditLimit: "",
};

function accountToForm(account: Account): AccountFormState {
  return {
    name: account.name,
    type: accountTypes.includes(account.type as AccountType)
      ? (account.type as AccountType)
      : "everyday",
    institution: account.institution ?? "",
    currency: account.currency || "AUD",
    balance: String(account.balance ?? 0),
    creditLimit: account.credit_limit === null ? "" : String(account.credit_limit),
  };
}

function normaliseAccountForm(form: AccountFormState) {
  const balance = Number(form.balance);
  const creditLimit = form.creditLimit.trim() ? Number(form.creditLimit) : null;
  return {
    name: form.name.trim(),
    type: form.type,
    institution: form.institution.trim() || null,
    currency: form.currency.trim().toUpperCase() || "AUD",
    balance: Number.isFinite(balance) ? balance : 0,
    credit_limit:
      creditLimit !== null && Number.isFinite(creditLimit) ? creditLimit : null,
  };
}

export function AccountsManager() {
  const accounts = useAccounts();
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();
  const txnTotals = useAccountTxnTotals();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null);

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
                    const owed = -(txnTotals.data?.get(account.id) ?? 0);
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
                </div>
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
          const account = normaliseAccountForm(form);

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

          {form.type === "credit_card" ? (
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
              <p className="text-xs text-muted-foreground">
                Available credit = limit − amount owed (from card transactions).
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="account-balance">Current balance</Label>
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
                Updated automatically from the latest CSV import; edit to correct.
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
