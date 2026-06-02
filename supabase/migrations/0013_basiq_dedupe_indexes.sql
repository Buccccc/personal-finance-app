create unique index if not exists transactions_user_basiq_uniq
  on public.transactions (user_id, basiq_transaction_id)
  where basiq_transaction_id is not null;

create unique index if not exists accounts_user_basiq_uniq
  on public.accounts (user_id, basiq_account_id)
  where basiq_account_id is not null;
