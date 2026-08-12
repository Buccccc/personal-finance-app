/** Shared display formatters. Calculations live in Postgres; this is display only. */

const AUD = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Money in AUD, e.g. -$1,234.50. Accepts number | string | null. */
export function formatMoney(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  if (Number.isNaN(n)) return AUD.format(0);
  return AUD.format(n);
}

/**
 * Money in a currency other than AUD, e.g. "NZ$34.27". Used for foreign
 * spending, where the AUD figure is the reporting value and this is what was
 * actually charged. Falls back to a code suffix for unknown currencies.
 */
export function formatForeignMoney(
  value: number | string | null | undefined,
  currency: string,
): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  if (Number.isNaN(n)) return `0 ${currency}`;
  try {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

/** Percent from a 0..1 ratio, e.g. 0.34 -> "34.0%". null -> "—". */
export function formatPercent(
  ratio: number | string | null | undefined,
  digits = 1,
): string {
  if (ratio === null || ratio === undefined || ratio === "") return "—";
  const n = typeof ratio === "string" ? Number(ratio) : ratio;
  if (Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

/** ratio (x.xx) e.g. 1.42 -> "1.42×". null -> "—". */
export function formatRatio(
  value: number | string | null | undefined,
  digits = 2,
): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}×`;
}

/** ISO date (YYYY-MM-DD) -> "2 Jun 2026". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "2026-06" or Date -> "June 2026". */
export function formatMonth(value: string | Date): string {
  const d =
    typeof value === "string"
      ? new Date(value.length === 7 ? `${value}-01T00:00:00` : value)
      : value;
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
}
