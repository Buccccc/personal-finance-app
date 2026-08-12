export type TxnType = "expense" | "income" | "transfer";

export type ParsedRow = {
  /** ISO yyyy-mm-dd, in the spending currency's local sense (value date). */
  date: string;
  /** Signed AUD. Negative = money out. Always the reporting currency. */
  amount: number;
  description: string;
  type: TxnType;
  /** Stable dedupe key. */
  hash: string;
  /** Running balance from the export, when the format supplies one. */
  balance?: string;
  /**
   * Signed amount in the currency the transaction actually happened in.
   * Null for AUD-native rows, where `amount` is already authoritative.
   */
  originalAmount?: number | null;
  /** ISO 4217 code for `originalAmount`, e.g. "NZD". */
  originalCurrency?: string | null;
  /** Units of `originalCurrency` per 1 AUD, at the rate actually paid. */
  fxRate?: number | null;
  /** Category name suggested by the source export, resolved on import. */
  suggestedCategory?: string | null;
  /** Set when a row needs a human decision before it can be trusted. */
  flag?: string | null;
};

export type ImportFormat = "commbank" | "wise";

export type ParseResult = {
  format: ImportFormat;
  rows: ParsedRow[];
  /**
   * Balance the account should be set to after importing, in AUD. Null when
   * the format cannot determine it and the existing balance should stand.
   */
  closingBalance: number | null;
  /** Human-readable notes about decisions the parser made. */
  notes: string[];
};
