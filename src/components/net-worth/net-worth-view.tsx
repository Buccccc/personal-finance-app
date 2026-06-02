"use client";

import { FormEvent, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  Settings2Icon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { formatDate, formatMoney, formatRatio } from "@/lib/format";
import {
  type NetWorthClass,
  type NetWorthItemWithValues,
  type NetWorthKind,
  useAddNetWorthClass,
  useAddNetWorthItem,
  useDeleteValueEntry,
  useNetWorthClasses,
  useNetWorthCurrent,
  useNetWorthItems,
  useSetItemActive,
  useUpdateNetWorthClass,
  useUpsertValueEntry,
} from "@/lib/hooks/net-worth";

const headlineCards = [
  { label: "Net Worth", key: "netWorth" },
  { label: "Total Assets", key: "assets" },
  { label: "Total Liabilities", key: "liabilities" },
  { label: "Liquid Worth", key: "liquidAssets" },
] as const;

const netWorthKindItems: Record<NetWorthKind, string> = {
  asset: "Asset",
  liability: "Liability",
};

function getTodayDateInputValue(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function displayClassName(name: string): string {
  return name
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function displayValue(value: number | null | undefined, kind?: NetWorthKind) {
  const safeValue = value ?? 0;
  return formatMoney(kind === "liability" ? Math.abs(safeValue) : safeValue);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function NetWorthView() {
  const currentQuery = useNetWorthCurrent();
  const classesQuery = useNetWorthClasses();
  const itemsQuery = useNetWorthItems();
  const [showHidden, setShowHidden] = useState(false);

  const itemsByKind = useMemo(() => {
    const items = (itemsQuery.data ?? []).filter(
      (item) => showHidden || item.active,
    );

    return {
      asset: items.filter((item) => item.networthClass.kind === "asset"),
      liability: items.filter(
        (item) => item.networthClass.kind === "liability",
      ),
    };
  }, [itemsQuery.data, showHidden]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Net Worth"
        description="Track each asset and liability as dated value entries. The headline numbers come from your Supabase net worth view."
      >
        <ManageClassesDialog classes={classesQuery.data ?? []} />
        <AddItemDialog classes={classesQuery.data ?? []} />
      </PageHeader>

      <HeadlineCards
        current={currentQuery.data ?? null}
        isLoading={currentQuery.isLoading}
      />

      {(currentQuery.error || itemsQuery.error || classesQuery.error) && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent>
            <p className="text-sm text-destructive">
              {getErrorMessage(
                currentQuery.error ?? itemsQuery.error ?? classesQuery.error,
              )}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/20 px-4 py-3">
        <div>
          <p className="font-medium">Ledger</p>
          <p className="text-sm text-muted-foreground">
            Hidden items keep their history but are left out of the current
            totals.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Label htmlFor="show-hidden-items" className="text-sm">
            Show hidden
          </Label>
          <Switch
            id="show-hidden-items"
            checked={showHidden}
            onCheckedChange={setShowHidden}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ItemsColumn
          title="Assets"
          description="Cash, savings, super, crypto, property, and anything else you own."
          emptyTitle="No assets yet"
          emptyDescription="Add your first asset, then record its current value."
          items={itemsByKind.asset}
          classes={classesQuery.data ?? []}
          kind="asset"
          isLoading={itemsQuery.isLoading || classesQuery.isLoading}
        />
        <ItemsColumn
          title="Liabilities"
          description="HECS, credit cards, loans, and anything else you owe."
          emptyTitle="No liabilities yet"
          emptyDescription="Add a liability when you want it included in your net worth."
          items={itemsByKind.liability}
          classes={classesQuery.data ?? []}
          kind="liability"
          isLoading={itemsQuery.isLoading || classesQuery.isLoading}
        />
      </div>

      <ItemHistoryChart
        items={itemsQuery.data ?? []}
        isLoading={itemsQuery.isLoading}
      />
    </div>
  );
}

function HeadlineCards({
  current,
  isLoading,
}: {
  current: {
    assets: number | null;
    liabilities: number | null;
    liquid_assets: number | null;
    liquidity_ratio: number | null;
    net_worth: number | null;
  } | null;
  isLoading: boolean;
}) {
  const values = {
    netWorth: formatMoney(current?.net_worth ?? 0),
    assets: formatMoney(current?.assets ?? 0),
    liquidAssets: formatMoney(current?.liquid_assets ?? 0),
    liabilities: formatMoney(Math.abs(current?.liabilities ?? 0)),
    liquidityRatio: current ? formatRatio(current.liquidity_ratio) : "—",
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {headlineCards.map((card, index) => (
        <motion.div
          key={card.key}
          className="h-full"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: index * 0.04 }}
        >
          <Card className="lift h-full">
            <CardHeader>
              <CardDescription>{card.label}</CardDescription>
              <CardTitle className="tabular text-2xl">
                {isLoading ? (
                  <Skeleton className="h-7 w-32" />
                ) : (
                  values[card.key]
                )}
              </CardTitle>
              {card.key === "liquidAssets" && (
                <p className="tabular text-xs text-muted-foreground">
                  {isLoading ? (
                    <Skeleton className="h-4 w-24" />
                  ) : (
                    `Liquidity ${values.liquidityRatio}`
                  )}
                </p>
              )}
            </CardHeader>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

function ItemHistoryChart({
  items,
  isLoading,
}: {
  items: NetWorthItemWithValues[];
  isLoading: boolean;
}) {
  const withHistory = useMemo(
    () => items.filter((i) => i.entries.length > 0),
    [items],
  );
  const [selectedId, setSelectedId] = useState<string>("");
  const itemsMap = useMemo<Record<string, React.ReactNode>>(
    () => Object.fromEntries(withHistory.map((i) => [i.id, i.name])),
    [withHistory],
  );

  const selected =
    withHistory.find((i) => i.id === selectedId) ?? withHistory[0] ?? null;

  const data = useMemo(() => {
    if (!selected) return [];
    return [...selected.entries]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => ({ date: e.date, value: Number(e.value) }));
  }, [selected]);

  if (isLoading) {
    return <Skeleton className="h-72 w-full" />;
  }
  if (!withHistory.length) return null;

  const isLiability = selected?.networthClass.kind === "liability";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Item history</CardTitle>
            <CardDescription>
              Track an individual asset or liability over time.
            </CardDescription>
          </div>
          <Select
            items={itemsMap}
            value={selected?.id ?? ""}
            onValueChange={(v) => setSelectedId(v ?? "")}
          >
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Choose item" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Assets</SelectLabel>
                {withHistory
                  .filter((i) => i.networthClass.kind === "asset")
                  .map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Liabilities</SelectLabel>
                {withHistory
                  .filter((i) => i.networthClass.kind === "liability")
                  .map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full min-w-0 overflow-hidden">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ left: 8, right: 16, top: 8, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => formatDate(d)}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                minTickGap={28}
              />
              <YAxis
                tickFormatter={(v) => formatMoney(Number(v))}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                width={84}
              />
              <Tooltip
                formatter={(v) => formatMoney(Number(v))}
                labelFormatter={(d) => formatDate(String(d))}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={
                  isLiability ? "var(--destructive)" : "var(--chart-1)"
                }
                strokeWidth={2}
                dot={{ r: 2 }}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function ManageClassesDialog({ classes }: { classes: NetWorthClass[] }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>
        <Settings2Icon />
        Manage classes
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage classes</DialogTitle>
          <DialogDescription>
            Edit the groups used by your net worth items. Liquid and current
            settings feed the current headline view.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {classes.length > 0 ? (
            classes.map((networthClass) => (
              <ClassEditorRow
                key={networthClass.id}
                networthClass={networthClass}
              />
            ))
          ) : (
            <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
              No classes yet. Add one below before creating new items.
            </p>
          )}
        </div>

        <Separator />
        <AddClassForm />
      </DialogContent>
    </Dialog>
  );
}

function ClassEditorRow({
  networthClass,
}: {
  networthClass: NetWorthClass;
}) {
  const [name, setName] = useState(networthClass.name);
  const [kind, setKind] = useState<NetWorthKind>(networthClass.kind);
  const [isLiquid, setIsLiquid] = useState(networthClass.is_liquid);
  const [isCurrent, setIsCurrent] = useState(networthClass.is_current);
  const updateClass = useUpdateNetWorthClass();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Add a class name first.");
      return;
    }

    try {
      await updateClass.mutateAsync({
        id: networthClass.id,
        name: trimmedName,
        kind,
        isLiquid,
        isCurrent,
      });
      toast.success("Class saved.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-3 rounded-xl border bg-background p-3"
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_150px]">
        <div className="space-y-2">
          <Label htmlFor={`class-name-${networthClass.id}`}>Name</Label>
          <Input
            id={`class-name-${networthClass.id}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Kind</Label>
          <Select
            items={netWorthKindItems}
            value={kind}
            onValueChange={(value) =>
              setKind(value === "liability" ? "liability" : "asset")
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asset">Asset</SelectItem>
              <SelectItem value="liability">Liability</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id={`class-liquid-${networthClass.id}`}
              checked={isLiquid}
              onCheckedChange={setIsLiquid}
            />
            <Label htmlFor={`class-liquid-${networthClass.id}`}>Liquid</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id={`class-current-${networthClass.id}`}
              checked={isCurrent}
              onCheckedChange={setIsCurrent}
            />
            <Label htmlFor={`class-current-${networthClass.id}`}>
              Current liability
            </Label>
          </div>
        </div>
        <Button type="submit" size="sm" disabled={updateClass.isPending}>
          {updateClass.isPending ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}

function AddClassForm() {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<NetWorthKind>("asset");
  const [isLiquid, setIsLiquid] = useState(false);
  const [isCurrent, setIsCurrent] = useState(false);
  const addClass = useAddNetWorthClass();

  function resetForm() {
    setName("");
    setKind("asset");
    setIsLiquid(false);
    setIsCurrent(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Add a class name first.");
      return;
    }

    try {
      await addClass.mutateAsync({
        name: trimmedName,
        kind,
        isLiquid,
        isCurrent,
      });
      toast.success("Class added.");
      resetForm();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <p className="font-medium">Add class</p>
        <p className="text-sm text-muted-foreground">
          New classes are available immediately when adding items.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_150px]">
        <div className="space-y-2">
          <Label htmlFor="new-class-name">Name</Label>
          <Input
            id="new-class-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Mortgage"
          />
        </div>
        <div className="space-y-2">
          <Label>Kind</Label>
          <Select
            items={netWorthKindItems}
            value={kind}
            onValueChange={(value) =>
              setKind(value === "liability" ? "liability" : "asset")
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asset">Asset</SelectItem>
              <SelectItem value="liability">Liability</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="new-class-liquid"
              checked={isLiquid}
              onCheckedChange={setIsLiquid}
            />
            <Label htmlFor="new-class-liquid">Liquid</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="new-class-current"
              checked={isCurrent}
              onCheckedChange={setIsCurrent}
            />
            <Label htmlFor="new-class-current">Current liability</Label>
          </div>
        </div>
        <Button type="submit" size="sm" disabled={addClass.isPending}>
          {addClass.isPending ? "Adding..." : "Add class"}
        </Button>
      </div>
    </form>
  );
}

function ItemsColumn({
  title,
  description,
  emptyTitle,
  emptyDescription,
  items,
  classes,
  kind,
  isLoading,
}: {
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  items: NetWorthItemWithValues[];
  classes: NetWorthClass[];
  kind: NetWorthKind;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <ItemSkeletons />
        ) : items.length > 0 ? (
          items.map((item, index) => (
            <NetWorthItemRow key={item.id} item={item} index={index} />
          ))
        ) : (
          <EmptyState title={emptyTitle} description={emptyDescription}>
            <AddItemDialog classes={classes} defaultKind={kind} />
          </EmptyState>
        )}
      </CardContent>
    </Card>
  );
}

function NetWorthItemRow({
  item,
  index,
}: {
  item: NetWorthItemWithValues;
  index: number;
}) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const latestEntry = item.latestEntry;
  const setItemActive = useSetItemActive();

  async function handleActiveChange() {
    try {
      await setItemActive.mutateAsync({
        itemId: item.id,
        active: !item.active,
      });
      toast.success(item.active ? "Item hidden." : "Item shown.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      className={`rounded-xl border bg-background p-3 ${
        item.active ? "" : "opacity-60"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{item.name}</h3>
            <Badge variant="outline">
              {displayClassName(item.networthClass.name)}
            </Badge>
            {item.networthClass.is_liquid && (
              <Badge variant="secondary">Liquid</Badge>
            )}
            {item.networthClass.kind === "liability" &&
              !item.networthClass.is_current && (
                <Badge variant="secondary">Long-term</Badge>
              )}
            {!item.active && <Badge variant="secondary">Hidden</Badge>}
          </div>
          <div className="text-sm text-muted-foreground">
            {latestEntry ? (
              <>
                Latest value{" "}
                <span className="tabular font-medium text-foreground">
                  {displayValue(latestEntry.value, item.networthClass.kind)}
                </span>{" "}
                on {formatDate(latestEntry.date)}
              </>
            ) : (
              "No value recorded yet."
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={setItemActive.isPending}
            onClick={handleActiveChange}
          >
            {item.active ? "Hide" : "Show"}
          </Button>
          <UpdateValueDialog item={item} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsHistoryOpen((current) => !current)}
          >
            {isHistoryOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
            History
          </Button>
        </div>
      </div>

      {isHistoryOpen && (
        <>
          <Separator className="my-3" />
          <ValueHistory item={item} />
        </>
      )}
    </motion.div>
  );
}

function AddItemDialog({
  classes,
  defaultKind,
}: {
  classes: NetWorthClass[];
  defaultKind?: NetWorthKind;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [classId, setClassId] = useState("");
  const addItem = useAddNetWorthItem();

  const availableClasses = defaultKind
    ? classes.filter((networthClass) => networthClass.kind === defaultKind)
    : classes;
  const classItems = {
    "": "Choose a class",
    ...Object.fromEntries(
      availableClasses.map((networthClass) => [
        networthClass.id,
        `${displayClassName(networthClass.name)} · ${networthClass.kind}`,
      ]),
    ),
  };

  function resetForm() {
    setName("");
    setClassId("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName || !classId) {
      toast.error("Add a name and choose a class first.");
      return;
    }

    try {
      await addItem.mutateAsync({ name: trimmedName, classId });
      toast.success("Net worth item added.");
      resetForm();
      setOpen(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <PlusIcon />
        Add item
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Add item</DialogTitle>
            <DialogDescription>
              Create one asset or liability line. Values are added separately as
              dated entries.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="net-worth-item-name">Name</Label>
            <Input
              id="net-worth-item-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="CommBank savings"
            />
          </div>

          <div className="space-y-2">
            <Label>Class</Label>
            <Select
              items={classItems}
              value={classId}
              onValueChange={(value) => setClassId(value ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a class" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Net worth classes</SelectLabel>
                  {availableClasses.map((networthClass) => (
                    <SelectItem key={networthClass.id} value={networthClass.id}>
                      {displayClassName(networthClass.name)} ·{" "}
                      {networthClass.kind}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {availableClasses.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No classes are available yet.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="submit"
              disabled={addItem.isPending || availableClasses.length === 0}
            >
              {addItem.isPending ? "Adding..." : "Add item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UpdateValueDialog({ item }: { item: NetWorthItemWithValues }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(getTodayDateInputValue());
  const [value, setValue] = useState(
    item.latestEntry ? String(Math.abs(item.latestEntry.value)) : "",
  );
  const upsertEntry = useUpsertValueEntry();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const numericValue = Number(value);
    if (!date || !Number.isFinite(numericValue)) {
      toast.error("Add a valid date and value first.");
      return;
    }

    try {
      await upsertEntry.mutateAsync({
        itemId: item.id,
        date,
        value: numericValue,
      });
      toast.success("Value saved.");
      setOpen(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="secondary" size="sm" />}>
        Update value
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Update value</DialogTitle>
            <DialogDescription>
              Save the value for {item.name} on a specific date. Saving the same
              date again replaces that date&apos;s value.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`value-date-${item.id}`}>Date</Label>
              <Input
                id={`value-date-${item.id}`}
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`value-amount-${item.id}`}>Value</Label>
              <Input
                id={`value-amount-${item.id}`}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={upsertEntry.isPending}>
              {upsertEntry.isPending ? "Saving..." : "Save value"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ValueHistory({ item }: { item: NetWorthItemWithValues }) {
  const deleteEntry = useDeleteValueEntry();

  async function handleDelete(entryId: string) {
    try {
      await deleteEntry.mutateAsync(entryId);
      toast.success("Value entry deleted.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  if (item.entries.length === 0) {
    return (
      <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
        No history yet. Use “Update value” to add the first dated value.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {item.entries.map((entry) => (
        <div
          key={entry.id}
          className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 text-sm"
        >
          <div>
            <p className="tabular font-medium">
              {displayValue(entry.value, item.networthClass.kind)}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDate(entry.date)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={deleteEntry.isPending}
            onClick={() => handleDelete(entry.id)}
            aria-label={`Delete value from ${formatDate(entry.date)}`}
          >
            <Trash2Icon />
          </Button>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/20 p-6 text-center">
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

function ItemSkeletons() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="rounded-xl border p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-52" />
            </div>
            <Skeleton className="h-8 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}
