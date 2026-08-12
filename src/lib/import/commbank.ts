/**
 * CommBank transaction-history export: headerless, newest-first, four columns
 * of `date,"amount","description","balance"`. Credit-card exports leave the
 * balance column empty.
 */
import { parseCsv, parseMoney, sha256Hex } from "./csv";
import type { ParseResult, ParsedRow } from "./types";

function toIso(ddmmyyyy: string): string | null {
  const m = ddmmyyyy.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/**
 * CommBank embeds the value date (when the card was tapped / payment made) in
 * the description, e.g. "...Card xx0079 Value Date: 02/06/2026". That reflects
 * true spending date better than the transaction date (when funds settle), so
 * prefer it when present.
 */
function extractValueDate(description: string): string | null {
  const m = description.match(/Value Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  return m ? toIso(m[1]) : null;
}

export function looksLikeCommbankCsv(text: string): boolean {
  const first = text.split(/\r?\n/).find((l) => l.trim() !== "");
  if (!first) return false;
  const cells = parseCsv(first)[0] ?? [];
  return cells.length >= 3 && toIso(cells[0] ?? "") !== null;
}

export async function parseCommbankCsv(
  text: string,
  accountId: string,
): Promise<ParseResult> {
  const rows: ParsedRow[] = [];
  for (const cells of parseCsv(text)) {
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
    rows.push({
      date,
      amount,
      description,
      balance,
      type: amount < 0 ? "expense" : "income",
      hash: await sha256Hex(
        `${accountId}|${date}|${amount}|${description}|${balance}`,
      ),
    });
  }

  // CommBank ships a running balance; the newest row carries the closing one.
  const latest = [...rows].sort((a, b) => b.date.localeCompare(a.date))[0];
  const closingBalance = latest ? parseMoney(latest.balance ?? "") : null;

  return { format: "commbank", rows, closingBalance, notes: [] };
}
