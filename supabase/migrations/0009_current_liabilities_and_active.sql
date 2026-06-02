-- ============================================================================
-- 1) Distinguish CURRENT vs long-term liabilities (HECS is long-term).
--    Liquidity ratio uses CURRENT liabilities only; net worth still includes all.
-- 2) Fix net-worth HISTORY so hiding an item (active=false) never changes the past:
--    history includes ALL items; the CURRENT ledger respects `active`.
-- ============================================================================

alter table public.networth_classes
  add column if not exists is_current boolean not null default true;

-- Current net worth: respects item.active (hidden items drop out of "what I have now").
-- Liquidity = liquid assets / CURRENT liabilities.
create or replace view public.networth_current_view
with (security_invoker = true) as
with latest as (
  select distinct on (ve.item_id)
    ve.item_id, ve.value, i.user_id, c.kind, c.is_liquid, c.is_current
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
    when coalesce(sum(value) filter (where kind = 'liability' and is_current), 0) = 0 then null
    else coalesce(sum(value) filter (where kind = 'asset' and is_liquid), 0)
         / nullif(sum(value) filter (where kind = 'liability' and is_current), 0)
  end                                                              as liquidity_ratio
from latest
group by user_id;

-- History: includes ALL items (active and hidden) so past months stay correct.
-- Liquidity uses CURRENT liabilities only.
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
    c.is_current,
    (
      select ve.value
      from public.value_entries ve
      where ve.item_id = i.id
        and ve.date <= (m.month + interval '1 month - 1 day')::date
      order by ve.date desc
      limit 1
    ) as value
  from months m
  join public.networth_items i on i.user_id = m.user_id
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
    when coalesce(sum(value) filter (where kind = 'liability' and is_current), 0) = 0 then null
    else coalesce(sum(value) filter (where kind = 'asset' and is_liquid), 0)
         / nullif(sum(value) filter (where kind = 'liability' and is_current), 0)
  end                                                                         as liquidity_ratio
from item_month
where value is not null
group by user_id, month;
