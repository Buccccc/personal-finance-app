-- Supports server-side paginated default sort (date desc) with a stable tiebreaker.
create index if not exists transactions_user_date_id_idx
  on public.transactions (user_id, date desc, id desc);
-- Supports amount-sorted pagination.
create index if not exists transactions_user_amount_id_idx
  on public.transactions (user_id, amount desc, id desc);
