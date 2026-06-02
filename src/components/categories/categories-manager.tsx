"use client";

import { type FormEvent, useMemo, useState } from "react";
import { Edit2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  type Category,
  type TransactionType,
  transactionTypes,
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from "@/lib/hooks/categories";

const kindLabels: Record<TransactionType, string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
};

type CategoryDialogState =
  | { mode: "create-parent"; kind: TransactionType }
  | { mode: "create-subcategory"; parent: Category }
  | { mode: "edit"; category: Category }
  | null;

type CategoryGroups = Record<
  TransactionType,
  {
    parents: Category[];
    subcategoriesByParentId: Map<Category["id"], Category[]>;
  }
>;

function isTransactionType(value: string): value is TransactionType {
  return (transactionTypes as readonly string[]).includes(value);
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function buildCategoryGroups(categories: Category[]): CategoryGroups {
  const groups: CategoryGroups = {
    expense: { parents: [], subcategoriesByParentId: new Map() },
    income: { parents: [], subcategoriesByParentId: new Map() },
    transfer: { parents: [], subcategoriesByParentId: new Map() },
  };

  for (const category of categories) {
    if (category.parent_id === null) {
      if (isTransactionType(category.kind)) {
        groups[category.kind].parents.push(category);
      }
      continue;
    }

    for (const kind of transactionTypes) {
      const subcategories = groups[kind].subcategoriesByParentId.get(
        category.parent_id,
      );
      if (subcategories) {
        subcategories.push(category);
      } else {
        groups[kind].subcategoriesByParentId.set(category.parent_id, [category]);
      }
    }
  }

  return groups;
}

export function CategoriesManager() {
  const categories = useCategories();
  const [categoryDialog, setCategoryDialog] = useState<CategoryDialogState>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);

  const groups = useMemo(
    () => buildCategoryGroups(categories.data ?? []),
    [categories.data],
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Categories"
        description="Create parent categories, then add subcategories underneath them for more detailed transaction tracking."
      />

      {categories.error ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent>
            <p className="text-sm text-destructive">
              {getErrorMessage(categories.error, "Could not load categories")}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {transactionTypes.map((kind) => (
          <CategorySection
            key={kind}
            kind={kind}
            parents={groups[kind].parents}
            subcategoriesByParentId={groups[kind].subcategoriesByParentId}
            isLoading={categories.isLoading}
            onAddCategory={() => setCategoryDialog({ mode: "create-parent", kind })}
            onAddSubcategory={(parent) =>
              setCategoryDialog({ mode: "create-subcategory", parent })
            }
            onEdit={(category) => setCategoryDialog({ mode: "edit", category })}
            onDelete={(category) => setCategoryToDelete(category)}
          />
        ))}
      </div>

      <CategoryFormDialog
        state={categoryDialog}
        onOpenChange={(open) => {
          if (!open) setCategoryDialog(null);
        }}
      />

      <DeleteCategoryDialog
        category={categoryToDelete}
        onOpenChange={(open) => {
          if (!open) setCategoryToDelete(null);
        }}
      />
    </main>
  );
}

function CategorySection({
  kind,
  parents,
  subcategoriesByParentId,
  isLoading,
  onAddCategory,
  onAddSubcategory,
  onEdit,
  onDelete,
}: {
  kind: TransactionType;
  parents: Category[];
  subcategoriesByParentId: Map<Category["id"], Category[]>;
  isLoading: boolean;
  onAddCategory: () => void;
  onAddSubcategory: (parent: Category) => void;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
}) {
  return (
    <Card className="min-h-80">
      <CardHeader>
        <CardTitle>{kindLabels[kind]}</CardTitle>
        <CardDescription>
          {kind === "expense"
            ? "Money going out."
            : kind === "income"
              ? "Money coming in."
              : "Money moving between accounts."}
        </CardDescription>
        <CardAction>
          <Button size="sm" onClick={onAddCategory}>
            <PlusIcon />
            Add category
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <CategoriesSkeleton />
        ) : parents.length === 0 ? (
          <EmptyCategoryState kind={kind} onAddCategory={onAddCategory} />
        ) : (
          <div className="space-y-3">
            {parents.map((parent) => (
              <ParentCategoryRow
                key={parent.id}
                parent={parent}
                subcategories={subcategoriesByParentId.get(parent.id) ?? []}
                onAddSubcategory={() => onAddSubcategory(parent)}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ParentCategoryRow({
  parent,
  subcategories,
  onAddSubcategory,
  onEdit,
  onDelete,
}: {
  parent: Category;
  subcategories: Category[];
  onAddSubcategory: () => void;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
}) {
  return (
    <div className="rounded-lg border bg-background/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{parent.name}</p>
          <p className="text-xs text-muted-foreground">
            {subcategories.length} subcategor{subcategories.length === 1 ? "y" : "ies"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onEdit(parent)}
          >
            <Edit2Icon />
            <span className="sr-only">Edit {parent.name}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onDelete(parent)}
          >
            <Trash2Icon />
            <span className="sr-only">Delete {parent.name}</span>
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {subcategories.map((subcategory) => (
          <SubcategoryChip
            key={subcategory.id}
            subcategory={subcategory}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="mt-3"
        onClick={onAddSubcategory}
      >
        <PlusIcon />
        Add subcategory
      </Button>
    </div>
  );
}

function SubcategoryChip({
  subcategory,
  onEdit,
  onDelete,
}: {
  subcategory: Category;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
}) {
  return (
    <Badge variant="secondary" className="h-auto gap-1.5 rounded-lg py-1 pr-1">
      <span>{subcategory.name}</span>
      <button
        type="button"
        className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        onClick={() => onEdit(subcategory)}
      >
        <Edit2Icon className="size-3" />
        <span className="sr-only">Edit {subcategory.name}</span>
      </button>
      <button
        type="button"
        className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-destructive"
        onClick={() => onDelete(subcategory)}
      >
        <Trash2Icon className="size-3" />
        <span className="sr-only">Delete {subcategory.name}</span>
      </button>
    </Badge>
  );
}

function EmptyCategoryState({
  kind,
  onAddCategory,
}: {
  kind: TransactionType;
  onAddCategory: () => void;
}) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center">
      <p className="font-medium">No {kindLabels[kind].toLowerCase()} categories yet</p>
      <p className="mt-1 max-w-56 text-sm text-muted-foreground">
        Add a parent category to start organising this group.
      </p>
      <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onAddCategory}>
        <PlusIcon />
        Add category
      </Button>
    </div>
  );
}

function CategoriesSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="rounded-lg border p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
            <div className="flex gap-1">
              <Skeleton className="size-7" />
              <Skeleton className="size-7" />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function CategoryFormDialog({
  state,
  onOpenChange,
}: {
  state: CategoryDialogState;
  onOpenChange: (open: boolean) => void;
}) {
  if (!state) {
    return <Dialog open={false} onOpenChange={onOpenChange} />;
  }

  const dialogKey =
    state.mode === "create-parent"
      ? `create-parent-${state.kind}`
      : state.mode === "create-subcategory"
        ? `create-subcategory-${state.parent.id}`
        : `edit-${state.category.id}`;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <CategoryFormContent
          key={dialogKey}
          state={state}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}

function CategoryFormContent({
  state,
  onOpenChange,
}: {
  state: Exclude<CategoryDialogState, null>;
  onOpenChange: (open: boolean) => void;
}) {
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const [name, setName] = useState(
    state.mode === "edit" ? state.category.name : "",
  );
  const isSaving = createCategory.isPending || updateCategory.isPending;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Category name is required");
      return;
    }

    try {
      if (state.mode === "edit") {
        if (!isTransactionType(state.category.kind)) {
          toast.error("This category has an unknown type");
          return;
        }

        await updateCategory.mutateAsync({
          id: state.category.id,
          category: { name: trimmedName, kind: state.category.kind },
        });
        toast.success("Category updated");
      } else if (state.mode === "create-parent") {
        await createCategory.mutateAsync({
          name: trimmedName,
          kind: state.kind,
          parent_id: null,
        });
        toast.success("Category added");
      } else {
        if (!isTransactionType(state.parent.kind)) {
          toast.error("This parent category has an unknown type");
          return;
        }

        await createCategory.mutateAsync({
          name: trimmedName,
          kind: state.parent.kind,
          parent_id: state.parent.id,
        });
        toast.success("Subcategory added");
      }

      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not save category"));
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{getCategoryDialogTitle(state)}</DialogTitle>
        <DialogDescription>{getCategoryDialogDescription(state)}</DialogDescription>
      </DialogHeader>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="category-name">Name</Label>
          <Input
            id="category-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Example: Groceries"
            autoComplete="off"
            required
          />
        </div>

        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <span className="text-muted-foreground">Type: </span>
          <span className="font-medium">{getCategoryDialogKindLabel(state)}</span>
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
            {isSaving ? "Saving..." : "Save category"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function DeleteCategoryDialog({
  category,
  onOpenChange,
}: {
  category: Category | null;
  onOpenChange: (open: boolean) => void;
}) {
  const deleteCategory = useDeleteCategory();
  const isParent = category?.parent_id === null;

  async function handleDelete() {
    if (!category) return;

    try {
      await deleteCategory.mutateAsync(category.id);
      toast.success(isParent ? "Category deleted" : "Subcategory deleted");
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not delete category"));
    }
  }

  return (
    <Dialog open={category !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Delete {isParent ? "category" : "subcategory"}?
          </DialogTitle>
          <DialogDescription>
            Transactions using <span className="font-medium">{category?.name}</span>{" "}
            will become uncategorised. This is safe because the database clears
            the category link instead of deleting transactions.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleteCategory.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteCategory.isPending}
          >
            {deleteCategory.isPending ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getCategoryDialogTitle(state: CategoryDialogState) {
  if (!state) return "Category";
  if (state.mode === "edit") return "Edit category";
  if (state.mode === "create-subcategory") return "Add subcategory";
  return "Add category";
}

function getCategoryDialogDescription(state: CategoryDialogState) {
  if (!state) return "Add or rename a category.";
  if (state.mode === "edit") return "Rename this category.";
  if (state.mode === "create-subcategory") {
    return `Add a subcategory under ${state.parent.name}.`;
  }
  return `Add a new ${kindLabels[state.kind].toLowerCase()} category.`;
}

function getCategoryDialogKindLabel(state: Exclude<CategoryDialogState, null>) {
  const kind =
    state.mode === "create-parent"
      ? state.kind
      : state.mode === "create-subcategory"
        ? state.parent.kind
        : state.category.kind;

  return isTransactionType(kind) ? kindLabels[kind] : "Unknown";
}
