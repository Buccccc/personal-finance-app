// Builds idempotent SQL to import the Google Sheets backlog for one user.
// Usage: IMPORT_UID=<auth.users.id> node scripts/build-import-sql.mjs
// Emits SQL files into scripts/out/ which are then run via the Supabase MCP (execute_sql).
//
// Mapping decisions (confirmed by Elias):
//  - Investment type -> 'transfer' (excluded from cashflow)
//  - Software -> Subscriptions ; Clothes -> Shopping ; Shopify -> Business (merges/renames)
//  - Subcategory backbone + tags: first subcat token -> subcategory (child of parent);
//    extra tokens on multi-value rows -> tags
//  - 226 blank filler rows skipped (require account+date+amount)

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const UID = process.env.IMPORT_UID;
if (!UID) {
  console.error("ERROR: set IMPORT_UID=<user uuid> env var");
  process.exit(1);
}

const ROOT = "/Users/elias/Projects/personal-finance-app";
const OUT = path.join(ROOT, "scripts", "out");
fs.mkdirSync(OUT, { recursive: true });

// ---------- CSV parser (RFC4180-ish) ----------
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", i = 0, inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
    i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const money = (s) => {
  const t = String(s).replace(/[^0-9.\-]/g, "");
  if (t === "" || t === "-") return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
};
const ddmmyyyy = (s) => {
  const m = String(s).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
};

// ---------- maps ----------
const CATEGORY_MAP = {
  "Eating Out": ["Dining Out", "expense"],
  "Transport": ["Transport", "expense"],
  "Groceries": ["Groceries", "expense"],
  "Split Bill": ["Split Bill", "expense"],
  "Health": ["Health", "expense"],
  "Entertainment": ["Entertainment", "expense"],
  "Travel/Holidays": ["Travel", "expense"],
  "Gifts": ["Gifts", "expense"],
  "Business": ["Business", "expense"],
  "Subscription": ["Subscriptions", "expense"],
  "Fees": ["Fees & Charges", "expense"],
  "Software": ["Subscriptions", "expense"],   // merge
  "Salary": ["Salary", "income"],
  "Refund/Rebate": ["Refunds", "income"],
  "Clothes": ["Shopping", "expense"],          // rename
  "Crypto": ["Crypto", "transfer"],
  "Personal Care": ["Personal Care", "expense"],
  "Vape": ["Vape", "expense"],
  "JustVolvo": ["Just Volvo", "expense"],
  "Parents": ["Parents", "expense"],
  "Interest": ["Interest", "income"],
  "Professional Services": ["Professional Services", "expense"],
  "Equipment": ["Equipment", "expense"],
  "Tax": ["Tax", "expense"],
  "Shopify": ["Business", "expense"],          // merge
  "Income": ["Other Income", "income"],
  "Transfer": ["Transfer", "transfer"],
};
const TYPE_MAP = {
  "Expenses": "expense",
  "Income": "income",
  "Transfer": "transfer",
  "Investment": "transfer",
};
const ACCOUNT_TYPE = {
  "CBA Debit 1078 7721": "everyday",
  "CBA Account 1065 9316": "everyday",
  "ANZ Plus Everyday 437 188 317": "everyday",
  "ANZ Plus Save 437 188 325": "savings",
  "CBA Savings 06 2692 7979 5497": "savings",
};

// ---------- read transactions ----------
const tTxt = fs.readFileSync(path.join(ROOT, "Personal Finance - Transactions.csv"), "utf8");
const tRows = parseCSV(tTxt);
const tHead = tRows[0].map((h) => h.trim());
const tIdx = Object.fromEntries(tHead.map((h, i) => [h, i]));
const tcol = (r, n) => (r[tIdx[n]] ?? "").trim();

const txns = [];
const accounts = new Map();        // name -> type
const parentCats = new Map();      // cleanName -> kind
const subCats = new Map();         // `${parent}>${token}` -> {parent, token, kind}
const tags = new Set();

