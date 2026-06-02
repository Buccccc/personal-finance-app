-- ============================================================================
-- Calculation views — single source of truth (PLAN §6).
-- security_invoker = true so base-table RLS applies to the querying user.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Monthly cash flow: income, expenses, net, savings rate (transfers excluded).
-- ----------------------------------------------------------------------------
create or replace view public.monthly_cashflow_view
with (security_invoker = true) as
select
  t.user_id,
  date_trunc('month', t.date)::date                                   as month,
  coalesce(sum(t.amount) filter (where t.type = 'income'), 0)         as income,
  coalesce(sum(t.amount) filter (where t.type = 'expense'), 0)        as expenses,
  coalesce(sum(t.amount) filter (where t.type = 'income'), 0)
    - coalesce(sum(t.amount) filter (where t.type = 'expense'), 0)    as net_cash_flow,
  case
    when coalesce(sum(t.amount) filter (where t.type = 'income'), 0) = 0 then null
    else (coalesce(sum(t.amount) filter (where t.type = 'income'), 0)
          - coalesce(sum(t.amount) filter (where t.type = 'expense'), 0))
         / nullif(sum(t.amount) filter (where t.type = 'income'), 0)
  end                                                                 as savings_rate
from public.transactions t
where t.type <> 'transfer'
group by t.user_id, date_trunc('month', t.date);

-- ----------------------------------------------------------------------------
-- Latest value per item as-at the last day of each month that has any entry.
-- Builds a (month, item, value) grid using each item's latest entry <= month-end.
-- ----------------------------------------------------------------------------
create or replace view public.networth_history_view
with (security_invoker = true) as
with months as (
  select distinct user_id, date_trunc('month', date)::date as month
  from public.value_entries
),
item_month as (
  select
    m.user_id,
    m.month,
    i.id   as item_id,
    c.kind,
    c.is_liquid,
    (
      select ve.value
      from public.value_entries ve
      where ve.item_id = i.id
        and ve.date <= (m.month + interval '1 month - 1 day')::date
      order by ve.date desc
      limit 1
    ) as value
  from months m
  join public.networth_items i on i.user_id = m.user_id and i.active
  join public.networth_classes c on c.id = i.class_id
)
select
  user_id,
  month,
  coalesce(sum(value) filter (where kind = 'asset'), 0)                       as assets,
  coalesce(sum(value) filter (where kind = 'liability'), 0)                   as liabilities,
  coalesce(sum(value) filter (where kind = 'asset'), 0)
    - coalesce(sum(value) filter (where kind = 'liability'), 0)              as net_worth,
  case
    when coalesce(sum(value) filter (where kind = 'liability'), 0) = 0 then null
    else coalesce(sum(value) filter (where kind = 'asset' and is_liquid), 0)
         / nullif(sum(value) filter (where kind = 'liability'), 0)
  end                                                                         as liquidity_ratio
from item_month
where value is not null
group by user_id, month;

-- ----------------------------------------------------------------------------
-- Current net worth (latest entry per item, no date ceiling).
-- ----------------------------------------------------------------------------
create or replace view public.networth_current_view
with (security_invoker = true) as
with latest as (
  select distinct on (ve.item_id)
    ve.item_id, ve.value, i.user_id, c.kind, c.is_liquid
  from public.value_entries ve
  join public.networth_items i on i.id = ve.item_id and i.active
  join public.networth_classes c on c.id = i.class_id
  order by ve.item_id, ve.date desc
)
select
  user_id,
  coalesce(sum(value) filter (where kind = 'asset'), 0)            as assets,
  coalesce(sum(value) filter (where kind = 'liability'), 0)        as liabilities,
  coalesce(sum(value) filter (where kind = 'asset'), 0)
    - coalesce(sum(value) filter (where kind = 'liability'), 0)   as net_worth,
  case
    when coalesce(sum(value) filter (where kind = 'liability'), 0) = 0 then null
    else coalesce(sum(value) filter (where kind = 'asset' and is_liquid), 0)
         / nullif(sum(value) filter (where kind = 'liability'), 0)
  end                                                              as liquidity_ratio
from latest
group by user_id;

-- ----------------------------------------------------------------------------
-- Allocations: per pool, total / allocated / unallocated.
-- Pool total = linked account's latest balance proxy is out of scope here;
-- this view sums the items so the UI can show allocated vs a user-supplied total.
-- ----------------------------------------------------------------------------
create or replace view public.allocation_summary_view
with (security_invoker = true) as
select
  p.user_id,
  p.id            as pool_id,
  p.name          as pool_name,
  p.source,
  coalesce(sum(ai.amount), 0) as allocated
from public.allocation_pools p
left join public.allocation_items ai on ai.pool_id = p.id
group by p.user_id, p.id, p.name, p.source;
