/**
 * Maps an account (by name/institution) to an Australian bank's brand identity.
 * We render a coloured monogram badge rather than bundling trademarked logo
 * artwork; swap in real SVGs later if desired.
 */
export type BankBrand = {
  key: string;
  label: string; // short monogram, e.g. "CBA"
  /** background + foreground as inline style colours (work in both themes) */
  bg: string;
  fg: string;
};

const BRANDS: { match: RegExp; brand: BankBrand }[] = [
  { match: /(cba|commbank|commonwealth)/i, brand: { key: "cba", label: "CBA", bg: "#FFCC00", fg: "#000000" } },
  { match: /\banz\b/i, brand: { key: "anz", label: "ANZ", bg: "#007DBA", fg: "#FFFFFF" } },
  { match: /(nab|national australia)/i, brand: { key: "nab", label: "NAB", bg: "#E30613", fg: "#FFFFFF" } },
  { match: /(westpac|\bwbc\b)/i, brand: { key: "wbc", label: "WBC", bg: "#DA1710", fg: "#FFFFFF" } },
  { match: /\bing\b/i, brand: { key: "ing", label: "ING", bg: "#FF6200", fg: "#FFFFFF" } },
  { match: /macquarie/i, brand: { key: "mqg", label: "MQG", bg: "#000000", fg: "#FFFFFF" } },
  { match: /(up bank|\bup\b)/i, brand: { key: "up", label: "UP", bg: "#FF7A64", fg: "#1C1C1C" } },
  { match: /(bendigo)/i, brand: { key: "ben", label: "BEN", bg: "#7A1F2B", fg: "#FFFFFF" } },
  { match: /(suncorp)/i, brand: { key: "sun", label: "SUN", bg: "#FFB81C", fg: "#1C1C1C" } },
  { match: /(st\.?\s?george|stgeorge)/i, brand: { key: "sgb", label: "STG", bg: "#00A04A", fg: "#FFFFFF" } },
];

function initials(text: string): string {
  const words = text.replace(/[^a-zA-Z ]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "•";
  return (words[0][0] + (words[1]?.[0] ?? "")).toUpperCase();
}

export function bankBrand(name: string, institution?: string | null): BankBrand {
  const haystack = `${institution ?? ""} ${name}`;
  for (const entry of BRANDS) {
    if (entry.match.test(haystack)) return entry.brand;
  }
  // Fallback: neutral monogram derived from the account name.
  return { key: "generic", label: initials(name), bg: "#6366F1", fg: "#FFFFFF" };
}
