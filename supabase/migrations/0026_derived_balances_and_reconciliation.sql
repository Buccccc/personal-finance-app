-- ============================================================================
-- 0026: accounts.balance becomes DERIVED, and bank reconciliation gets a home.
-- Applied via MCP migration 0026_derived_balances_and_reconciliation (2026-08-14).
-- Unlike 0018/0021/0022 this file carries the full body, not a stub.
--
-- Before this migration accounts.balance was a free-floating stored number.
-- tg_adjust_balance skipped imported inserts (the CSV running balance was
-- written authoritatively instead) but still adjusted on delete/update, and
-- any direct write -- app edit, agent SQL over MCP -- landed unchecked. Nothing
-- enforced balance = sum(transactions), so balances silently drifted and moved
-- net worth with them (ANZ Plus Everyday sat at -238.94 against a -274.21
-- transaction sum, understating net worth by $238.94).
--
-- New model: every account carries an opening_balance -- what the account held
-- before its first tracked transaction, which is non-zero for every account
-- whose imported history starts mid-life. The invariant is then:
--
--     balance = opening_balance + sum(transactions.amount)
--
-- and it is maintained by triggers on both sides, so no write path can break
-- it. Writing `balance` directly still works and means "this is the true
-- balance now" -- the BEFORE trigger back-solves opening_balance to keep the
-- invariant. That keeps CSV import, the account edit dialog, and ad-hoc agent
-- SQL all correct without any of them knowing this model exists.
-- ============================================================================

alter table public.accounts
  add column if not exists opening_balance    numeric(14,2) not null default 0,
  add column if not exists reconciled_balance numeric(14,2),
  add column if not exists reconciled_at      date;

comment on column public.accounts.opening_balance is
  'Balance before the first tracked transaction. balance = opening_balance + sum(transactions.amount), enforced by trigger.';
comment on column public.accounts.reconciled_balance is
  'Real balance last confirmed against the bank, as at reconciled_at.';
comment on column public.accounts.reconciled_at is
  'Date the balance was last confirmed against the bank.';

-- Backfill so every current balance is preserved exactly: the invariant becomes
-- true immediately and no net-worth figure moves as a result of this migration.
update public.accounts a
set opening_balance = a.balance - coalesce(
      (select sum(t.amount) from public.transactions t where t.account_id = a.id), 0);

-- ---------------------------------------------------------------------------
-- Core recompute
-- ---------------------------------------------------------------------------

