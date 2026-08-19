-- Accounts Elias no longer uses, and accounts he can no longer transfer to.
--
-- Two separate ideas on purpose:
--   `active`      - is he using it. Drives the accounts-page hide toggle.
--   `unreachable` - the bank will not let money move to or from it, even
--                   though it still exists and may still hold a balance.
-- They are orthogonal: the CommBank savings account is reachable-no-more but
-- still real, while the ANZ accounts work fine and are simply unused.
--
-- Hiding is a DISPLAY concern only. Inactive accounts still count towards net
-- worth, because money in an account he ignores is still his money. Anything
-- that changed net worth on a visibility toggle would be a bug.

alter table public.accounts
  add column if not exists active      boolean not null default true,
  add column if not exists unreachable boolean not null default false,
  add column if not exists status_note text;

comment on column public.accounts.active is
  'False hides the account from the default accounts view. Does not affect balances, transactions or net worth.';
comment on column public.accounts.unreachable is
  'True when the bank no longer permits transfers to or from the account. Surfaces as a no_transfers notice.';
comment on column public.accounts.status_note is
  'Free text explaining why an account is inactive or unreachable.';

create or replace view public.account_reconciliation_view as
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
  -- Errors stay live on inactive accounts: an impossible balance is a data
  -- problem whether or not he is using the account.
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
  -- Hygiene notices are suppressed on inactive accounts. They can never be
  -- cleared on an account he has stopped using, so leaving them on would make
  -- the hide toggle a way of hiding warnings rather than resolving them.
  array_remove(array[
    case when a.unreachable then 'no_transfers' end,
    case when not a.active then 'inactive' end,
    case when a.active and a.type = 'credit_card' and a.balance > 0 then 'credit_card_in_credit' end,
    case when a.active and a.reconciled_at is null then 'never_reconciled' end,
    case when a.active and a.reconciled_at is not null and tt.last_txn_date > a.reconciled_at
         then 'txns_since_reconcile' end,
    case when a.active and a.reconciled_at is not null and (current_date - a.reconciled_at) > 90
         then 'stale_reconcile' end
  ], null)                                              as notices,
  -- Appended rather than slotted next to the other account columns:
  -- `create or replace view` cannot insert a column mid-list, and dropping the
  -- view to reorder is not worth the churn.
  a.active,
  a.unreachable,
  a.status_note
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
  'Per-account health: derived-balance invariant, drift against the last confirmed bank balance, impossible-state flags, and usability flags (inactive, no_transfers).';
