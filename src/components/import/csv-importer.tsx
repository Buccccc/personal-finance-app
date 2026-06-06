"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { UploadCloud, FileText, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAccounts } from "@/lib/hooks/accounts";
import { formatMoney, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
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

type ParsedRow = {
  date: string; // ISO yyyy-mm-dd
  amount: number;
  description: string;
  balance: string;
  type: "expense" | "income";
  hash: string;
};

// Minimal CSV line splitter (handles quoted fields with commas).
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      out.push(field);
      field = "";
    } else field += c;
  }
  out.push(field);
  return out;
}

function toIso(ddmmyyyy: string): string | null {
  const m = ddmmyyyy.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

// CommBank embeds the value date (when the card was tapped / payment made) in
// the description, e.g. "...Card xx0079 Value Date: 02/06/2026". That reflects
// true spending date better than the transaction date (when funds settle), so
// prefer it when present.
function extractValueDate(description: string): string | null {
  const m = description.match(/Value Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  return m ? toIso(m[1]) : null;
}

function parseMoney(s: string): number | null {
  const t = s.replace(/[^0-9.\-]/g, "");
  if (t === "" || t === "-" || t === "+") return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function parseCommbankCsv(
  text: string,
  accountId: string,
): Promise<ParsedRow[]> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const rows: ParsedRow[] = [];
  for (const line of lines) {
    const cells = splitCsvLine(line);
    if (cells.length < 3) continue;
    const transactionDate = toIso(cells[0]);
    if (!transactionDate) continue; // skips any header row (first cell not a date)
    const amount = parseMoney(cells[1]);
    if (amount === null) continue;
    const description = (cells[2] ?? "").trim();
    const balance = (cells[3] ?? "").trim();
    // Use the value date when CommBank provides one; otherwise the transaction
    // date is the value date.
    const date = extractValueDate(description) ?? transactionDate;
    const hash = await sha256Hex(
      `${accountId}|${date}|${amount}|${description}|${balance}`,
    );
    rows.push({
      date,
      amount,
      description,
      balance,
      type: amount < 0 ? "expense" : "income",
      hash,
    });
  }
  return rows;
}

export function CsvImporter() {
  const accounts = useAccounts();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [accountId, setAccountId] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [newHashes, setNewHashes] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(
    null,
  );

  const accountOptions = accounts.data ?? [];
  const hasAccounts = accountOptions.length > 0;

  const summary = useMemo(() => {
    if (!parsed) return null;
    const income = parsed
      .filter((r) => r.amount > 0)
      .reduce((s, r) => s + r.amount, 0);
    const expenses = parsed
      .filter((r) => r.amount < 0)
      .reduce((s, r) => s + r.amount, 0);
    const dates = parsed.map((r) => r.date).sort();
    return {
      count: parsed.length,
      income,
      expenses,
      from: dates[0],
      to: dates[dates.length - 1],
    };
  }, [parsed]);

  async function handleFile(file: File) {
    if (!accountId) {
      toast.error("Choose an account first.");
      return;
    }
    setResult(null);
    setBusy(true);
    try {
      const text = await file.text();
      const rows = await parseCommbankCsv(text, accountId);
      if (!rows.length) {
        toast.error("No transactions found. Is this a CommBank CSV export?");
        setParsed(null);
        setNewHashes(null);
        return;
      }
      setFileName(file.name);
      setParsed(rows);

      // Figure out which rows are new vs already imported (dedupe preview).
      const supabase = createClient();
      const hashes = rows.map((r) => r.hash);
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

  async function doImport() {
    if (!parsed || !newHashes || !accountId) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const toInsert = parsed.filter((r) => newHashes.has(r.hash));
      const rows: TablesInsert<"transactions">[] = toInsert.map((r) => ({
        account_id: accountId,
        date: r.date,
        description: r.description,
        amount: r.amount,
        type: r.type,
        import_hash: r.hash,
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

      // Set the account balance authoritatively from the most recent row's
      // running balance (CommBank exports include it, for cards too — negative
      // when owing). Imported rows don't increment via the DB trigger, so this
      // is the source of truth. Then re-sync net worth from balances.
      const latest = [...parsed].sort((a, b) =>
        b.date.localeCompare(a.date),
      )[0];
      const latestBalance = latest ? parseMoney(latest.balance) : null;
      if (latestBalance !== null) {
        await supabase
          .from("accounts")
          .update({ balance: latestBalance })
          .eq("id", accountId);
      }
      await supabase.rpc("sync_account_networth");

      const skipped = parsed.length - imported;
      setResult({ imported, skipped });
      toast.success(`Imported ${imported} transaction(s).`);
      await queryClient.invalidateQueries();
      // reset the file selection but keep the result visible
      setParsed(null);
      setNewHashes(null);
      setFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  const newCount = newHashes?.size ?? 0;
  const dupCount = parsed ? parsed.length - newCount : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import"
        description="Import a CommBank CSV export. Duplicates are detected automatically, and new transactions arrive uncategorised so Review and your rules can sort them."
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">3. Review & import</CardTitle>
              <CardDescription>
                {fileName ? (
                  <span className="inline-flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" /> {fileName}
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

              {summary ? (
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
                  <div className="grid grid-cols-2 gap-3">
                    <Stat
                      label="Income"
                      value={formatMoney(summary.income)}
                    />
                    <Stat
                      label="Expenses"
                      value={formatMoney(summary.expenses)}
                    />
                  </div>

                  <div className="rounded-lg border">
                    <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                      Preview (first 6)
                    </div>
                    <div className="divide-y">
                      {parsed!.slice(0, 6).map((r, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                        >
                          <span className="text-muted-foreground tabular">
                            {formatDate(r.date)}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {r.description}
                          </span>
                          <span
                            className={`tabular shrink-0 ${
                              r.amount < 0 ? "text-red-600" : "text-emerald-600"
                            }`}
                          >
                            {formatMoney(r.amount)}
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
                  Choose an account and drop a CommBank CSV to preview it here.
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
