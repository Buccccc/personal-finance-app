/**
 * Wise ("transaction-history.csv") parser.
 *
 * Wise is a multi-currency wallet: you hold jars of NZD/IDR/THB/AUD and spend
 * from them. Reporting here is single-currency (AUD), so every row is converted
 * on the way in and the foreign detail is preserved alongside it.
 *
 * The conversion rate is NOT a live lookup. Foreign jars are treated as
 * inventory bought with AUD, and each spend is costed at the running
 * weighted-average rate of the AUD that actually funded that jar. That keeps
 * history stable: re-importing next year cannot re-price last year's holiday.
 *
 * Wise statuses need care, and the rules below were derived by reconciling the
 * whole export against the wallet's real balances:
 *   - CANCELLED            -> never happened, skip.
 *   - REFUNDED + OUT       -> charge fully reversed, no separate credit row, skip.
 *   - REFUNDED + IN, and a matching COMPLETED OUT came BEFORE it
 *                          -> a genuine refund, credit it back.
 *   - REFUNDED + IN with no earlier matching OUT
 *                          -> the reversal half of a card retry whose original
 *                             charge Wise did not export. Skipping it is what
 *                             makes the ledger tie.
 */
import { parseCsvRecords, parseMoney, sha256Hex } from "./csv";
import type { ParsedRow, ParseResult } from "./types";

const WISE_HEADER_MARKERS = [
  "Source amount (after fees)",
  "Target amount (after fees)",
  "Exchange rate",
];

export function looksLikeWiseCsv(text: string): boolean {
  const firstLine = text.slice(0, 2000).split(/\r?\n/)[0] ?? "";
  return WISE_HEADER_MARKERS.every((m) => firstLine.includes(m));
}

type WiseRecord = Record<string, string>;

const num = (s: string | undefined): number => parseMoney(s) ?? 0;
const isoDate = (s: string): string => (s ?? "").slice(0, 10);

/** A foreign jar, valued at the AUD that bought the units it holds. */
type Jar = { units: number; audCost: number };

/**
 * AUD per single unit of the currency. One AUD costs one AUD by definition, so
 * that jar never floats: letting it drift on rounding would silently re-price
 * ordinary domestic spending.
 */
function unitCost(currency: string, jar: Jar | undefined, fallback: number): number {
  if (currency === "AUD") return 1;
  if (!jar || jar.units <= 0 || jar.audCost <= 0) return fallback;
  return jar.audCost / jar.units;
}

/** Take `units` out of a jar, returning the AUD cost released with them. */
function withdraw(jars: Map<string, Jar>, currency: string, units: number, fallback: number): number {
  const jar = jars.get(currency);
  const rate = unitCost(currency, jar, fallback);
  const cost = units * rate;
  if (jar) {
    jar.units -= units;
    jar.audCost -= cost;
    // Floating-point dust: once a jar is empty, keep it exactly empty.
    if (Math.abs(jar.units) < 1e-6) {
      jar.units = 0;
      jar.audCost = 0;
    }
  }
  return cost;
}

