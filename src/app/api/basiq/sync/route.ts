import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  basiqConfigured,
  fetchAccounts,
  fetchTransactions,
  type BasiqAccount,
} from "@/lib/basiq/server";

function mapAccountType(account: BasiqAccount): string {
  const t = `${account.class?.type ?? ""} ${account.class?.product ?? ""}`.toLowerCase();
  if (t.includes("credit")) return "credit_card";
  if (t.includes("savings") || t.includes("save")) return "savings";
  return "everyday";
}

/** Pulls the user's Basiq accounts + transactions and upserts them (deduped). */
export async function POST() {
  if (!basiqConfigured()) {
    return NextResponse.json(
      { error: "Basiq is not configured (missing BASIQ_API_KEY)." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: conn } = await supabase
    .from("basiq_connections")
    .select("basiq_user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!conn?.basiq_user_id) {
    return NextResponse.json(
      { error: "No Basiq connection. Connect a bank first." },
      { status: 400 },
    );
  }

  try {
    const [basiqAccounts, basiqTxns] = await Promise.all([
      fetchAccounts(conn.basiq_user_id),
      fetchTransactions(conn.basiq_user_id),
    ]);

    // 1) Upsert accounts (dedupe by basiq_account_id).
    if (basiqAccounts.length) {
      const accountRows = basiqAccounts.map((a) => ({
        name: a.name || a.accountNo || "Bank account",
        type: mapAccountType(a),
        institution: a.institution ?? null,
        currency: a.currency || "AUD",
        basiq_account_id: a.id,
      }));
      const { error } = await supabase
        .from("accounts")
        .upsert(accountRows, { onConflict: "user_id,basiq_account_id" });
      if (error) throw new Error(error.message);
    }

    // Map basiq account id -> our account id.
    const { data: ourAccounts, error: accErr } = await supabase
      .from("accounts")
      .select("id, basiq_account_id")
      .not("basiq_account_id", "is", null);
    if (accErr) throw new Error(accErr.message);
    const accountIdByBasiq = new Map(
      (ourAccounts ?? []).map((a) => [a.basiq_account_id, a.id]),
    );

    // 2) Upsert transactions (dedupe by basiq_transaction_id). New ones stay
    //    uncategorised so they flow into Review / the rules engine.
    const rows = basiqTxns
      .map((t) => {
        const accountId = accountIdByBasiq.get(t.account);
        if (!accountId) return null;
        const amount = Number(t.amount);
        if (Number.isNaN(amount)) return null;
        const type =
          t.direction === "credit" || amount > 0 ? "income" : "expense";
        const date = (t.postDate || t.transactionDate || "").slice(0, 10);
        if (!date) return null;
        return {
          account_id: accountId,
          date,
          description: t.description ?? null,
          amount,
          type,
          basiq_transaction_id: t.id,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const { error } = await supabase
        .from("transactions")
        .upsert(batch, {
          onConflict: "user_id,basiq_transaction_id",
          ignoreDuplicates: true,
        });
      if (error) throw new Error(error.message);
    }

    await supabase
      .from("basiq_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("user_id", user.id);

    return NextResponse.json({
      ok: true,
      accounts: basiqAccounts.length,
      transactionsProcessed: rows.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Basiq sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
