// Live backlog importer: parses the two Google Sheets CSVs and inserts them for one user
// via supabase-js using the service-role key (bypasses RLS; user_id set explicitly).
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=... IMPORT_UID=<auth user id> node scripts/import-data.mjs
//
// Idempotent-ish: lookups reuse existing accounts/categories/items by name; transactions
// are inserted with deterministic UUIDs and skipped if already present.
//
// Mapping decisions (confirmed): Investment->transfer; Software->Subscriptions; Clothes->Shopping;
// Shopify->Business; subcategory backbone + extra tokens as tags; 226 blank filler rows skipped.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const ROOT = "/Users/elias/Projects/personal-finance-app";
const UID = process.env.IMPORT_UID;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  (fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1] || "").trim();

if (!UID || !KEY || !URL) {
  console.error("Need IMPORT_UID, SUPABASE_SERVICE_ROLE_KEY env vars (and NEXT_PUBLIC_SUPABASE_URL).");
  process.exit(1);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });

// ---------- helpers ----------
function parseCSV(text) {
  const rows = []; let row = [], field = "", i = 0, inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c; }
    else { if (c === '"') inQ = true; else if (c === ",") { row.push(field); field = ""; } else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; } else if (c === "\r") {} else field += c; }
    i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}
const money = (s) => { const t = String(s).replace(/[^0-9.\-]/g, ""); if (t === "" || t === "-") return null; const n = Number(t); return Number.isNaN(n) ? null : n; };
const ddmmyyyy = (s) => { const m = String(s).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const chunk = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };

const CATEGORY_MAP = {
  "Eating Out": ["Dining Out", "expense"], "Transport": ["Transport", "expense"], "Groceries": ["Groceries", "expense"],
  "Split Bill": ["Split Bill", "expense"], "Health": ["Health", "expense"], "Entertainment": ["Entertainment", "expense"],
  "Travel/Holidays": ["Travel", "expense"], "Gifts": ["Gifts", "expense"], "Business": ["Business", "expense"],
  "Subscription": ["Subscriptions", "expense"], "Fees": ["Fees & Charges", "expense"], "Software": ["Subscriptions", "expense"],
  "Salary": ["Salary", "income"], "Refund/Rebate": ["Refunds", "income"], "Clothes": ["Shopping", "expense"],
  "Crypto": ["Crypto", "transfer"], "Personal Care": ["Personal Care", "expense"], "Vape": ["Vape", "expense"],
  "JustVolvo": ["Just Volvo", "expense"], "Parents": ["Parents", "expense"], "Interest": ["Interest", "income"],
  "Professional Services": ["Professional Services", "expense"], "Equipment": ["Equipment", "expense"], "Tax": ["Tax", "expense"],
  "Shopify": ["Business", "expense"], "Income": ["Other Income", "income"], "Transfer": ["Transfer", "transfer"],
};
const TYPE_MAP = { Expenses: "expense", Income: "income", Transfer: "transfer", Investment: "transfer" };
const ACCOUNT_TYPE = {
  "CBA Debit 1078 7721": "everyday", "CBA Account 1065 9316": "everyday", "ANZ Plus Everyday 437 188 317": "everyday",
  "ANZ Plus Save 437 188 325": "savings", "CBA Savings 06 2692 7979 5497": "savings",
};
const ASSET_COLS = {
  "Paper Cash": { cls: "paper_cash" }, "E-Cash": { cls: "ecash" }, "Savings": { cls: "savings" },
  "Superannuation": { cls: "super" }, "Crypto (EOM)": { cls: "crypto", display: "Crypto" },
  "Tyler (Oasis)": { cls: "iou" }, "Sasha (HKT Flight)": { cls: "iou" }, "HECS Debt": { cls: "hecs" },
};
const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const eomDate = (label) => { const m = String(label).trim().toUpperCase().match(/^([A-Z]{3})-(\d{4})$/); if (!m || !MONTHS[m[1]]) return null; const mm = MONTHS[m[1]]; const last = new Date(Number(m[2]), mm, 0).getDate(); return `${m[2]}-${String(mm).padStart(2, "0")}-${String(last).padStart(2, "0")}`; };

