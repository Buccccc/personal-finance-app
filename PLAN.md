# Personal Finance App — PLAN

> Status: concept / outline. Personal use first, productise later.
> Owner: Elias. Started: 2026-06-02.

This document is the concept outline. It captures *what the app is*, the mental model, the data model, every view, and the key calculations. Build order is at the bottom.

---

## 1. What this is

A personal finance app that replaces the Google Sheets I've been running since **1 December 2024**:

- A **transactions sheet** (manual CSV downloads from CommBank).
- An **assets & liabilities sheet** updated monthly since Dec 2024.
- A pile of dashboards and graphs built on top of those two.

The app replicates those dashboards/graphs in something nicer to use, adds automatic bank feeds (Basiq), and adds a couple of new ideas (bills calendar, virtual allocations).

Personal v1. If it's good, productise it later.

---

## 2. The mental model (read this before the data model)

Money in this app lives in **three worlds**, and keeping them separate is what makes the whole thing make sense:

### World A — Flows (transactions)
Things that *move*. Every expense, income, and transfer. These belong to an **account** (CommBank everyday, credit card, etc.) and accumulate over time. This world answers *"what did I spend / earn?"*

### World B — Balances (valuations / net worth)
Things that *have a value at a point in time*. Super, crypto, savings, paper cash, HECS, credit card balance. These don't have transactions I care about — I just record *what they're worth* on a given date. This world answers *"what am I worth?"*

Some items live in **both** worlds:
- My **credit card** has transactions (World A) *and* an outstanding balance that's a liability (World B).
- A **bank account** has transactions (World A) *and* a balance that's a liquid asset (World B).

That's fine. The transaction feed and the net-worth ledger are computed independently. I don't try to make one derive the other (Sheets didn't either — that's why there were two sheets).

### World C — Virtual (allocations)
A *planning overlay* on top of my real balances. I split my actual cash into buckets ("set aside $X for Y") **without touching real accounts**. Pure data in Supabase, zero effect on World A or B. (Detail in the Allocations view below.)

---

## 3. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js (App Router) + Tailwind + shadcn/ui | productisation-ready |
| Server state | **TanStack Query** | caching, optimistic updates, background refetch — makes editing txns/categories feel instant |
| Tables | **TanStack Table** | the Transactions feed: sort/filter/pin/bulk-actions without hand-rolling. shadcn data-table is built on it |
| DB / auth / API | **Supabase** (Postgres + RLS + Auth) | row-level security = data isolated per user from day one |
| Charts | **Tremor** | shadcn-aligned dashboard charts; built on Recharts under the hood, so it's an upgrade not a swap |
| Polish | **Motion** (ex-Framer Motion) + **Magic UI** | page transitions, chart/card animations. Baked in from the start — want it to feel premium |
| Bank feed | **Basiq** (~$0.50/user) — confirmed, using it | AU CDR open banking |
| AI (later) | **OpenRouter, cheap model** (Haiku / DeepSeek / Qwen) + hard spend cap | fallback categoriser + future insight features. NOT a premium API, NOT day one |
| Hosting | Vercel | free tier fine for personal |

Roadmap after web: PWA (installable on phone) → optional standalone Swift app.

**Calculations live in Postgres, not the frontend.** Net worth, savings rate, MoM/YoY etc. are SQL views (§6). The web app, PWA, future Swift app, and any AI all read the *same* numbers — one source of truth.

---

## 4. Data model

Tables (Supabase / Postgres). Every table is user-scoped via RLS.

### World A — Flows

**`accounts`** — anything a transaction can sit on
- `id`, `name`, `type` (`everyday` / `savings` / `credit_card` / `cash` / `ecash`), `institution`, `basiq_account_id` (nullable — set when linked to Basiq), `currency`

**`transactions`**
- `id`, `account_id`, `date`, `description` (raw bank text), `amount`
- `type` (`expense` / `income` / `transfer`)
- `merchant_id` (nullable → normalised merchant, see below)
- `category_id`, `subcategory_id` (nullable — `subcategory_id` is just another `categories` row whose `parent_id` is the category)
- `tax_deductible` (bool)
- `transfer_group_id` (nullable — links the two legs of a transfer so they net to zero)
- AI-assist columns (populated later, columns exist from day one): `ai_category_id`, `ai_confidence`, `ai_reason`, `human_verified` (bool)
- `basiq_transaction_id` (nullable), `notes`

**`merchants`** — normalise messy bank text to one entity
- `id`, `name` (canonical, e.g. `Woolworths`), `default_category_id` (nullable)
- **`merchant_aliases`**: `id`, `merchant_id`, `pattern` (e.g. `WOOLWORTHS 4378`, `WOOLIES`, `WOOLWORTHS MOORABBIN`)
- collapses raw descriptions to one merchant → cleaner reporting + dramatically better rules/AI

**`categories`**
- `id`, `name`, `kind` (`expense` / `income` / `transfer`), `parent_id` (nullable → this is how subcategories work)
- `kind` is a **soft UX hint** — it filters the category picker so tagging an expense only shows expense categories. The *transaction's* own `type` stays the source of truth; `kind` just keeps the dropdown sane.

