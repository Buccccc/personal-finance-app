import { looksLikeCommbankCsv, parseCommbankCsv } from "./commbank";
import { looksLikeWiseCsv, parseWiseCsv, type WiseParseOptions } from "./wise";
import type { ImportFormat, ParseResult } from "./types";

export * from "./types";
export { looksLikeCommbankCsv, parseCommbankCsv } from "./commbank";
export { looksLikeWiseCsv, parseWiseCsv } from "./wise";

export function detectFormat(text: string): ImportFormat | null {
  if (looksLikeWiseCsv(text)) return "wise";
  if (looksLikeCommbankCsv(text)) return "commbank";
  return null;
}

export type ParseOptions = {
  accountId: string;
} & Omit<WiseParseOptions, "accountId">;

/**
 * Parse an export, picking the parser from the file's own shape so the user
 * does not have to declare which bank it came from.
 */
export async function parseImport(
  text: string,
  opts: ParseOptions,
): Promise<ParseResult> {
  const format = detectFormat(text);
  if (format === "wise") return parseWiseCsv(text, opts);
  if (format === "commbank") return parseCommbankCsv(text, opts.accountId);
  throw new Error(
    "Unrecognised CSV. Expected a CommBank transaction export or a Wise transaction history.",
  );
}
