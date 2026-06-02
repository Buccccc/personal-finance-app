-- Expense amounts are stored as NEGATIVE values. Present expenses as a positive
-- magnitude so net = income - expenses reads conventionally and is correct.
-- (Supersedes the monthly_cashflow_view definition in 0003_views.sql.)
create or replace view public.monthly_cashflow_view
with (security_invoker = true) as
select
  t.user_id,
  date_trunc('month', t.date)::date                                   as month,
  coalesce(sum(t.amount) filter (where t.type = 'income'), 0)         as income,
  coalesce(-sum(t.amount) filter (where t.type = 'expense'), 0)       as expenses,
  coalesce(sum(t.amount) filter (where t.type = 'income'), 0)
    + coalesce(sum(t.amount) filter (where t.type = 'expense'), 0)    as net_cash_flow,
  case
    when coalesce(sum(t.amount) filter (where t.type = 'income'), 0) = 0 then null
    else (coalesce(sum(t.amount) filter (where t.type = 'income'), 0)
          + coalesce(sum(t.amount) filter (where t.type = 'expense'), 0))
         / nullif(sum(t.amount) filter (where t.type = 'income'), 0)
  end                                                                 as savings_rate
from public.transactions t
where t.type <> 'transfer'
group by t.user_id, date_trunc('month', t.date);
