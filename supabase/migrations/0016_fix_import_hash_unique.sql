-- Partial unique indexes can't be used for ON CONFLICT inference via PostgREST.
-- Replace with full unique indexes (multiple NULLs remain allowed = distinct).
drop index if exists public.transactions_user_import_hash_uniq;
create unique index if not exists transactions_user_import_hash_key
  on public.transactions (user_id, import_hash);

drop index if exists public.transactions_user_basiq_uniq;
create unique index if not exists transactions_user_basiq_key
  on public.transactions (user_id, basiq_transaction_id);
