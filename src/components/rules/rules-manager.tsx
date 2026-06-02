"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  Edit2Icon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  useCategories,
  type Category,
} from "@/lib/hooks/categories";
import {
  ruleMatchTypes,
  runRuleScopes,
  useCategorisationRules,
  useCreateCategorisationRule,
  useDeleteCategorisationRule,
  useRunCategorisationRules,
  useUpdateCategorisationRule,
  type CategorisationRule,
  type RuleInsert,
  type RuleMatchType,
  type RunRuleScope,
} from "@/lib/hooks/rules";
import {
  useAdminMerchants,
  useCreateMerchant,
  useCreateMerchantAlias,
  useDeleteMerchant,
  useDeleteMerchantAlias,
  useMerchantAliases,
  useUpdateMerchant,
  type Merchant,
  type MerchantAlias,
  type MerchantInsert,
} from "@/lib/hooks/merchants-admin";
import { PageHeader } from "@/components/app-shell/page-header";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const unselectedValue = "__none__";

type RuleFormState = {
  matchType: RuleMatchType;
  pattern: string;
  amountMin: string;
  amountMax: string;
  merchantId: string;
  categoryId: string;
  subcategoryId: string;
  taxMode: "none" | "true";
  priority: string;
  active: boolean;
};

type MerchantFormState = {
  name: string;
  defaultCategoryId: string;
};

type CategoryLookup = {
  categoriesById: Map<Category["id"], Category>;
  parentCategories: Category[];
  subcategoriesByParentId: Map<Category["id"], Category[]>;
};