for (const r of tRows.slice(1)) {
  const account = tcol(r, "Account");
  const date = ddmmyyyy(tcol(r, "Date"));
  const amount = money(tcol(r, "Amount"));
  if (!account || !date || amount === null) continue; // skip filler

  let type = TYPE_MAP[tcol(r, "Type")] ?? (amount < 0 ? "expense" : "income");
  const rawCat = tcol(r, "Category");
  const mapped = CATEGORY_MAP[rawCat] || null;
  const catName = mapped ? mapped[0] : null;
  const catKind = mapped ? mapped[1] : null;

  // subcategories: split, first -> subcat, rest -> tags
  const subTokens = tcol(r, "Subcategories").split(",").map((x) => x.trim()).filter(Boolean);
  let subName = null;
  if (catName && subTokens.length) {
    subName = subTokens[0];
    subCats.set(`${catName}>${subName}`, { parent: catName, token: subName, kind: catKind });
    for (const extra of subTokens.slice(1)) tags.add(extra);
  } else if (subTokens.length) {
    // no category but has tokens -> tags
    for (const t of subTokens) tags.add(t);
  }

  const tax = tcol(r, "Tax-Deducatable").toUpperCase() === "TRUE";

  if (!accounts.has(account)) accounts.set(account, ACCOUNT_TYPE[account] || "everyday");
  if (catName && !parentCats.has(catName)) parentCats.set(catName, catKind);

  const id = crypto.randomUUID();
  txns.push({
    id, account, date,
    descr: tcol(r, "Description"),
    amount, type, catName, subName, tax,
    rowTags: catName && subTokens.length ? subTokens.slice(1) : (catName ? [] : subTokens),
  });
}

// ---------- read assets/liabilities ----------
const aTxt = fs.readFileSync(path.join(ROOT, "Personal Finance - Assets_Liabilities.csv"), "utf8");
const aRows = parseCSV(aTxt);
// row0: section headers; row1: item headers; row2+: data
const itemHeader = aRows[1].map((h) => h.trim());
// column -> {name, class, kind}
const ASSET_COLS = {
  "Paper Cash": { cls: "paper_cash", kind: "asset", liquid: true },
  "E-Cash": { cls: "ecash", kind: "asset", liquid: true },
  "Savings": { cls: "savings", kind: "asset", liquid: true },
  "Superannuation": { cls: "super", kind: "asset", liquid: false },
  "Crypto (EOM)": { cls: "crypto", kind: "asset", liquid: true },
  "Tyler (Oasis)": { cls: "iou", kind: "asset", liquid: false },
  "Sasha (HKT Flight)": { cls: "iou", kind: "asset", liquid: false },
  "HECS Debt": { cls: "hecs", kind: "liability", liquid: false },
};
const MONTHS = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };
const eomDate = (label) => {
  const m = label.trim().toUpperCase().match(/^([A-Z]{3})-(\d{4})$/);
  if (!m) return null;
  const mm = MONTHS[m[1]];
  if (!mm) return null;
  const last = new Date(Number(m[2]), Number(mm), 0).getDate();
  return `${m[2]}-${mm}-${String(last).padStart(2, "0")}`;
};

const colToItem = {}; // colIndex -> item def
itemHeader.forEach((h, i) => { if (ASSET_COLS[h]) colToItem[i] = { name: h.replace(" (EOM)", ""), header: h, ...ASSET_COLS[h] }; });
const items = new Map(); // name -> {cls, kind, liquid}
const valueEntries = []; // {item, date, value}
for (const r of aRows.slice(2)) {
  const date = eomDate(r[0] || "");
  if (!date) continue;
  for (const [ci, def] of Object.entries(colToItem)) {
    const v = money(r[ci]);
    if (v === null) continue; // "-" => no entry
    items.set(def.name, { cls: def.cls, kind: def.kind, liquid: def.liquid });
    valueEntries.push({ item: def.name, date, value: v });
  }
}

// ============================================================
// Emit SQL
// ============================================================
const U = q(UID);

// 01 setup: accounts, categories, subcategories, tags, iou class, networth items, staging tables
let setup = `-- 01 setup (idempotent)\n`;
for (const [name, type] of accounts) {
  setup += `insert into public.accounts (user_id,name,type) select ${U},${q(name)},${q(type)} where not exists (select 1 from public.accounts where user_id=${U} and name=${q(name)});\n`;
}
for (const [name, kind] of parentCats) {
  setup += `insert into public.categories (user_id,name,kind) select ${U},${q(name)},${q(kind)} where not exists (select 1 from public.categories where user_id=${U} and name=${q(name)} and parent_id is null);\n`;
}
for (const { parent, token, kind } of subCats.values()) {
  setup += `insert into public.categories (user_id,name,kind,parent_id) select ${U},${q(token)},${q(kind)}, p.id from public.categories p where p.user_id=${U} and p.name=${q(parent)} and p.parent_id is null and not exists (select 1 from public.categories s where s.user_id=${U} and s.name=${q(token)} and s.parent_id=p.id);\n`;
}
for (const t of tags) {
  setup += `insert into public.tags (user_id,name) select ${U},${q(t)} where not exists (select 1 from public.tags where user_id=${U} and name=${q(t)});\n`;
}
// iou class + networth items
setup += `insert into public.networth_classes (user_id,name,kind,is_liquid) select ${U},'iou','asset',false where not exists (select 1 from public.networth_classes where user_id=${U} and name='iou');\n`;
for (const [name, def] of items) {
  setup += `insert into public.networth_items (user_id,name,class_id) select ${U},${q(name)}, c.id from public.networth_classes c where c.user_id=${U} and c.name=${q(def.cls)} and not exists (select 1 from public.networth_items where user_id=${U} and name=${q(name)});\n`;
}
// staging tables
setup += `drop table if exists public.import_txn; drop table if exists public.import_txntag;\n`;
setup += `create table public.import_txn (txn_id uuid, account text, dt date, descr text, amount numeric, type text, cat text, subcat text, tax boolean);\n`;
setup += `create table public.import_txntag (txn_id uuid, tag text);\n`;
fs.writeFileSync(path.join(OUT, "01_setup.sql"), setup);