function deposit(jars: Map<string, Jar>, currency: string, units: number, audCost: number): void {
  const jar = jars.get(currency) ?? { units: 0, audCost: 0 };
  jar.units += units;
  jar.audCost += audCost;
  jars.set(currency, jar);
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export type WiseParseOptions = {
  accountId: string;
  /**
   * Current AUD value of the wallet, as Wise displays it. Used only to book a
   * single closing FX revaluation so the account balance matches reality.
   */
  currentBalanceAud?: number | null;
  /** Units held before the export window opened, e.g. { THB: 4.16 }. */
  openingUnits?: Record<string, number>;
};

export async function parseWiseCsv(
  text: string,
  opts: WiseParseOptions,
): Promise<ParseResult> {
  const records = parseCsvRecords(text);
  // Wise exports newest-first; inventory accounting has to run forwards.
  const chron = records
    .slice()
    .reverse()
    .filter((r) => (r.ID ?? "") !== "");

  const jars = new Map<string, Jar>();
  const rows: ParsedRow[] = [];
  const notes: string[] = [];
  /** Latest observed AUD-per-unit per currency, for pricing empty jars. */
  const lastKnownRate = new Map<string, number>();

  const push = async (
    r: Omit<ParsedRow, "hash"> & { hashKey: string },
  ): Promise<void> => {
    const { hashKey, ...rest } = r;
    const amount = round2(rest.amount);
    // Wise emits genuine zero-value rows (a fee waived, a zero-dollar auth).
    // They carry no information and the ledger treats zero-amount rows as a
    // data fault, so drop them rather than importing noise.
    if (amount === 0) return;
    rows.push({
      ...rest,
      amount,
      hash: await sha256Hex(`${opts.accountId}|wise|${hashKey}`),
    });
  };

  // Seed anything held before the window, so the ledger can tie to the wallet.
  const firstDate = chron.length ? isoDate(chron[0]["Created on"]) : null;
  for (const [currency, units] of Object.entries(opts.openingUnits ?? {})) {
    if (!units) continue;
    // Priced from the first conversion that touches this currency.
    const seedRow = chron.find(
      (r) => r["Source currency"] === currency && num(r["Exchange rate"]) > 0,
    );
    let audPerUnit = 0;
    if (seedRow) {
      const target = seedRow["Target currency"];
      const targetRow = chron.find(
        (r) => r["Target currency"] === target && r["Source currency"] === "AUD",
      );
      const targetAudPerUnit = targetRow
        ? num(targetRow["Source amount (after fees)"]) /
          num(targetRow["Target amount (after fees)"])
        : 0;
      audPerUnit = num(seedRow["Exchange rate"]) * targetAudPerUnit;
    }
    const audCost = round2(units * audPerUnit);
    deposit(jars, currency, units, audCost);
    lastKnownRate.set(currency, audPerUnit);
    if (audCost !== 0 && firstDate) {
      await push({
        date: firstDate,
        amount: audCost,
        description: `Opening balance — ${units} ${currency} held before this statement`,
        type: "transfer",
        originalAmount: units,
        originalCurrency: currency,
        fxRate: audPerUnit > 0 ? 1 / audPerUnit : null,
        hashKey: `opening|${currency}|${units}`,
      });
    }
    notes.push(
      `Seeded opening balance of ${units} ${currency} (≈ A$${audCost.toFixed(2)}) held before ${firstDate}.`,
    );
  }

  let skippedCancelled = 0;
  let skippedReversed = 0;
  let skippedRetry = 0;

  for (let i = 0; i < chron.length; i++) {
    const r: WiseRecord = chron[i];
    const id = r.ID;
    const status = r.Status;
    const direction = r.Direction;
    const date = isoDate(r["Created on"]);
    const srcCur = r["Source currency"];
    const srcAmt = num(r["Source amount (after fees)"]);
    const tgtCur = r["Target currency"];
    const tgtAmt = num(r["Target amount (after fees)"]);
    const feeCur = r["Source fee currency"];
    const feeAmt = num(r["Source fee amount"]);
    const merchant = (r["Target name"] || r["Source name"] || "").trim();
    const wiseCategory = (r.Category || "").trim();

    if (status === "CANCELLED") {
      skippedCancelled++;
      continue;
    }

    if (status === "REFUNDED") {
      if (direction === "OUT") {
        // Charged and reversed with no separate credit row: net zero.
        skippedReversed++;
        continue;
      }
      // A credit. Only real if its matching charge already happened.
      const payer = (r["Source name"] || "").trim();
      const hasEarlierCharge = chron
        .slice(0, i)
        .some(
          (p) =>
            p.Status === "COMPLETED" &&
            p.Direction === "OUT" &&
            (p["Target name"] || "").trim() === payer &&
            p["Source amount (after fees)"] === r["Source amount (after fees)"] &&
            p["Source currency"] === srcCur,
        );
      if (!hasEarlierCharge) {
        skippedRetry++;
        continue;
      }
      const rate = unitCost(srcCur, jars.get(srcCur), lastKnownRate.get(srcCur) ?? 0);
      const aud = srcAmt * rate;
      deposit(jars, srcCur, srcAmt, aud);
      await push({
        date,
        amount: aud,
        description: `Refund — ${payer}`,
        type: "income",
        originalAmount: srcCur === "AUD" ? null : srcAmt,
        originalCurrency: srcCur === "AUD" ? null : srcCur,
        fxRate: srcCur === "AUD" ? null : rate > 0 ? 1 / rate : null,
        suggestedCategory: "Refunds",
        hashKey: `${id}|${srcCur}`,
      });
      continue;
    }

    // ---- Money arriving into the wallet -----------------------------------
    if (direction === "IN") {
      if (srcCur === "AUD") {
        // Funded from an Australian bank account. The bank side of this shows
        // up in the CommBank/ANZ export, so it is a transfer, not income.
        const grossAud = srcAmt + (feeCur === "AUD" ? feeAmt : 0);
        await push({
          date,
          amount: grossAud,
          description: `Transfer in from bank${tgtCur !== "AUD" ? ` → ${tgtAmt} ${tgtCur}` : ""}`,
          type: "transfer",
          hashKey: `${id}|in`,
        });
        if (tgtCur === "AUD") {
          deposit(jars, "AUD", tgtAmt, tgtAmt);
          lastKnownRate.set("AUD", 1);
        } else {
          // srcAmt AUD (after fees) is what actually bought tgtAmt units.
          deposit(jars, tgtCur, tgtAmt, srcAmt);
          lastKnownRate.set(tgtCur, tgtAmt > 0 ? srcAmt / tgtAmt : 0);
        }
        if (feeAmt > 0 && feeCur === "AUD") {
          await push({
            date,
            amount: -feeAmt,
            description: `Wise conversion fee — AUD → ${tgtCur}`,
            type: "expense",
            suggestedCategory: "Fees & Charges",
            hashKey: `${id}|fee`,
          });
        }
        continue;
      }

      // Arrived already in a foreign currency: new units with no AUD cost of
      // their own, so value them at what that jar is currently worth.
      const rate = unitCost(tgtCur, jars.get(tgtCur), lastKnownRate.get(tgtCur) ?? 0);
      const aud = tgtAmt * rate;
      deposit(jars, tgtCur, tgtAmt, aud);
      await push({
        date,
        amount: aud,
        description: `Received ${tgtAmt} ${tgtCur}`,
        type: "income",
        originalAmount: tgtAmt,
        originalCurrency: tgtCur,
        fxRate: rate > 0 ? 1 / rate : null,
        flag: "Foreign-currency deposit — confirm the source before categorising",
        hashKey: `${id}|${tgtCur}`,
      });
      continue;
    }

    // ---- Converting between your own jars ---------------------------------
    if (direction === "NEUTRAL") {
      const rate = unitCost(srcCur, jars.get(srcCur), lastKnownRate.get(srcCur) ?? 0);
      const feeAud = feeCur === srcCur ? feeAmt * rate : feeAmt;
      // The units leave, their AUD cost carries over to the new jar. No
      // cashflow happens: this is one wallet moving value between pockets.
      const released = withdraw(jars, srcCur, srcAmt, rate);
      withdraw(jars, feeCur, feeCur === srcCur ? feeAmt : 0, rate);
      deposit(jars, tgtCur, tgtAmt, released);
      lastKnownRate.set(tgtCur, tgtAmt > 0 ? released / tgtAmt : 0);
      // Only a non-AUD fee needs the FX columns; an AUD fee is already in the
      // reporting currency and `amount` says everything there is to say.
      const feeIsForeign = feeCur === srcCur && srcCur !== "AUD";
      if (feeAud > 0) {
        await push({
          date,
          amount: -feeAud,
          description: `Wise conversion fee — ${srcCur} → ${tgtCur}`,
          type: "expense",
          originalAmount: feeIsForeign ? -feeAmt : null,
          originalCurrency: feeIsForeign ? feeCur : null,
          fxRate: feeIsForeign && rate > 0 ? 1 / rate : null,
          suggestedCategory: "Fees & Charges",
          hashKey: `${id}|fee`,
        });
      }
      continue;
    }

    // ---- Money leaving: card purchases and Wise's own charges -------------
    const rate = unitCost(srcCur, jars.get(srcCur), lastKnownRate.get(srcCur) ?? 0);
    const spentUnits = srcAmt + (feeCur === srcCur ? feeAmt : 0);
    const aud = withdraw(jars, srcCur, spentUnits, rate);
    const isCardOrder = id.startsWith("CARD_ORDER");
    await push({
      date,
      amount: -aud,
      description: isCardOrder ? "Wise card order fee" : merchant || "Wise card purchase",
      type: "expense",
      originalAmount: srcCur === "AUD" ? null : -spentUnits,
      originalCurrency: srcCur === "AUD" ? null : srcCur,
      fxRate: srcCur === "AUD" ? null : rate > 0 ? 1 / rate : null,
      suggestedCategory: isCardOrder ? "Fees & Charges" : wiseCategory || null,
      // One Wise ID can cover two legs of the same purchase when it draws on
      // more than one jar, so the funding currency is part of the key.
      hashKey: `${id}|${srcCur}`,
    });
  }

  // ---- Close out: unrealised FX on whatever is still held ------------------
  const costBasis = [...jars.values()].reduce((s, j) => s + j.audCost, 0);
  let closingBalance: number | null = null;
  if (opts.currentBalanceAud != null) {
    closingBalance = opts.currentBalanceAud;
    // Measured against the rounded rows actually being written, not the raw
    // cost basis, so `balance` equals `sum(amount)` to the cent. The cent or
    // two of difference is rounding dust, which belongs in the same line as
    // the real FX movement rather than left to drift.
    const booked = rows.reduce((s, r) => s + r.amount, 0);
    const revaluation = round2(opts.currentBalanceAud - booked);
    if (Math.abs(revaluation) >= 0.01) {
      const held = [...jars.entries()]
        .filter(([, j]) => Math.abs(j.units) > 1e-6)
        .map(([c, j]) => `${round2(j.units)} ${c}`)
        .join(", ");
      const lastDate = rows.length ? rows[rows.length - 1].date : firstDate;
      await push({
        date: lastDate ?? new Date().toISOString().slice(0, 10),
        amount: revaluation,
        description: `FX revaluation — ${held || "held balances"} marked to market`,
        type: "transfer",
        hashKey: `revaluation|${lastDate}|${revaluation}`,
      });
      notes.push(
        `Held ${held || "nothing"} at a cost of A$${costBasis.toFixed(2)}; wallet now shows A$${opts.currentBalanceAud.toFixed(2)}. Booked A$${revaluation.toFixed(2)} unrealised FX ${revaluation >= 0 ? "gain" : "loss"}.`,
      );
    }
  }

  if (skippedCancelled)
    notes.push(`Skipped ${skippedCancelled} cancelled transaction(s).`);
  if (skippedReversed)
    notes.push(`Skipped ${skippedReversed} charge(s) that were fully reversed.`);
  if (skippedRetry)
    notes.push(
      `Skipped ${skippedRetry} reversal(s) that preceded their own charge (card retries).`,
    );

  rows.sort((a, b) => a.date.localeCompare(b.date));
  return { format: "wise", rows, closingBalance, notes };
}