// ---------- parse transactions ----------
const tRows = parseCSV(fs.readFileSync(path.join(ROOT, "Personal Finance - Transactions.csv"), "utf8"));
const tHead = tRows[0].map((h) => h.trim());
const tIdx = Object.fromEntries(tHead.map((h, i) => [h, i]));
const tc = (r, n) => (r[tIdx[n]] ?? "").trim();

const accountsNeeded = new Map(), parentCats = new Map(), subCats = new Map(), tagsNeeded = new Set();
const txns = [];
for (const r of tRows.slice(1)) {
  const account = tc(r, "Account"); const date = ddmmyyyy(tc(r, "Date")); const amount = money(tc(r, "Amount"));
  if (!account || !date || amount === null) continue;
  const type = TYPE_MAP[tc(r, "Type")] ?? (amount < 0 ? "expense" : "income");
  const mapped = CATEGORY_MAP[tc(r, "Category")] || null;
  const catName = mapped?.[0] ?? null, catKind = mapped?.[1] ?? null;
  const subTokens = tc(r, "Subcategories").split(",").map((x) => x.trim()).filter(Boolean);
  let subName = null; const extraTags = [];
  if (catName && subTokens.length) { subName = subTokens[0]; subCats.set(`${catName}>${subName}`, { parent: catName, token: subName, kind: catKind }); for (const e of subTokens.slice(1)) { tagsNeeded.add(e); extraTags.push(e); } }
  else if (subTokens.length) { for (const t of subTokens) { tagsNeeded.add(t); extraTags.push(t); } }
  if (!accountsNeeded.has(account)) accountsNeeded.set(account, ACCOUNT_TYPE[account] || "everyday");
  if (catName && !parentCats.has(catName)) parentCats.set(catName, catKind);
  const id = crypto.randomUUID();
  txns.push({ id, account, date, descr: tc(r, "Description"), amount, type, catName, subName, tax: tc(r, "Tax-Deducatable").toUpperCase() === "TRUE", extraTags });
}

// ---------- parse assets ----------
const aRows = parseCSV(fs.readFileSync(path.join(ROOT, "Personal Finance - Assets_Liabilities.csv"), "utf8"));
const itemHeader = aRows[1].map((h) => h.trim());
const colToItem = {};
itemHeader.forEach((h, i) => { if (ASSET_COLS[h]) colToItem[i] = { name: ASSET_COLS[h].display || h, cls: ASSET_COLS[h].cls }; });
const assetItems = new Map(); const valueEntries = [];
for (const r of aRows.slice(2)) { const date = eomDate(r[0] || ""); if (!date) continue; for (const [ci, def] of Object.entries(colToItem)) { const v = money(r[ci]); if (v === null) continue; assetItems.set(def.name, def.cls); valueEntries.push({ item: def.name, date, value: v }); } }

// ---------- run ----------
function die(e) { console.error("IMPORT FAILED:", e.message || e); process.exit(1); }

