-- ============================================================================
-- Monthly category breakdown — powers Dashboard category splits & Trends.
-- One row per (month, type, category). Transfers excluded (not spending/income).
-- security_invoker so base-table RLS applies to the querying user.
-- ============================================================================

create or replace view public.monthly_category_breakdown_view
with (security_invoker = true) as
select
  t.user_id,
  date_trunc('month', t.date)::date as month,
  t.type,
  t.category_id,
  coalesce(c.name, 'Uncategorised') as category_name,
  sum(t.amount)                     as total,
  count(*)                          as txn_count
from public.transactions t
left join public.categories c on c.id = t.category_id
where t.type <> 'transfer'
group by t.user_id, date_trunc('month', t.date), t.type, t.category_id, c.name;
