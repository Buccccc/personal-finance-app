-- 0024: expose net_liquid = liquid assets − current liabilities on the
-- net-worth views. "Liquid Worth" (gross liquid assets) is kept as liquid_assets
-- for the small "total liquid assets" sub-figure; net_liquid is the new headline.
-- Applied via MCP migration 0024_net_liquid (2026-07-14).

create or replace view public.networth_current_view
with (security_invoker = true) as
with latest as (
  select distinct on (ve.item_id)
    ve.item_id, ve.value, i.user_id, c.kind, c.is_liquid, c.is_current
  from value_entries ve
  join networth_items i on i.id = ve.item_id and i.active
  join networth_classes c on c.id = i.class_id
  order by ve.item_id, ve.date desc
)
select
  user_id,
  coalesce(sum(value) filter (where kind = 'asset'), 0) as assets,
  coalesce(sum(value) filter (where kind = 'liability'), 0) as liabilities,
  coalesce(sum(value) filter (where kind = 'asset'), 0)
    - coalesce(sum(value) filter (where kind = 'liability'), 0) as net_worth,
  case
    when coalesce(sum(value) filter (where kind = 'liability' and is_current), 0) = 0 then null
    else coalesce(sum(value) filter (where kind = 'asset' and is_liquid), 0)
         / nullif(sum(value) filter (where kind = 'liability' and is_current), 0)
  end as liquidity_ratio,
  coalesce(sum(value) filter (where kind = 'asset' and is_liquid), 0) as liquid_assets,
  coalesce(sum(value) filter (where kind = 'asset' and is_liquid), 0)
    - coalesce(sum(value) filter (where kind = 'liability' and is_current), 0) as net_liquid
from latest
group by user_id;

create or replace view public.networth_history_view
with (security_invoker = true) as
with months as (
  select distinct value_entries.user_id,
    (date_trunc('month', value_entries.date::timestamptz))::date as month
  from value_entries
),
item_month as (
  select m.user_id, m.month, i.id as item_id, c.kind, c.is_liquid, c.is_current,
    (select ve.value from value_entries ve
      where ve.item_id = i.id
        and ve.date <= (m.month + '1 mon -1 days'::interval)::date
      order by ve.date desc
      limit 1) as value
  from months m
  join networth_items i on i.user_id = m.user_id
  join networth_classes c on c.id = i.class_id
)
select
  user_id,
  month,
  coalesce(sum(value) filter (where kind = 'asset'), 0) as assets,
  coalesce(sum(value) filter (where kind = 'liability'), 0) as liabilities,
  coalesce(sum(value) filter (where kind = 'asset'), 0)
    - coalesce(sum(value) filter (where kind = 'liability'), 0) as net_worth,
  case
    when coalesce(sum(value) filter (where kind = 'liability' and is_current), 0) = 0 then null
    else coalesce(sum(value) filter (where kind = 'asset' and is_liquid), 0)
         / nullif(sum(value) filter (where kind = 'liability' and is_current), 0)
  end as liquidity_ratio,
  coalesce(sum(value) filter (where kind = 'asset' and is_liquid), 0) as liquid_assets,
  coalesce(sum(value) filter (where kind = 'asset' and is_liquid), 0)
    - coalesce(sum(value) filter (where kind = 'liability' and is_current), 0) as net_liquid
from item_month
where value is not null
group by user_id, month;
