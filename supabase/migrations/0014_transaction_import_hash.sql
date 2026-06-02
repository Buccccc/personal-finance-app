-- Content hash for CSV-imported rows (CommBank has no transaction id).
-- Hash includes the running balance so genuinely-identical same-day amounts
-- stay distinct, while re-imports of overlapping ranges dedupe cleanly.
alter table public.transactions
  add column if not exists import_hash text;

create unique index if not exists transactions_user_import_hash_uniq
  on public.transactions (user_id, import_hash)
  where import_hash is not null;