create or replace function public.recompute_account_balance(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_total    numeric;
  v_expected numeric;
begin
  if p_account_id is null then return; end if;

  select coalesce(sum(amount), 0) into v_total
    from public.transactions where account_id = p_account_id;

  select a.opening_balance + v_total into v_expected
    from public.accounts a where a.id = p_account_id;

  if v_expected is null then return; end if;

  -- Only write when it actually changes: the AFTER trigger on accounts.balance
  -- resyncs net worth, and there is no reason to churn that on a no-op.
  update public.accounts
     set balance = v_expected
   where id = p_account_id
     and balance is distinct from v_expected;
end;
$$;

-- ---------------------------------------------------------------------------
-- Transactions side: statement-level so a 500-row import batch recomputes once
-- per account, not once per row.
-- ---------------------------------------------------------------------------

create or replace function public.tg_recompute_balance_ins()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  for r in select distinct account_id from new_rows where account_id is not null loop
    perform public.recompute_account_balance(r.account_id);
  end loop;
  return null;
end;
$$;

create or replace function public.tg_recompute_balance_del()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  for r in select distinct account_id from old_rows where account_id is not null loop
    perform public.recompute_account_balance(r.account_id);
  end loop;
  return null;
end;
$$;

create or replace function public.tg_recompute_balance_upd()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  -- Both sides: an edit that moves a transaction between accounts has to
  -- recompute the account it left as well as the one it landed on.
  for r in
    select distinct account_id from (
      select account_id from new_rows
      union
      select account_id from old_rows
    ) s where account_id is not null
  loop
    perform public.recompute_account_balance(r.account_id);
  end loop;
  return null;
end;
$$;

drop trigger if exists trg_adjust_balance on public.transactions;
drop function if exists public.tg_adjust_balance();

drop trigger if exists trg_recompute_balance_ins on public.transactions;
create trigger trg_recompute_balance_ins
  after insert on public.transactions
  referencing new table as new_rows
  for each statement execute function public.tg_recompute_balance_ins();

drop trigger if exists trg_recompute_balance_upd on public.transactions;
create trigger trg_recompute_balance_upd
  after update on public.transactions
  referencing new table as new_rows old table as old_rows
  for each statement execute function public.tg_recompute_balance_upd();

drop trigger if exists trg_recompute_balance_del on public.transactions;
create trigger trg_recompute_balance_del
  after delete on public.transactions
  referencing old table as old_rows
  for each statement execute function public.tg_recompute_balance_del();

-- ---------------------------------------------------------------------------
-- Accounts side: keep balance and opening_balance in lockstep whichever one
-- the caller chose to write.
-- ---------------------------------------------------------------------------

create or replace function public.tg_account_balance_write()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_total numeric;
begin
  if tg_op = 'INSERT' then
    -- A brand-new account has no transactions, so the two must be equal.
    -- Whichever the caller supplied is the one they meant.
    if new.opening_balance = 0 and new.balance <> 0 then
      new.opening_balance := new.balance;
    elsif new.balance = 0 and new.opening_balance <> 0 then
      new.balance := new.opening_balance;
    end if;
    return new;
  end if;

  select coalesce(sum(amount), 0) into v_total
    from public.transactions where account_id = new.id;

  if new.opening_balance is distinct from old.opening_balance then
    -- Explicit opening_balance write wins: the ledger start moved.
    new.balance := new.opening_balance + v_total;
  elsif new.balance is distinct from old.balance then
    -- Direct balance write means "this is the true balance now" -- back-solve
    -- the opening balance so the invariant survives. This is the path CSV
    -- import, the edit dialog, and agent SQL over MCP all take.
    new.opening_balance := new.balance - v_total;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_account_balance_write on public.accounts;
create trigger trg_account_balance_write
  before insert or update on public.accounts
  for each row execute function public.tg_account_balance_write();

-- ---------------------------------------------------------------------------
-- Reconciliation view
--
-- invariant_drift should always be 0 now; a non-zero value means something
-- bypassed the triggers and is worth knowing about.
--
-- reconcile_drift is the real check: it compares the balance the bank actually
-- showed on reconciled_at against what the ledger says it was on that date.
-- Non-zero means missing or duplicated transactions, which is the failure the
-- structural fix above cannot catch.
-- ---------------------------------------------------------------------------

drop view if exists public.account_reconciliation_view;
create view public.account_reconciliation_view
with (security_invoker = true) as
select
  a.user_id,
  a.id                                                  as account_id,
  a.name,
  a.type,
  a.institution,
  a.currency,
  a.credit_limit,
  a.opening_balance,
  coalesce(tt.txn_total, 0)                             as txn_total,
  coalesce(tt.txn_count, 0)                             as txn_count,
  tt.last_txn_date,
  a.balance,
  (a.opening_balance + coalesce(tt.txn_total, 0))       as expected_balance,
  (a.balance - (a.opening_balance + coalesce(tt.txn_total, 0))) as invariant_drift,
  a.reconciled_balance,
  a.reconciled_at,
  case when a.reconciled_at is null then null
       else a.opening_balance + coalesce(rt.total_to_date, 0)
  end                                                   as ledger_at_reconcile,
  case when a.reconciled_at is null or a.reconciled_balance is null then null
       else a.reconciled_balance - (a.opening_balance + coalesce(rt.total_to_date, 0))
  end                                                   as reconcile_drift,
  case when a.reconciled_at is null then null
       else (current_date - a.reconciled_at)
  end                                                   as days_since_reconciled,
  array_remove(array[
    case when a.balance is distinct from a.opening_balance + coalesce(tt.txn_total, 0)
         then 'invariant_broken' end,
    case when a.type in ('everyday','savings','cash','ecash') and a.balance < 0
         then 'negative_asset' end,
    case when a.type = 'credit_card' and a.credit_limit is not null and (-a.balance) > a.credit_limit
         then 'over_limit' end,
    case when a.reconciled_at is not null and a.reconciled_balance is not null
              and a.reconciled_balance is distinct from a.opening_balance + coalesce(rt.total_to_date, 0)
         then 'reconcile_drift' end
  ], null)                                              as errors,
  array_remove(array[
    case when a.type = 'credit_card' and a.balance > 0 then 'credit_card_in_credit' end,
    case when a.reconciled_at is null then 'never_reconciled' end,
    case when a.reconciled_at is not null and tt.last_txn_date > a.reconciled_at
         then 'txns_since_reconcile' end,
    case when a.reconciled_at is not null and (current_date - a.reconciled_at) > 90
         then 'stale_reconcile' end
  ], null)                                              as notices
from public.accounts a
left join lateral (
  select sum(t.amount) as txn_total, count(*) as txn_count, max(t.date) as last_txn_date
  from public.transactions t
  where t.account_id = a.id
) tt on true
left join lateral (
  select sum(t.amount) as total_to_date
  from public.transactions t
  where t.account_id = a.id
    and a.reconciled_at is not null
    and t.date <= a.reconciled_at
) rt on true;

comment on view public.account_reconciliation_view is
  'Per-account health: derived-balance invariant, drift against the last confirmed bank balance, and impossible-state flags.';