export function RulesManager() {
  const rules = useCategorisationRules();
  const merchants = useAdminMerchants();
  const aliases = useMerchantAliases();
  const categories = useCategories();
  const runRules = useRunCategorisationRules();
  const [runScope, setRunScope] = useState<RunRuleScope>("uncategorised");
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CategorisationRule | null>(null);
  const [merchantDialogOpen, setMerchantDialogOpen] = useState(false);
  const [editingMerchant, setEditingMerchant] = useState<Merchant | null>(null);

  const categoryLookup = useMemo(
    () => buildCategoryLookup(categories.data ?? []),
    [categories.data],
  );
  const merchantById = useMemo(
    () => new Map((merchants.data ?? []).map((merchant) => [merchant.id, merchant])),
    [merchants.data],
  );
  const runScopeItems = Object.fromEntries(
    runRuleScopes.map((scope) => [
      scope,
      scope === "uncategorised" ? "Uncategorised only" : "All transactions",
    ]),
  );

  const isLoading =
    rules.isLoading ||
    merchants.isLoading ||
    aliases.isLoading ||
    categories.isLoading;
  const loadError =
    rules.error ?? merchants.error ?? aliases.error ?? categories.error;

  async function handleRunRules() {
    try {
      const summary = await runRules.mutateAsync(runScope);
      toast.success(
        `Categorised ${summary.categorised} of ${summary.total}, set merchant on ${summary.merchantSet}`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not run rules"));
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Rules & Merchants"
        description="Build deterministic rules for categorising transactions, then keep merchant names and aliases tidy."
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            items={runScopeItems}
            value={runScope}
            onValueChange={(value) => {
              if (isRunRuleScope(value)) setRunScope(value);
            }}
          >
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="uncategorised">Uncategorised only</SelectItem>
              <SelectItem value="all">All transactions</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleRunRules} disabled={runRules.isPending}>
            <PlayIcon />
            {runRules.isPending ? "Running..." : "Run rules now"}
          </Button>
        </div>
      </PageHeader>

      {loadError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent>
            <p className="text-sm text-destructive">
              {getErrorMessage(loadError, "Could not load rules data")}
            </p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="merchants">Merchants</TabsTrigger>
        </TabsList>

        <TabsContent value="rules">
          <Card>
            <CardHeader>
              <CardTitle>Categorisation rules</CardTitle>
              <CardDescription>
                Lower priority numbers run first. The first matching rule wins.
              </CardDescription>
              <CardAction>
                <Button
                  onClick={() => {
                    setEditingRule(null);
                    setRuleDialogOpen(true);
                  }}
                >
                  <PlusIcon />
                  Add rule
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <RulesSkeleton />
              ) : (
                <RulesTable
                  rules={rules.data ?? []}
                  categoryLookup={categoryLookup}
                  merchantById={merchantById}
                  onEdit={(rule) => {
                    setEditingRule(rule);
                    setRuleDialogOpen(true);
                  }}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="merchants">
          <Card>
            <CardHeader>
              <CardTitle>Merchants</CardTitle>
              <CardDescription>
                Default categories and aliases help future imports match cleanly.
              </CardDescription>
              <CardAction>
                <Button
                  onClick={() => {
                    setEditingMerchant(null);
                    setMerchantDialogOpen(true);
                  }}
                >
                  <PlusIcon />
                  Add merchant
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <MerchantsSkeleton />
              ) : (
                <MerchantsList
                  merchants={merchants.data ?? []}
                  aliases={aliases.data ?? []}
                  categoryLookup={categoryLookup}
                  onEdit={(merchant) => {
                    setEditingMerchant(merchant);
                    setMerchantDialogOpen(true);
                  }}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <RuleDialog
        open={ruleDialogOpen}
        onOpenChange={setRuleDialogOpen}
        rule={editingRule}
        nextPriority={(rules.data?.length ?? 0) + 1}
        merchants={merchants.data ?? []}
        categoryLookup={categoryLookup}
      />

      <MerchantDialog
        open={merchantDialogOpen}
        onOpenChange={setMerchantDialogOpen}
        merchant={editingMerchant}
        categoryLookup={categoryLookup}
      />
    </main>
  );
}

function RulesTable({
  rules,
  categoryLookup,
  merchantById,
  onEdit,
}: {
  rules: CategorisationRule[];
  categoryLookup: CategoryLookup;
  merchantById: Map<Merchant["id"], Merchant>;
  onEdit: (rule: CategorisationRule) => void;
}) {
  const deleteRule = useDeleteCategorisationRule();

  if (rules.length === 0) {
    return (
      <EmptyState
        title="No rules yet"
        description="Add your first rule to automatically categorise matching transactions."
      />
    );
  }

  async function handleDelete(rule: CategorisationRule) {
    try {
      await deleteRule.mutateAsync(rule.id);
      toast.success("Rule deleted");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not delete rule"));
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Priority</TableHead>
          <TableHead>Match</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Tax</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rules.map((rule) => (
          <TableRow key={rule.id}>
            <TableCell className="tabular">{rule.priority}</TableCell>
            <TableCell>
              <div className="space-y-1">
                <div className="font-medium">{formatMatchType(rule.match_type)}</div>
                <div className="max-w-sm whitespace-normal text-xs text-muted-foreground">
                  {describeRuleMatch(rule, merchantById)}
                </div>
              </div>
            </TableCell>
            <TableCell>
              {formatCategoryPair(
                rule.category_id,
                rule.subcategory_id,
                categoryLookup,
              )}
            </TableCell>
            <TableCell>
              {rule.set_tax_deductible === true ? "Set true" : "Leave"}
            </TableCell>
            <TableCell>
              <Badge variant={rule.active ? "default" : "outline"}>
                {rule.active ? "Active" : "Paused"}
              </Badge>
            </TableCell>
            <TableCell>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="icon-sm" onClick={() => onEdit(rule)}>
                  <Edit2Icon />
                  <span className="sr-only">Edit rule</span>
                </Button>
                <Button
                  variant="destructive"
                  size="icon-sm"
                  onClick={() => void handleDelete(rule)}
                  disabled={deleteRule.isPending}
                >
                  <Trash2Icon />
                  <span className="sr-only">Delete rule</span>
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function RuleDialog({
  open,
  onOpenChange,
  rule,
  nextPriority,
  merchants,
  categoryLookup,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: CategorisationRule | null;
  nextPriority: number;
  merchants: Merchant[];
  categoryLookup: CategoryLookup;
}) {
  const createRule = useCreateCategorisationRule();
  const updateRule = useUpdateCategorisationRule();
  const [form, setForm] = useState<RuleFormState>(() =>
    ruleToForm(rule, nextPriority),
  );
  const [wasOpen, setWasOpen] = useState(open);
  const isSaving = createRule.isPending || updateRule.isPending;
  const subcategoryOptions = form.categoryId
    ? (categoryLookup.subcategoriesByParentId.get(form.categoryId) ?? [])
    : [];
  const showPattern =
    form.matchType === "description_contains" || form.matchType === "combo";
  const showAmount = form.matchType === "amount" || form.matchType === "combo";
  const showMerchant = form.matchType === "merchant" || form.matchType === "combo";
  const matchTypeItems = Object.fromEntries(
    ruleMatchTypes.map((matchType) => [matchType, formatMatchType(matchType)]),
  );
  const merchantItems = {
    [unselectedValue]: form.matchType === "combo" ? "Any merchant" : "Choose merchant",
    ...Object.fromEntries(
      merchants.map((merchant) => [merchant.id, merchant.name]),
    ),
  };
  const categoryItems = {
    [unselectedValue]: "Leave category",
    ...Object.fromEntries(
      categoryLookup.parentCategories.map((category) => [
        category.id,
        category.name,
      ]),
    ),
  };
  const subcategoryItems = {
    [unselectedValue]: "Leave subcategory",
    ...Object.fromEntries(
      subcategoryOptions.map((subcategory) => [subcategory.id, subcategory.name]),
    ),
  };
  const taxModeItems = {
    none: "Leave unchanged",
    "true": "Set true",
  };

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(ruleToForm(rule, nextPriority));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validateRuleForm(form);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const payload = ruleFormToPayload(form);

    try {
      if (rule) {
        await updateRule.mutateAsync({ id: rule.id, rule: payload });
        toast.success("Rule updated");
      } else {
        await createRule.mutateAsync(payload);
        toast.success("Rule created");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not save rule"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit rule" : "Add rule"}</DialogTitle>
          <DialogDescription>
            Choose what should match, then choose what values the rule should set.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Match type</Label>
              <Select
                items={matchTypeItems}
                value={form.matchType}
                onValueChange={(value) => {
                  if (!isRuleMatchType(value)) return;
                  setForm((current) => ({
                    ...current,
                    matchType: value,
                    subcategoryId: current.categoryId ? current.subcategoryId : "",
                  }));
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ruleMatchTypes.map((matchType) => (
                    <SelectItem key={matchType} value={matchType}>
                      {formatMatchType(matchType)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rule-priority">Priority</Label>
              <Input
                id="rule-priority"
                type="number"
                min="0"
                step="1"
                value={form.priority}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    priority: event.target.value,
                  }))
                }
                required
              />
            </div>
          </div>

          {showMerchant && (
            <div className="space-y-2">
              <Label>Merchant</Label>
              <Select
                items={merchantItems}
                value={form.merchantId || unselectedValue}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    merchantId: value === unselectedValue ? "" : (value ?? ""),
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={unselectedValue}>
                    {form.matchType === "combo" ? "Any merchant" : "Choose merchant"}
                  </SelectItem>
                  {merchants.map((merchant) => (
                    <SelectItem key={merchant.id} value={merchant.id}>
                      {merchant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showPattern && (
            <div className="space-y-2">
              <Label htmlFor="rule-pattern">Description contains</Label>
              <Input
                id="rule-pattern"
                value={form.pattern}
                onChange={(event) =>
                  setForm((current) => ({ ...current, pattern: event.target.value }))
                }
                placeholder="Example: woolworths"
              />
            </div>
          )}

          {showAmount && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rule-amount-min">Amount minimum</Label>
                <Input
                  id="rule-amount-min"
                  type="number"
                  step="0.01"
                  value={form.amountMin}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      amountMin: event.target.value,
                    }))
                  }
                  placeholder="No minimum"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-amount-max">Amount maximum</Label>
                <Input
                  id="rule-amount-max"
                  type="number"
                  step="0.01"
                  value={form.amountMax}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      amountMax: event.target.value,
                    }))
                  }
                  placeholder="No maximum"
                />
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
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
                  <SelectItem value={unselectedValue}>Leave category</SelectItem>
                  {categoryLookup.parentCategories.map((category) => (
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
                  <SelectItem value={unselectedValue}>Leave subcategory</SelectItem>
                  {subcategoryOptions.map((subcategory) => (
                    <SelectItem key={subcategory.id} value={subcategory.id}>
                      {subcategory.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tax deductible</Label>
              <Select
                items={taxModeItems}
                value={form.taxMode}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    taxMode: value === "true" ? "true" : "none",
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Leave unchanged</SelectItem>
                  <SelectItem value="true">Set true</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-1">
              <Label>Active</Label>
              <p className="text-xs text-muted-foreground">
                Turn this off to keep the rule without running it.
              </p>
            </div>
            <Switch
              checked={form.active}
              onCheckedChange={(checked) =>
                setForm((current) => ({ ...current, active: checked }))
              }
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
              {isSaving ? "Saving..." : "Save rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MerchantsList({
  merchants,
  aliases,
  categoryLookup,
  onEdit,
}: {
  merchants: Merchant[];
  aliases: MerchantAlias[];
  categoryLookup: CategoryLookup;
  onEdit: (merchant: Merchant) => void;
}) {
  if (merchants.length === 0) {
    return (
      <EmptyState
        title="No merchants yet"
        description="Add merchants, then attach aliases that appear in transaction descriptions."
      />
    );
  }

  const aliasesByMerchantId = new Map<Merchant["id"], MerchantAlias[]>();
  for (const alias of aliases) {
    const current = aliasesByMerchantId.get(alias.merchant_id) ?? [];
    current.push(alias);
    aliasesByMerchantId.set(alias.merchant_id, current);
  }

  return (
    <div className="grid gap-4">
      {merchants.map((merchant) => (
        <MerchantCard
          key={merchant.id}
          merchant={merchant}
          aliases={aliasesByMerchantId.get(merchant.id) ?? []}
          categoryLookup={categoryLookup}
          onEdit={() => onEdit(merchant)}
        />
      ))}
    </div>
  );
}

function MerchantCard({
  merchant,
  aliases,
  categoryLookup,
  onEdit,
}: {
  merchant: Merchant;
  aliases: MerchantAlias[];
  categoryLookup: CategoryLookup;
  onEdit: () => void;
}) {
  const createAlias = useCreateMerchantAlias();
  const deleteAlias = useDeleteMerchantAlias();
  const deleteMerchant = useDeleteMerchant();
  const [pattern, setPattern] = useState("");

  async function handleAddAlias(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedPattern = pattern.trim();
    if (!trimmedPattern) {
      toast.error("Add an alias pattern first");
      return;
    }

    try {
      await createAlias.mutateAsync({
        merchant_id: merchant.id,
        pattern: trimmedPattern,
      });
      setPattern("");
      toast.success("Alias added");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not add alias"));
    }
  }

  async function handleDeleteAlias(alias: MerchantAlias) {
    try {
      await deleteAlias.mutateAsync(alias.id);
      toast.success("Alias removed");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not remove alias"));
    }
  }

  async function handleDeleteMerchant() {
    try {
      await deleteMerchant.mutateAsync(merchant.id);
      toast.success("Merchant deleted");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not delete merchant"));
    }
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h3 className="font-medium">{merchant.name}</h3>
          <p className="text-sm text-muted-foreground">
            Default category:{" "}
            {formatCategoryPair(merchant.default_category_id, null, categoryLookup)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Edit2Icon />
            Edit
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => void handleDeleteMerchant()}
            disabled={deleteMerchant.isPending}
          >
            <Trash2Icon />
            Delete
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {aliases.length === 0 ? (
            <span className="text-sm text-muted-foreground">No aliases yet.</span>
          ) : (
            aliases.map((alias) => (
              <Badge key={alias.id} variant="outline" className="gap-1">
                {alias.pattern}
                <button
                  type="button"
                  className="rounded-full text-muted-foreground hover:text-foreground"
                  onClick={() => void handleDeleteAlias(alias)}
                  disabled={deleteAlias.isPending}
                >
                  <XIcon className="size-3" />
                  <span className="sr-only">Remove alias</span>
                </button>
              </Badge>
            ))
          )}
        </div>

        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleAddAlias}>
          <Input
            value={pattern}
            onChange={(event) => setPattern(event.target.value)}
            placeholder="Alias pattern, e.g. SQ *CAFE"
          />
          <Button type="submit" variant="secondary" disabled={createAlias.isPending}>
            <PlusIcon />
            Add alias
          </Button>
        </form>
      </div>
    </div>
  );
}

function MerchantDialog({
  open,
  onOpenChange,
  merchant,
  categoryLookup,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  merchant: Merchant | null;
  categoryLookup: CategoryLookup;
}) {
  const createMerchant = useCreateMerchant();
  const updateMerchant = useUpdateMerchant();
  const [form, setForm] = useState<MerchantFormState>(() =>
    merchantToForm(merchant),
  );
  const [wasOpen, setWasOpen] = useState(open);
  const isSaving = createMerchant.isPending || updateMerchant.isPending;
  const defaultCategoryItems = {
    [unselectedValue]: "No default category",
    ...Object.fromEntries(
      categoryLookup.parentCategories.map((category) => [
        category.id,
        category.name,
      ]),
    ),
  };

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(merchantToForm(merchant));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = merchantFormToPayload(form);

    if (!payload.name) {
      toast.error("Merchant name is required");
      return;
    }

    try {
      if (merchant) {
        await updateMerchant.mutateAsync({ id: merchant.id, merchant: payload });
        toast.success("Merchant updated");
      } else {
        await createMerchant.mutateAsync(payload);
        toast.success("Merchant created");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not save merchant"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{merchant ? "Edit merchant" : "Add merchant"}</DialogTitle>
          <DialogDescription>
            A default category is optional and only fills uncategorised transactions.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="merchant-name">Name</Label>
            <Input
              id="merchant-name"
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Merchant name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Default category</Label>
            <Select
              items={defaultCategoryItems}
              value={form.defaultCategoryId || unselectedValue}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  defaultCategoryId: value === unselectedValue ? "" : (value ?? ""),
                }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={unselectedValue}>No default category</SelectItem>
                {categoryLookup.parentCategories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
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
              {isSaving ? "Saving..." : "Save merchant"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RulesSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}

function MerchantsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton key={index} className="h-28 w-full" />
      ))}
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <h3 className="font-medium">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function buildCategoryLookup(categories: Category[]): CategoryLookup {
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const parentCategories = categories.filter((category) => !category.parent_id);
  const subcategoriesByParentId = new Map<Category["id"], Category[]>();

  for (const category of categories) {
    if (!category.parent_id) continue;
    const current = subcategoriesByParentId.get(category.parent_id) ?? [];
    current.push(category);
    subcategoriesByParentId.set(category.parent_id, current);
  }

  return {
    categoriesById,
    parentCategories,
    subcategoriesByParentId,
  };
}

function ruleToForm(
  rule: CategorisationRule | null,
  nextPriority: number,
): RuleFormState {
  return {
    matchType: toRuleMatchType(rule?.match_type),
    pattern: rule?.pattern ?? "",
    amountMin: numberToInput(rule?.amount_min),
    amountMax: numberToInput(rule?.amount_max),
    merchantId: rule?.merchant_id ?? "",
    categoryId: rule?.category_id ?? "",
    subcategoryId: rule?.subcategory_id ?? "",
    taxMode: rule?.set_tax_deductible === true ? "true" : "none",
    priority: String(rule?.priority ?? nextPriority),
    active: rule?.active ?? true,
  };
}

function ruleFormToPayload(form: RuleFormState): RuleInsert {
  const basePayload: RuleInsert = {
    match_type: form.matchType,
    pattern: null,
    amount_min: null,
    amount_max: null,
    merchant_id: null,
    category_id: form.categoryId || null,
    subcategory_id: form.subcategoryId || null,
    set_tax_deductible: form.taxMode === "true" ? true : null,
    priority: Number(form.priority),
    active: form.active,
  };

  if (form.matchType === "merchant") {
    return {
      ...basePayload,
      merchant_id: form.merchantId || null,
    };
  }

  if (form.matchType === "description_contains") {
    return {
      ...basePayload,
      pattern: form.pattern.trim(),
    };
  }

  if (form.matchType === "amount") {
    return {
      ...basePayload,
      amount_min: inputToNumber(form.amountMin),
      amount_max: inputToNumber(form.amountMax),
    };
  }

  return {
    ...basePayload,
    pattern: form.pattern.trim(),
    amount_min: inputToNumber(form.amountMin),
    amount_max: inputToNumber(form.amountMax),
    merchant_id: form.merchantId || null,
  };
}

function merchantToForm(merchant: Merchant | null): MerchantFormState {
  return {
    name: merchant?.name ?? "",
    defaultCategoryId: merchant?.default_category_id ?? "",
  };
}

function merchantFormToPayload(form: MerchantFormState): MerchantInsert {
  return {
    name: form.name.trim(),
    default_category_id: form.defaultCategoryId || null,
  };
}

function validateRuleForm(form: RuleFormState) {
  if (!Number.isFinite(Number(form.priority))) {
    return "Priority must be a number";
  }

  if (form.matchType === "merchant" && !form.merchantId) {
    return "Choose a merchant for this rule";
  }

  if (
    (form.matchType === "description_contains" || form.matchType === "combo") &&
    !form.pattern.trim()
  ) {
    return "Add text for the description match";
  }

  if (form.matchType === "amount" || form.matchType === "combo") {
    const hasMinimum = form.amountMin.trim().length > 0;
    const hasMaximum = form.amountMax.trim().length > 0;

    if (!hasMinimum && !hasMaximum) {
      return "Add at least one amount limit";
    }

    if (
      (hasMinimum && !Number.isFinite(Number(form.amountMin))) ||
      (hasMaximum && !Number.isFinite(Number(form.amountMax)))
    ) {
      return "Amount limits must be numbers";
    }
  }

  return null;
}

function describeRuleMatch(
  rule: CategorisationRule,
  merchantById: Map<Merchant["id"], Merchant>,
) {
  const matchType = toRuleMatchType(rule.match_type);
  const merchantName = rule.merchant_id
    ? (merchantById.get(rule.merchant_id)?.name ?? "Unknown merchant")
    : "Any merchant";

  if (matchType === "merchant") return merchantName;
  if (matchType === "description_contains") return `Description contains "${rule.pattern}"`;
  if (matchType === "amount") return formatAmountRange(rule);

  return [
    `Description contains "${rule.pattern}"`,
    formatAmountRange(rule),
    merchantName,
  ].join(" + ");
}

function formatAmountRange(rule: CategorisationRule) {
  if (rule.amount_min === null && rule.amount_max === null) return "Any amount";
  if (rule.amount_min !== null && rule.amount_max !== null) {
    return `${rule.amount_min} to ${rule.amount_max}`;
  }
  if (rule.amount_min !== null) return `At least ${rule.amount_min}`;
  return `Up to ${rule.amount_max}`;
}

function formatCategoryPair(
  categoryId: string | null,
  subcategoryId: string | null,
  categoryLookup: CategoryLookup,
) {
  const category = categoryId
    ? categoryLookup.categoriesById.get(categoryId)
    : null;
  const subcategory = subcategoryId
    ? categoryLookup.categoriesById.get(subcategoryId)
    : null;

  if (!category && !subcategory) return "None";
  if (category && subcategory) return `${category.name} / ${subcategory.name}`;
  return category?.name ?? subcategory?.name ?? "None";
}

function formatMatchType(matchType: string) {
  if (matchType === "description_contains") return "Description contains";
  return matchType
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function inputToNumber(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : null;
}

function numberToInput(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function isRuleMatchType(value: string | null): value is RuleMatchType {
  return ruleMatchTypes.some((matchType) => matchType === value);
}

function toRuleMatchType(value: string | null | undefined): RuleMatchType {
  const candidate = value ?? null;
  return isRuleMatchType(candidate) ? candidate : "description_contains";
}

function isRunRuleScope(value: string | null): value is RunRuleScope {
  return runRuleScopes.some((scope) => scope === value);
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
