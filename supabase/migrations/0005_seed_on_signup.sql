-- ============================================================================
-- Seed sensible defaults for every new user on signup.
-- Runs as SECURITY DEFINER so it can insert rows owned by the new user.
-- Idempotent-ish: only fires once per auth.users insert.
-- ============================================================================

create or replace function public.seed_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := new.id;
begin
  -- Net worth classes (PLAN §4 World B): name, kind, is_liquid
  insert into public.networth_classes (user_id, name, kind, is_liquid) values
    (uid, 'paper_cash',  'asset',     true),
    (uid, 'ecash',       'asset',     true),
    (uid, 'savings',     'asset',     true),
    (uid, 'crypto',      'asset',     true),
    (uid, 'super',       'asset',     false),
    (uid, 'property',    'asset',     false),
    (uid, 'hecs',        'liability', false),
    (uid, 'credit_card', 'liability', false);

  -- Expense categories
  insert into public.categories (user_id, name, kind) values
    (uid, 'Groceries', 'expense'),
    (uid, 'Dining Out', 'expense'),
    (uid, 'Fuel', 'expense'),
    (uid, 'Transport', 'expense'),
    (uid, 'Rent / Mortgage', 'expense'),
    (uid, 'Utilities', 'expense'),
    (uid, 'Insurance', 'expense'),
    (uid, 'Health', 'expense'),
    (uid, 'Subscriptions', 'expense'),
    (uid, 'Shopping', 'expense'),
    (uid, 'Entertainment', 'expense'),
    (uid, 'Travel', 'expense'),
    (uid, 'Education', 'expense'),
    (uid, 'Fees & Charges', 'expense'),
    (uid, 'Other Expense', 'expense');

  -- Income categories
  insert into public.categories (user_id, name, kind) values
    (uid, 'Salary', 'income'),
    (uid, 'Interest', 'income'),
    (uid, 'Dividends', 'income'),
    (uid, 'Refunds', 'income'),
    (uid, 'Gifts', 'income'),
    (uid, 'Other Income', 'income');

  -- Transfer category
  insert into public.categories (user_id, name, kind) values
    (uid, 'Transfer', 'transfer');

  -- Allocation pools (PLAN §4 World C): two to start
  insert into public.allocation_pools (user_id, name, source) values
    (uid, 'Buy with Balance (e-cash)', 'balance'),
    (uid, 'Buy with Savings', 'savings');

  return new;
end;
$$;

create trigger trg_seed_new_user
  after insert on auth.users
  for each row execute function public.seed_new_user();

-- Trigger-only function: not meant to be called via the REST/RPC API.
revoke execute on function public.seed_new_user() from public, anon, authenticated;