**`tags`** + **`transaction_tags`** (many-to-many)
- tags are the flexible layer on top of the category/subcategory hierarchy

**`categorisation_rules`** — deterministic, free, runs before any AI
- `id`, `match_type` (`merchant` / `description_contains` / `amount` / combo), `pattern`, `category_id`, `subcategory_id` (nullable), `set_tax_deductible` (nullable), `priority`
- examples: `contains "SHELL" → Fuel`, `merchant = Woolworths → Groceries`
- **Categorisation cascade:** rule match → else merchant default → else (later) cheap AI suggestion → else uncategorised. AI only fires when rules miss, which keeps API spend near zero.

> **Confirmed:** category → subcategory as the backbone, with free-form tags on top. Both layers, used together.

### Recurring / bills (drives the calendar)

**`recurring_items`**
- `id`, `name`, `amount`, `direction` (`in` / `out`)
- `frequency` (`weekly` / `fortnightly` / `monthly` / `quarterly` / `yearly`)
- `next_due_date`, `account_id`, `category_id`, `active` (bool)
- used to *project* future cash in/out onto the calendar

### World B — Balances (net worth)

**`networth_classes`** — lookup table so I can invent new classes without an enum migration
- `id`, `name` (e.g. `paper_cash`, `super`, `crypto`, `property`, `hecs`, `credit_card`, later `gold`, `car`, `business_equity` …)
- `kind` (`asset` / `liability`)
- `is_liquid` (bool — lives here, on the class, so it feeds the liquidity ratio consistently)
- a lookup table (not free text) avoids `Crypto` vs `crypto` fragmentation while staying open-ended

**`networth_items`** — each asset or liability line
- `id`, `name`, `class_id` (→ `networth_classes`), `active` (bool)
- `kind` and `is_liquid` come from the class

**`value_entries`** — point-in-time values (this is the key one)
- `id`, `item_id`, `date`, `value`
- I add a value *whenever I want* — not forced monthly. Each entry is a dated data point.
- Net worth on any date = sum of latest asset values ≤ that date − sum of latest liability values ≤ that date.
- **Month-end rule:** monthly reports use the entry dated the last day of the month (or the latest entry on/before it). I can always **add or edit a month-end-dated entry** so the reported figure is correct even if I logged it a day late. Month-end figures are the ones that matter most → they're always preserved as their own data points.

### World C — Virtual allocations

**`allocation_pools`** — the source balances I'm carving up
- `id`, `name`, `source` (`balance` / `savings`), `linked_account_id` (nullable)
- two pools to start: **Balance (e-cash)** and **Savings**

**`allocation_items`** — the buckets inside a pool
- `id`, `pool_id`, `name`, `amount`, `priority_order`, `target_amount` (nullable), `notes`
- "unallocated" = pool total − sum(items). Purely virtual; never writes to `accounts` or `transactions`.

---

## 5. The views (pages)

### 5.1 Transactions
The full feed (TanStack Table): expenses, income, transfers. Columns:
- account/card · date · merchant · description · amount · type (expense/income/transfer) · category · subcategory · tags · **tax-deductible** flag

Filter + search + bulk categorise. Transfers shown as linked pairs (net zero). Source: Basiq feed + manual entry + CSV import (for the Dec 2024 → now backlog).

**Review mode — swipe-to-categorise (Tinder-style).** New/uncategorised transactions don't dump into a boring grid. They come up as a **card stack**, one at a time:
- the card shows merchant, amount, date, and the **suggested category + confidence** (from the rule/merchant/AI cascade)
- **swipe right / tap ✓** → accept the suggestion (sets `human_verified`)
- **swipe up / tap** → pick a different category (quick searchable picker)
- **swipe left** → skip / flag for later
- quick toggles on the card for **tax-deductible** and tags
This is the day-to-day categorising flow; the full table stays for bulk edits and lookups. Motion handles the card animations.

### 5.2 Bills + Calendar
- List of subscriptions / recurring items (in *and* out).
- **Calendar view**: each day shows projected money movement — **red** for money out, **green** for money in. A forward-looking prediction built from `recurring_items`. At a glance: "what leaves and lands on which day."

### 5.3 Net Worth
- **Assets** column (paper cash, e-cash, savings, super, crypto, IOUs … add as I go).
- **Liabilities** column (HECS, credit card).
- Each line's value updated *whenever* — every update stored as a dated `value_entry`.
- Headline: **Net worth** = total assets − total liabilities.
- **Liquidity ratio** = liquid assets ÷ total liabilities. The `is_liquid` flag decides what counts as liquid. *(confirmed)*
- **Credit card decision:** keep it *here* as a liability line (its outstanding balance reduces net worth), while its spending flows through Transactions like any account. It naturally lives in both worlds — no separate view needed. → recommended over a separate page.