// 02 stage txns (batched)
const BATCH = 400;
let fileN = 0;
for (let i = 0; i < txns.length; i += BATCH) {
  const chunk = txns.slice(i, i + BATCH);
  const vals = chunk.map((t) =>
    `(${q(t.id)},${q(t.account)},${q(t.date)},${q(t.descr)},${t.amount},${q(t.type)},${t.catName ? q(t.catName) : "null"},${t.subName ? q(t.subName) : "null"},${t.tax})`
  ).join(",\n");
  fileN++;
  fs.writeFileSync(path.join(OUT, `02_stage_txn_${String(fileN).padStart(2, "0")}.sql`),
    `insert into public.import_txn (txn_id,account,dt,descr,amount,type,cat,subcat,tax) values\n${vals};\n`);
}

// 03 stage tags
const tagPairs = [];
for (const t of txns) for (const tg of t.rowTags) tagPairs.push(`(${q(t.id)},${q(tg)})`);
let tagSql = "";
for (let i = 0; i < tagPairs.length; i += BATCH) {
  tagSql += `insert into public.import_txntag (txn_id,tag) values\n${tagPairs.slice(i, i + BATCH).join(",\n")};\n`;
}
fs.writeFileSync(path.join(OUT, "03_stage_tags.sql"), tagSql || "-- no tag pairs\n");

// 04 finalize: resolve + insert into real tables, then drop staging
let fin = `-- 04 finalize\n`;
fin += `insert into public.transactions (id,user_id,account_id,date,description,amount,type,category_id,subcategory_id,tax_deductible)
select s.txn_id, ${U}, a.id, s.dt, s.descr, s.amount, s.type,
  c.id,
  sc.id,
  coalesce(s.tax,false)
from public.import_txn s
join public.accounts a on a.user_id=${U} and a.name=s.account
left join public.categories c on c.user_id=${U} and c.name=s.cat and c.parent_id is null
left join public.categories sc on sc.user_id=${U} and sc.name=s.subcat and sc.parent_id=c.id
where not exists (select 1 from public.transactions t where t.id=s.txn_id);\n`;
fin += `insert into public.transaction_tags (transaction_id,tag_id,user_id)
select g.txn_id, tg.id, ${U}
from public.import_txntag g
join public.tags tg on tg.user_id=${U} and tg.name=g.tag
join public.transactions t on t.id=g.txn_id
on conflict do nothing;\n`;
fin += `drop table if exists public.import_txn; drop table if exists public.import_txntag;\n`;
fs.writeFileSync(path.join(OUT, "04_finalize.sql"), fin);

// 05 assets -> value_entries
let assetSql = `-- 05 value_entries\n`;
for (const ve of valueEntries) {
  assetSql += `insert into public.value_entries (user_id,item_id,date,value) select ${U}, i.id, ${q(ve.date)}, ${ve.value} from public.networth_items i where i.user_id=${U} and i.name=${q(ve.item)} on conflict (item_id,date) do update set value=excluded.value;\n`;
}
fs.writeFileSync(path.join(OUT, "05_assets.sql"), assetSql);

// summary
console.log(JSON.stringify({
  txns: txns.length,
  accounts: [...accounts.keys()],
  parentCategories: [...parentCats.keys()],
  subcategories: subCats.size,
  tags: tags.size,
  tagPairs: tagPairs.length,
  assetItems: [...items.keys()],
  valueEntries: valueEntries.length,
  stageTxnFiles: fileN,
}, null, 2));
