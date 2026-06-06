create or replace view public.account_txn_totals_view
with (security_invoker = true) as
select a.user_id, a.id as account_id, coalesce(sum(t.amount), 0) as txn_total
from public.accounts a
left join public.transactions t on t.account_id = a.id
group by a.user_id, a.id;
