-- accounts.balance + accounts.credit_limit, and sync_account_networth():
-- recomputes today's E-Cash / Savings / Credit-card-debt net-worth value
-- entries from account balances. (Full bodies applied via MCP migration 0018.)
alter table public.accounts add column if not exists balance numeric(14,2) not null default 0;
alter table public.accounts add column if not exists credit_limit numeric(14,2);
