-- 0022: net-worth value entries auto-derive from account balances.
-- sync_account_networth_for(p_user) is the auth-independent core;
-- the no-arg sync_account_networth() wrapper keeps existing app RPCs working.
-- Trigger on accounts fires the sync on any balance change, so E-Cash /
-- Savings / Credit-card items update no matter who writes (app, import, MCP).
-- Applied via MCP migration 0022_auto_sync_account_networth (2026-07-14).

create or replace function public.sync_account_networth_for(p_user uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  today date := current_date;
  v_ecash numeric;
  v_savings numeric;
  v_cc_owed numeric;
  id_ecash uuid;
  id_savings uuid;
  id_cc uuid;
  cc_class uuid;
begin
  if p_user is null then return; end if;

  select coalesce(sum(balance), 0) into v_ecash from public.accounts
    where user_id = p_user and type in ('everyday', 'cash', 'ecash');
  select coalesce(sum(balance), 0) into v_savings from public.accounts
    where user_id = p_user and type = 'savings';
  select coalesce(-sum(balance), 0) into v_cc_owed from public.accounts
    where user_id = p_user and type = 'credit_card';

  select i.id into id_ecash from public.networth_items i
    join public.networth_classes c on c.id = i.class_id
    where i.user_id = p_user and c.name = 'ecash' order by i.created_at limit 1;
  if id_ecash is not null then
    insert into public.value_entries (user_id, item_id, date, value)
      values (p_user, id_ecash, today, v_ecash)
      on conflict (item_id, date) do update set value = excluded.value;
  end if;

  select i.id into id_savings from public.networth_items i
    join public.networth_classes c on c.id = i.class_id
    where i.user_id = p_user and c.name = 'savings' order by i.created_at limit 1;
  if id_savings is not null then
    insert into public.value_entries (user_id, item_id, date, value)
      values (p_user, id_savings, today, v_savings)
      on conflict (item_id, date) do update set value = excluded.value;
  end if;

  if exists (select 1 from public.accounts where user_id = p_user and type = 'credit_card') then
    select i.id into id_cc from public.networth_items i
      join public.networth_classes c on c.id = i.class_id
      where i.user_id = p_user and c.name = 'credit_card' order by i.created_at limit 1;
    if id_cc is null then
      select id into cc_class from public.networth_classes
        where user_id = p_user and name = 'credit_card' limit 1;
      if cc_class is not null then
        insert into public.networth_items (user_id, name, class_id)
          values (p_user, 'Credit Cards', cc_class) returning id into id_cc;
      end if;
    end if;
    if id_cc is not null then
      insert into public.value_entries (user_id, item_id, date, value)
        values (p_user, id_cc, today, v_cc_owed)
        on conflict (item_id, date) do update set value = excluded.value;
    end if;
  end if;
end;
$$;

-- Keep the existing RPC surface: no-arg version resolves the caller.
create or replace function public.sync_account_networth()
returns void
language sql
security definer
set search_path to 'public'
as $$
  select public.sync_account_networth_for(auth.uid());
$$;

-- Fire on any balance change (insert covers new accounts).
create or replace function public.tg_sync_networth_on_balance()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.sync_account_networth_for(new.user_id);
  return new;
end;
$$;

drop trigger if exists trg_sync_networth_on_balance on public.accounts;
create trigger trg_sync_networth_on_balance
  after insert or update of balance on public.accounts
  for each row execute function public.tg_sync_networth_on_balance();
