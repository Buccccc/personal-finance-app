"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { UploadCloud, FileText, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAccounts } from "@/lib/hooks/accounts";
import { useCategories } from "@/lib/hooks/categories";
import { formatMoney, formatDate, formatForeignMoney } from "@/lib/format";
import { detectFormat, parseImport, type ParseResult } from "@/lib/import";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TablesInsert } from "@/lib/supabase/types";

const FORMAT_LABEL: Record<string, string> = {
  commbank: "CommBank export",
  wise: "Wise transaction history",
};

export function CsvImporter() {
  const accounts = useAccounts();
  const categories = useCategories();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [accountId, setAccountId] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<{ text: string; name: string } | null>(
    null,
  );
  const [walletBalance, setWalletBalance] = useState("");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [newHashes, setNewHashes] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(
    null,
  );

  const accountOptions = accounts.data ?? [];
  const hasAccounts = accountOptions.length > 0;
  const needsWalletBalance = pendingFile
    ? detectFormat(pendingFile.text) === "wise"
    : false;

  const summary = useMemo(() => {
    if (!parsed) return null;
    const rows = parsed.rows;
    const income = rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
    const expenses = rows.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0);
    const dates = rows.map((r) => r.date).sort();
    const currencies = [
      ...new Set(rows.map((r) => r.originalCurrency).filter(Boolean) as string[]),
    ];
    return {
      count: rows.length,
      income,
      expenses,
      from: dates[0],
      to: dates[dates.length - 1],
      currencies,
      flagged: rows.filter((r) => r.flag),
    };
  }, [parsed]);

  /** Read + parse, then work out which rows are new (dedupe preview). */
  async function runParse(text: string, name: string) {
    if (!accountId) {
      toast.error("Choose an account first.");
      return;
    }
    setResult(null);
    setBusy(true);
    try {
      const balance = walletBalance.trim() === "" ? null : Number(walletBalance);
      if (balance !== null && Number.isNaN(balance)) {
        toast.error("Wallet balance must be a number.");
        return;
      }
      const res = await parseImport(text, {
        accountId,
        currentBalanceAud: balance,
      });
      if (!res.rows.length) {
        toast.error("No transactions found in that file.");
        setParsed(null);
        setNewHashes(null);
        return;
      }
      setFileName(name);
      setParsed(res);

      const supabase = createClient();
      const hashes = res.rows.map((r) => r.hash);
      const existing = new Set<string>();
      for (let i = 0; i < hashes.length; i += 300) {
        const { data, error } = await supabase
          .from("transactions")
          .select("import_hash")
          .in("import_hash", hashes.slice(i, i + 300));
        if (error) throw new Error(error.message);
        for (const row of data ?? []) {
          if (row.import_hash) existing.add(row.import_hash);
        }
      }
      setNewHashes(new Set(hashes.filter((h) => !existing.has(h))));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read the file.");
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file: File) {
    if (!accountId) {
      toast.error("Choose an account first.");
      return;
    }
    const text = await file.text();
    setPendingFile({ text, name: file.name });
    setParsed(null);
    setNewHashes(null);
    // Wise ships no running balance, so it needs the wallet total from the app
    // before it can book the closing FX revaluation. Wait for that input.
    if (detectFormat(text) === "wise" && walletBalance.trim() === "") {
      setFileName(file.name);
      return;
    }
    await runParse(text, file.name);
  }

  /**
   * Match the export's own category name against the user's categories,
   * preferring one whose kind matches the row so an expense never lands on an
   * income-kind category.
   */
  function resolveCategoryId(name: string | null | undefined, kind: string) {
    if (!name) return null;
    const list = categories.data ?? [];
    const matches = list.filter(
      (c) => c.name.toLowerCase() === name.toLowerCase().trim(),
    );
    if (!matches.length) return null;
    return (matches.find((c) => c.kind === kind) ?? matches[0]).id;
  }

  async function doImport() {
    if (!parsed || !newHashes || !accountId) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const toInsert = parsed.rows.filter((r) => newHashes.has(r.hash));
      const rows: TablesInsert<"transactions">[] = toInsert.map((r) => ({
        account_id: accountId,
        date: r.date,
        description: r.description,
        amount: r.amount,
        type: r.type,
        import_hash: r.hash,
        original_amount: r.originalAmount ?? null,
        original_currency: r.originalCurrency ?? null,
        fx_rate: r.fxRate ?? null,
        category_id: resolveCategoryId(r.suggestedCategory, r.type),
        notes: r.flag ?? null,
      }));

      let imported = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const { error } = await supabase
          .from("transactions")
          .upsert(batch, {
            onConflict: "user_id,import_hash",
            ignoreDuplicates: true,
          });
        if (error) throw new Error(error.message);
        imported += batch.length;
      }

      // Set the account balance authoritatively from the export. CommBank
      // carries a running balance; Wise reports the wallet total, which the
      // parser has already tied the rows to. Imported rows don't increment via
      // the DB trigger, so this is the source of truth. Then re-sync net worth.
      if (parsed.closingBalance !== null) {
        await supabase
          .from("accounts")
          .update({ balance: parsed.closingBalance })
          .eq("id", accountId);
      }
      await supabase.rpc("sync_account_networth");

      const skipped = parsed.rows.length - imported;
      setResult({ imported, skipped });
      toast.success(`Imported ${imported} transaction(s).`);
      await queryClient.invalidateQueries();
      setParsed(null);
      setNewHashes(null);
      setFileName(null);
      setPendingFile(null);
      setWalletBalance("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  const newCount = newHashes?.size ?? 0;
  const dupCount = parsed ? parsed.rows.length - newCount : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import"
        description="Import a CommBank or Wise CSV export — the format is detected from the file. Foreign-currency spending is converted to AUD at the rate you actually paid. Duplicates are detected automatically, and new transactions arrive ready for Review."
      />

      {!hasAccounts ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>Create an account first</CardTitle>
            <CardDescription>
              Imported transactions are linked to an account.{" "}
              <Link href="/accounts" className="text-primary underline">
                Add an account
              </Link>
              , then come back.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">1. Choose account</CardTitle>
              <CardDescription>Which account is this export from?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select
                items={Object.fromEntries(
                  accountOptions.map((a) => [a.id, a.name]),
                )}
                value={accountId}
                onValueChange={(v) => setAccountId(v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accountOptions.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div>
                <p className="mb-2 text-sm font-medium">2. Choose CSV file</p>
                <label
                  className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20 px-4 py-8 text-center transition-colors hover:bg-muted/40"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f) void handleFile(f);
                  }}
                >
                  <UploadCloud className="h-6 w-6 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Drop CSV here or click to browse
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    disabled={!accountId || busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleFile(f);
                    }}
                  />
                </label>
                {!accountId && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Select an account to enable the file picker.
                  </p>
                )}
              </div>

              {needsWalletBalance && (
                <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <p className="text-sm font-medium">Wise wallet balance (AUD)</p>
                  <p className="text-xs text-muted-foreground">
                    Wise exports carry no running balance. Enter the total the
                    Wise app shows so leftover foreign currency can be valued and
                    the FX movement booked.
                  </p>
                  <Input
                    inputMode="decimal"
                    placeholder="557.92"
                    value={walletBalance}
                    onChange={(e) => setWalletBalance(e.target.value)}
                  />
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={busy || walletBalance.trim() === ""}
                    onClick={() => {
                      if (pendingFile)
                        void runParse(pendingFile.text, pendingFile.name);
                    }}
                  >
                    {parsed ? "Re-read file" : "Read file"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">3. Review &amp; import</CardTitle>
              <CardDescription>
                {fileName ? (
                  <span className="inline-flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" /> {fileName}
                    {parsed ? ` — ${FORMAT_LABEL[parsed.format] ?? parsed.format}` : ""}
                  </span>
                ) : (
                  "No file loaded yet."
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {result ? (
                <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
                  <div className="text-sm">
                    <p className="font-medium">
                      Imported {result.imported} transaction(s).
                    </p>
                    <p className="text-muted-foreground">
                      {result.skipped} already existed and were skipped. Head to{" "}
                      <Link href="/review" className="text-primary underline">
                        Review
                      </Link>{" "}
                      to categorise the new ones.
                    </p>
                  </div>
                </div>
              ) : null}

              {summary && parsed ? (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label="Rows" value={String(summary.count)} />
                    <Stat label="New" value={String(newCount)} highlight />
                    <Stat label="Duplicates" value={String(dupCount)} />
                    <Stat
                      label="Range"
                      value={
                        summary.from
                          ? `${formatDate(summary.from)} → ${formatDate(summary.to)}`
                          : "—"
                      }
                      small
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label="Income" value={formatMoney(summary.income)} />
                    <Stat label="Expenses" value={formatMoney(summary.expenses)} />
                    {parsed.closingBalance !== null && (
                      <Stat
                        label="Closing balance"
                        value={formatMoney(parsed.closingBalance)}
                      />
                    )}
                    {summary.currencies.length > 0 && (
                      <Stat
                        label="Currencies"
                        value={summary.currencies.join(", ")}
                        small
                      />
                    )}
                  </div>

                  {parsed.notes.length > 0 && (
                    <div className="space-y-1.5 rounded-lg border bg-muted/20 p-3">
                      {parsed.notes.map((n, i) => (
                        <p
                          key={i}
                          className="flex items-start gap-2 text-xs text-muted-foreground"
                        >
                          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {n}
                        </p>
                      ))}
                    </div>
                  )}

                  {summary.flagged.length > 0 && (
                    <div className="space-y-1.5 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                      {summary.flagged.map((r, i) => (
                        <p key={i} className="flex items-start gap-2 text-xs">
                          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                          <span>
                            <span className="font-medium">
                              {formatDate(r.date)} {r.description}
                            </span>{" "}
                            — {r.flag}
                          </span>
                        </p>
                      ))}
                    </div>
                  )}

                  <div className="rounded-lg border">
                    <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                      Preview (first 6)
                    </div>
                    <div className="divide-y">
                      {parsed.rows.slice(0, 6).map((r, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                        >
                          <span className="tabular text-muted-foreground">
                            {formatDate(r.date)}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {r.description}
                          </span>
                          <span className="shrink-0 text-right">
                            <span
                              className={`tabular block ${
                                r.amount < 0 ? "text-red-600" : "text-emerald-600"
                              }`}
                            >
                              {formatMoney(r.amount)}
                            </span>
                            {r.originalAmount != null && r.originalCurrency && (
                              <span className="tabular block text-xs text-muted-foreground">
                                {formatForeignMoney(r.originalAmount, r.originalCurrency)}
                                {r.fxRate ? ` @ ${r.fxRate.toFixed(4)}` : ""}
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button
                    onClick={doImport}
                    disabled={busy || newCount === 0}
                    className="w-full"
                  >
                    {busy
                      ? "Importing…"
                      : newCount === 0
                        ? "Nothing new to import"
                        : `Import ${newCount} new transaction(s)`}
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {needsWalletBalance
                    ? "Wise file loaded. Enter the wallet balance on the left to read it."
                    : "Choose an account and drop a CommBank or Wise CSV to preview it here."}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
  small,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  small?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`${small ? "text-xs" : "text-lg"} font-semibold ${
          highlight ? "text-primary" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
