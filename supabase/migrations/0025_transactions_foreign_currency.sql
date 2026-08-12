-- 0025: foreign-currency detail on transactions.
-- `amount` stays AUD in every row so existing views, trends and net-worth
-- calculations keep working untouched. These three columns record what the
-- transaction actually was in its own currency, and the rate it was converted
-- at. The rate is the one that was really paid, frozen at import time — never
-- recompute it from a live feed, or last year's holiday re-prices itself every
-- time the dollar moves.
-- Applied via MCP migration 0025_transactions_foreign_currency (2026-08-12).

alter table public.transactions
  add column if not exists original_amount numeric,
  add column if not exists original_currency text,
  add column if not exists fx_rate numeric;

comment on column public.transactions.original_amount is
  'Signed amount in the currency the transaction actually occurred in. Null means the transaction was in AUD and amount is authoritative.';
comment on column public.transactions.original_currency is
  'ISO 4217 code of original_amount, e.g. NZD. Null for AUD-native rows.';
comment on column public.transactions.fx_rate is
  'Units of original_currency per 1 AUD, at the rate actually paid. amount = original_amount / fx_rate. Historical: never recompute from a live rate.';

-- All three travel together or none of them do: a foreign amount with no rate
-- cannot be converted, and a rate with no amount says nothing.
alter table public.transactions
  add constraint transactions_fx_fields_together check (
    (original_amount is null and original_currency is null and fx_rate is null)
    or (original_amount is not null and original_currency is not null and fx_rate is not null and fx_rate > 0)
  );