try {
  // 1) accounts (no unique constraint -> insert only missing)
  const { data: existAcc } = await db.from("accounts").select("id,name").eq("user_id", UID);
  const haveAcc = new Set((existAcc || []).map((a) => a.name));
  const accIns = [...accountsNeeded].filter(([n]) => !haveAcc.has(n)).map(([name, type]) => ({ user_id: UID, name, type }));
  if (accIns.length) { const { error } = await db.from("accounts").insert(accIns); if (error) die(error); }

  // 2) parent categories (reuse seeded by name)
  let { data: cats } = await db.from("categories").select("id,name,kind,parent_id").eq("user_id", UID);
  const haveParent = new Map(cats.filter((c) => !c.parent_id).map((c) => [c.name, c.id]));
  const parIns = [...parentCats].filter(([n]) => !haveParent.has(n)).map(([name, kind]) => ({ user_id: UID, name, kind }));
  if (parIns.length) { const { error } = await db.from("categories").insert(parIns); if (error) die(error); }
  ({ data: cats } = await db.from("categories").select("id,name,kind,parent_id").eq("user_id", UID));
  const parentId = new Map(cats.filter((c) => !c.parent_id).map((c) => [c.name, c.id]));

  // 3) subcategories
  const haveSub = new Set(cats.filter((c) => c.parent_id).map((c) => `${c.parent_id}>${c.name}`));
  const subIns = [];
  for (const { parent, token, kind } of subCats.values()) { const pid = parentId.get(parent); if (pid && !haveSub.has(`${pid}>${token}`)) subIns.push({ user_id: UID, name: token, kind, parent_id: pid }); }
  if (subIns.length) { const { error } = await db.from("categories").insert(subIns); if (error) die(error); }
  ({ data: cats } = await db.from("categories").select("id,name,parent_id").eq("user_id", UID));
  const subId = new Map(cats.filter((c) => c.parent_id).map((c) => [`${c.parent_id}>${c.name}`, c.id]));

  // 4) tags
  const { data: existTags } = await db.from("tags").select("id,name").eq("user_id", UID);
  const haveTag = new Map((existTags || []).map((t) => [t.name, t.id]));
  const tagIns = [...tagsNeeded].filter((t) => !haveTag.has(t)).map((name) => ({ user_id: UID, name }));
  if (tagIns.length) { const { error } = await db.from("tags").insert(tagIns); if (error) die(error); }
  const { data: allTags } = await db.from("tags").select("id,name").eq("user_id", UID);
  const tagId = new Map(allTags.map((t) => [t.name, t.id]));

  // 5) networth: iou class + items
  let { data: cls } = await db.from("networth_classes").select("id,name").eq("user_id", UID);
  if (!cls.find((c) => c.name === "iou")) { await db.from("networth_classes").insert({ user_id: UID, name: "iou", kind: "asset", is_liquid: false }); ({ data: cls } = await db.from("networth_classes").select("id,name").eq("user_id", UID)); }
  const classId = new Map(cls.map((c) => [c.name, c.id]));
  const { data: existItems } = await db.from("networth_items").select("id,name").eq("user_id", UID);
  const haveItem = new Map((existItems || []).map((i) => [i.name, i.id]));
  const itemIns = [...assetItems].filter(([n]) => !haveItem.has(n)).map(([name, clsName]) => ({ user_id: UID, name, class_id: classId.get(clsName) }));
  if (itemIns.length) { const { error } = await db.from("networth_items").insert(itemIns); if (error) die(error); }
  const { data: allItems } = await db.from("networth_items").select("id,name").eq("user_id", UID);
  const itemId = new Map(allItems.map((i) => [i.name, i.id]));

  // account id map
  const { data: allAcc } = await db.from("accounts").select("id,name").eq("user_id", UID);
  const accId = new Map(allAcc.map((a) => [a.name, a.id]));

  // 6) transactions (batched, explicit ids)
  const txnRows = txns.map((t) => ({
    id: t.id, user_id: UID, account_id: accId.get(t.account), date: t.date, description: t.descr,
    amount: t.amount, type: t.type,
    category_id: t.catName ? parentId.get(t.catName) ?? null : null,
    subcategory_id: t.catName && t.subName ? subId.get(`${parentId.get(t.catName)}>${t.subName}`) ?? null : null,
    tax_deductible: t.tax,
  }));
  let inserted = 0;
  for (const b of chunk(txnRows, 500)) { const { error } = await db.from("transactions").upsert(b, { onConflict: "id", ignoreDuplicates: true }); if (error) die(error); inserted += b.length; }

  // 7) transaction_tags
  const ttRows = [];
  for (const t of txns) for (const tg of t.extraTags) { const tid = tagId.get(tg); if (tid) ttRows.push({ transaction_id: t.id, tag_id: tid, user_id: UID }); }
  for (const b of chunk(ttRows, 500)) { const { error } = await db.from("transaction_tags").upsert(b, { onConflict: "transaction_id,tag_id", ignoreDuplicates: true }); if (error) die(error); }

  // 8) value_entries
  const veRows = valueEntries.map((v) => ({ user_id: UID, item_id: itemId.get(v.item), date: v.date, value: v.value }));
  for (const b of chunk(veRows, 500)) { const { error } = await db.from("value_entries").upsert(b, { onConflict: "item_id,date" }); if (error) die(error); }

  console.log(JSON.stringify({ ok: true, accounts: accId.size, parentCategories: parentId.size, subcategories: subId.size, tags: tagId.size, transactions: inserted, transactionTags: ttRows.length, networthItems: itemId.size, valueEntries: veRows.length }, null, 2));
} catch (e) { die(e); }