### 5.4 Dashboard / Summary
Two modes: **Month-to-date** and **Last-month report**. Shows:
- total expenses · total income · **net cash flow** · **savings rate %**
- income broken down by category · expenses broken down by category
- net worth (current + month-end)

Relies on the month-end-figures rule (5.3 / §4) so historical months are locked to their true month-end values.

### 5.5 Trends / Graphs
Replicates the Sheets tables/graphs. Two data series, each sliced four ways:

**Monthly cash flow** — in, out, net cash flow, savings rate
**Monthly net worth** — assets, liabilities, net worth, liquidity ratio

Each sliced as:
- **MoM** (month over month)
- **YTD** (year to date, cumulative)
- **YoY by month** (this month vs same month last year)
- **YoY by YTD** (this year's YTD vs last year's YTD)

### 5.6 Allocations (new — virtual envelopes)
Carve real balances into planned-spending buckets, in **priority order**, with **zero effect on real accounts** (World C). Separate lists:
- **Buy with Balance (e-cash):** portion the everyday balance into items, leave the rest in the account.
- **Buy with Savings:** portion the savings figure into items.

Each list shows allocated vs unallocated. Pure Supabase data — moving money here never moves real money. (If I don't have a savings account right now, the Savings pool can still be tracked manually; getting a real savings account is a separate personal decision.)

---

## 6. Key calculations (single source of truth)

These are implemented as **Postgres views** (materialise only if one gets slow), e.g. `monthly_cashflow_view`, `networth_history_view`, `savings_rate_view`, `dashboard_view`. Frontend = display layer; Postgres = calculation layer. Every consumer (web, PWA, Swift, AI) reads the same numbers.

- **Net worth** = Σ latest asset values − Σ latest liability values (as at a date).
- **Liquidity ratio** = Σ liquid assets ÷ Σ liabilities (`is_liquid` from `networth_classes`).
- **Net cash flow** (period) = total income − total expenses (transfers excluded).
- **Savings rate %** = net cash flow ÷ total income.
- **MoM** = (this month − last month) ÷ last month.
- **YTD** = cumulative from 1 Jan of current year.
- **YoY (by month)** = this month vs same month prior year.
- **YoY (YTD)** = this year's YTD vs prior year's YTD.
- **Month-end figure** = `value_entry` dated last day of month (editable; always preserved).

---

## 7. Data migration

- **Transactions:** import the Google Sheet (Dec 2024 → now) via CSV → `transactions`. Map columns to the schema; backfill category/subcategory/tax-deductible.
- **Assets & liabilities:** each monthly column in the Sheet becomes a set of `value_entries` (one per item per month-end date). This instantly gives the net-worth history + trends from day one.

---

## 8. Open questions / decisions

1. ~~**Liquidity ratio definition**~~ — *confirmed:* liquid assets ÷ total liabilities.
2. ~~**Subcategory vs tags vs both**~~ — *confirmed:* category→subcategory backbone + tags on top.
3. **Transfers** — confirm the paired-leg model (`transfer_group_id`) nets correctly in reports.
4. **Savings account** — get a real one again, or keep Savings as a manual figure for now?
5. **Basiq scope** — which accounts to link first; does it cover the credit card?
6. **Backlog import** — CSV-map the existing sheets before or after the Basiq link goes live?

---

## 9. Build order

1. **Supabase schema + auth + RLS** — get the data model right first (§4), including `merchants`, `categorisation_rules`, `networth_classes` and the AI columns (unused for now).
2. **Migration** — import the two Google Sheets (transactions + monthly value_entries). Gives instant history.
3. **Merchant normalisation + rules engine** — aliases + `categorisation_rules` so imported and new txns auto-categorise for free.
4. **Transactions view** (5.1) — feed table **+ swipe-to-categorise review mode**, tax-deductible flag.
5. **Net Worth view** (5.3) — assets/liabilities ledger, value entries, month-end rule.
6. **Calculation views** — the SQL views in §6.
7. **Dashboard** (5.4) — MTD + last-month report.
8. **Trends/Graphs** (5.5) — the MoM / YTD / YoY tables and charts (Tremor).
9. **Bills + Calendar** (5.2) — recurring items → red/green prediction calendar.
10. **Allocations** (5.6) — virtual envelopes.
11. **Basiq integration** — automatic transaction feed.
12. **PWA shell** — installable on phone. (Swift app later, optional.)

Polish (Motion/Magic UI) is applied throughout as each view is built, not a separate phase.

---

## 10. Later — not v1

Fenced off so they don't creep into the first build:

- **AI categorisation (wired up)** — the cascade's AI fallback, via OpenRouter cheap model + hard spend cap. Schema columns already exist; this just turns them on for txns rules/merchants miss.
- **AI monthly review** — "expenses up 12%, dining out +37%, savings rate 42%→34%." A summary over the month's view data.
- **Ask-your-finances (NL → SQL)** — "how much have I spent on cars this year?" Needs query-safety guardrails before it touches real data.
- **Standalone Swift app** — after the PWA proves the daily-use loop.
