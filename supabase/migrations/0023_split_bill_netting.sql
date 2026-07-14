-- ============================================================================
-- 0023: Split-bill netting.
-- A "split group" is one expense row plus one or more reimbursement income rows
-- sharing a transfer_group_id (previously unused; we claim it as the group key).
-- Reporting must show the user's NET share, attributed to the EXPENSE's month
-- and category: reimbursements stop inflating income, fronted bills stop
-- inflating expenses.
--   link_split_bill   -- tie an expense to its reimbursement income rows
--   unlink_split_bill -- break rows out of a group (and dissolve orphan groups)
--   monthly_cashflow_view / monthly_category_breakdown_view -- net split groups
-- security_invoker functions/views so base-table RLS scopes everything to the
-- caller; a row owned by someone else simply is not found.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- link_split_bill: attach reimbursement income rows to a fronted expense row.
-- Reuses the expense's existing group id if present, else mints a fresh one.
-- Returns the group id. RLS scopes visibility, so a foreign row is "not found".
-- ----------------------------------------------------------------------------
create or replace function public.link_split_bill(p_expense_id uuid, p_income_ids uuid[])
returns uuid
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_group_id       uuid;
  v_expense_amount numeric;
  v_income_id      uuid;
  v_income_type    text;
  v_income_amount  numeric;
  v_income_group   uuid;
begin
  -- Must supply at least one reimbursement row.
  if p_income_ids is null or array_length(p_income_ids, 1) is null then
    raise exception 'link_split_bill: p_income_ids must be a non-empty array';
  end if;

  -- Expense row must exist (and be visible), be an expense, and be an outflow.
  select transfer_group_id, amount
    into v_group_id, v_expense_amount
  from public.transactions
  where id = p_expense_id and type = 'expense';

  if not found then
    raise exception 'link_split_bill: expense % not found or not type=expense', p_expense_id;
  end if;
  if v_expense_amount >= 0 then
    raise exception 'link_split_bill: expense % must have amount < 0 (found %)', p_expense_id, v_expense_amount;
  end if;

  -- Determine the group id: reuse the expense's existing one, else mint a new one.
  if v_group_id is null then
    v_group_id := gen_random_uuid();
  end if;

  -- Validate every income row before writing anything.
  foreach v_income_id in array p_income_ids loop
    select type, amount, transfer_group_id
      into v_income_type, v_income_amount, v_income_group
    from public.transactions
    where id = v_income_id;

    if not found then
      raise exception 'link_split_bill: income % not found', v_income_id;
    end if;
    if v_income_type <> 'income' then
      raise exception 'link_split_bill: row % must be type=income (found %)', v_income_id, v_income_type;
    end if;
    if v_income_amount <= 0 then
      raise exception 'link_split_bill: income % must have amount > 0 (found %)', v_income_id, v_income_amount;
    end if;
    -- Income must be unlinked or already part of this same group.
    if v_income_group is not null and v_income_group <> v_group_id then
      raise exception 'link_split_bill: income % already belongs to another group %', v_income_id, v_income_group;
    end if;
  end loop;

  -- All checks passed: stamp the group id on the expense and every income row.
  update public.transactions
    set transfer_group_id = v_group_id
  where id = p_expense_id;

  update public.transactions
    set transfer_group_id = v_group_id
  where id = any(p_income_ids);

  return v_group_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- unlink_split_bill: clear transfer_group_id on the given rows, then dissolve
-- any group left with fewer than 2 members (a lone straggler is not a group).
-- ----------------------------------------------------------------------------
create or replace function public.unlink_split_bill(p_txn_ids uuid[])
returns void
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_groups uuid[];
begin
  if p_txn_ids is null or array_length(p_txn_ids, 1) is null then
    return;
  end if;

  -- Remember which groups these rows belonged to, then unlink the rows.
  select array_agg(distinct transfer_group_id)
    into v_groups
  from public.transactions
  where id = any(p_txn_ids) and transfer_group_id is not null;

  update public.transactions
    set transfer_group_id = null
  where id = any(p_txn_ids);

  -- For each affected group, if fewer than 2 members remain, unlink the rest.
  if v_groups is not null then
    update public.transactions
      set transfer_group_id = null
    where transfer_group_id in (
      select g
      from unnest(v_groups) as g
      where g is not null
        and (
          select count(*) from public.transactions
          where transfer_group_id = g
        ) < 2
    );
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Recreate monthly_cashflow_view with split-bill netting.
-- A split group = a transfer_group_id whose rows include >= 1 expense AND
-- >= 1 income row. By construction a group has exactly one expense.
--   - split-group income rows are EXCLUDED from income;
--   - each split-group expense contributes a NETTED amount
--       (own amount + the group's total income), in the expense's own month;
--   - non-split rows behave exactly as before; transfers are still excluded.
-- NOTE: if reimbursements exceed the fronted expense the net goes positive
--       (a net inflow). This is intentional — we do not clamp at zero.
-- ----------------------------------------------------------------------------
create or replace view public.monthly_cashflow_view
with (security_invoker = true) as
with split_groups as (
  -- Groups that qualify as split bills, with their total reimbursement income.
  select
    transfer_group_id,
    sum(amount) filter (where type = 'income') as income_total
  from public.transactions
  where transfer_group_id is not null
    and type <> 'transfer'
  group by transfer_group_id
  having count(*) filter (where type = 'expense') >= 1
     and count(*) filter (where type = 'income')  >= 1
),
adjusted as (
  select
    t.user_id,
    date_trunc('month', t.date)::date as month,
    t.type,
    -- Netted amount for the split expense; own amount otherwise.
    case
      when sg.transfer_group_id is not null and t.type = 'expense'
        then t.amount + sg.income_total
      else t.amount
    end as amount,
    -- Flag so split-group income rows can be dropped entirely.
    (sg.transfer_group_id is not null and t.type = 'income') as is_split_income
  from public.transactions t
  left join split_groups sg on sg.transfer_group_id = t.transfer_group_id
  where t.type <> 'transfer'
)
select
  user_id,
  month,
  coalesce(sum(amount) filter (where type = 'income'), 0)          as income,
  coalesce(-sum(amount) filter (where type = 'expense'), 0)        as expenses,
  coalesce(sum(amount) filter (where type = 'income'), 0)
    + coalesce(sum(amount) filter (where type = 'expense'), 0)     as net_cash_flow,
  case
    when coalesce(sum(amount) filter (where type = 'income'), 0) = 0 then null
    else (coalesce(sum(amount) filter (where type = 'income'), 0)
          + coalesce(sum(amount) filter (where type = 'expense'), 0))
         / nullif(sum(amount) filter (where type = 'income'), 0)
  end                                                              as savings_rate
from adjusted
where not is_split_income
group by user_id, month;

-- ----------------------------------------------------------------------------
-- Recreate monthly_category_breakdown_view with the same split-bill netting.
--   - split-group income rows are excluded entirely;
--   - split-group expense rows report their NETTED amount in their own
--     category and month, counting as a single txn (txn_count = 1);
--   - everything else unchanged; transfers still excluded.
-- ----------------------------------------------------------------------------
create or replace view public.monthly_category_breakdown_view
with (security_invoker = true) as
with split_groups as (
  select
    transfer_group_id,
    sum(amount) filter (where type = 'income') as income_total
  from public.transactions
  where transfer_group_id is not null
    and type <> 'transfer'
  group by transfer_group_id
  having count(*) filter (where type = 'expense') >= 1
     and count(*) filter (where type = 'income')  >= 1
),
adjusted as (
  select
    t.user_id,
    date_trunc('month', t.date)::date as month,
    t.type,
    t.category_id,
    case
      when sg.transfer_group_id is not null and t.type = 'expense'
        then t.amount + sg.income_total
      else t.amount
    end as amount,
    (sg.transfer_group_id is not null and t.type = 'income') as is_split_income
  from public.transactions t
  left join split_groups sg on sg.transfer_group_id = t.transfer_group_id
  where t.type <> 'transfer'
)
select
  a.user_id,
  a.month,
  a.type,
  a.category_id,
  coalesce(c.name, 'Uncategorised') as category_name,
  sum(a.amount)                     as total,
  count(*)                          as txn_count
from adjusted a
left join public.categories c on c.id = a.category_id
where not a.is_split_income
group by a.user_id, a.month, a.type, a.category_id, c.name;

-- ----------------------------------------------------------------------------
-- Callers are authenticated end users; grant execute on both RPCs.
-- ----------------------------------------------------------------------------
grant execute on function public.link_split_bill(uuid, uuid[]) to authenticated;
grant execute on function public.unlink_split_bill(uuid[]) to authenticated;
