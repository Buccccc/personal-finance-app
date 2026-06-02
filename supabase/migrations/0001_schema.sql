-- ============================================================================
-- Personal Finance App — Core Schema (World A: Flows, World B: Balances, World C: Virtual)
-- Every table is user-scoped. RLS policies in 0002_rls.sql.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Shared: updated_at trigger
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- LOOKUPS / SHARED
-- ============================================================================

-- categories: hierarchical via parent_id; kind is a soft UX hint for the picker.
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  kind        text not null check (kind in ('expense','income','transfer')),
  parent_id   uuid references public.categories(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.categories(user_id);
create index on public.categories(parent_id);

-- merchants: canonical entities normalising messy bank text.
create table public.merchants (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name                text not null,
  default_category_id uuid references public.categories(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on public.merchants(user_id);

-- merchant_aliases: raw description patterns → merchant.
create table public.merchant_aliases (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  pattern     text not null,
  created_at  timestamptz not null default now()
);
create index on public.merchant_aliases(user_id);
create index on public.merchant_aliases(merchant_id);

-- tags + transaction_tags (many-to-many)
create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
create index on public.tags(user_id);

-- ============================================================================
-- WORLD A — FLOWS
-- ============================================================================

create table public.accounts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name             text not null,
  type             text not null check (type in ('everyday','savings','credit_card','cash','ecash')),
  institution      text,
  basiq_account_id text,
  currency         text not null default 'AUD',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on public.accounts(user_id);

create table public.transactions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id          uuid not null references public.accounts(id) on delete cascade,
  date                date not null,
  description         text,                              -- raw bank text
  amount              numeric(14,2) not null,
  type                text not null check (type in ('expense','income','transfer')),
  merchant_id         uuid references public.merchants(id) on delete set null,
  category_id         uuid references public.categories(id) on delete set null,
  subcategory_id      uuid references public.categories(id) on delete set null,
  tax_deductible      boolean not null default false,
  transfer_group_id   uuid,                              -- links the two legs of a transfer
  -- AI-assist columns (exist from day one, populated later)
  ai_category_id      uuid references public.categories(id) on delete set null,
  ai_confidence       numeric(5,4),
  ai_reason           text,
  human_verified      boolean not null default false,
  basiq_transaction_id text,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on public.transactions(user_id);
create index on public.transactions(account_id);
create index on public.transactions(date);
create index on public.transactions(category_id);
create index on public.transactions(merchant_id);
create index on public.transactions(transfer_group_id);
create index on public.transactions(user_id, human_verified);

create table public.transaction_tags (
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  tag_id         uuid not null references public.tags(id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (transaction_id, tag_id)
);
create index on public.transaction_tags(user_id);

-- categorisation_rules: deterministic, runs before AI.
create table public.categorisation_rules (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  match_type          text not null check (match_type in ('merchant','description_contains','amount','combo')),
  pattern             text,
  amount_min          numeric(14,2),
  amount_max          numeric(14,2),
  merchant_id         uuid references public.merchants(id) on delete cascade,
  category_id         uuid references public.categories(id) on delete set null,
  subcategory_id      uuid references public.categories(id) on delete set null,
  set_tax_deductible  boolean,
  priority            integer not null default 100,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on public.categorisation_rules(user_id);
create index on public.categorisation_rules(user_id, priority);

-- ============================================================================
-- RECURRING / BILLS (drives the calendar)
-- ============================================================================

create table public.recurring_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null,
  amount        numeric(14,2) not null,
  direction     text not null check (direction in ('in','out')),
  frequency     text not null check (frequency in ('weekly','fortnightly','monthly','quarterly','yearly')),
  next_due_date date not null,
  account_id    uuid references public.accounts(id) on delete set null,
  category_id   uuid references public.categories(id) on delete set null,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.recurring_items(user_id);

-- ============================================================================
-- WORLD B — BALANCES (net worth)
-- ============================================================================

-- networth_classes: lookup so new classes don't need an enum migration.
create table public.networth_classes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  kind       text not null check (kind in ('asset','liability')),
  is_liquid  boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
create index on public.networth_classes(user_id);

create table public.networth_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  class_id   uuid not null references public.networth_classes(id) on delete restrict,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.networth_items(user_id);

-- value_entries: dated point-in-time values. The key table for net-worth history.
create table public.value_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_id    uuid not null references public.networth_items(id) on delete cascade,
  date       date not null,
  value      numeric(14,2) not null,
  created_at timestamptz not null default now(),
  unique (item_id, date)
);
create index on public.value_entries(user_id);
create index on public.value_entries(item_id, date);

-- ============================================================================
-- WORLD C — VIRTUAL ALLOCATIONS
-- ============================================================================

create table public.allocation_pools (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name              text not null,
  source            text not null check (source in ('balance','savings')),
  linked_account_id uuid references public.accounts(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on public.allocation_pools(user_id);

create table public.allocation_items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pool_id        uuid not null references public.allocation_pools(id) on delete cascade,
  name           text not null,
  amount         numeric(14,2) not null default 0,
  priority_order integer not null default 0,
  target_amount  numeric(14,2),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.allocation_items(user_id);
create index on public.allocation_items(pool_id);

-- ============================================================================
-- updated_at triggers
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'categories','merchants','accounts','transactions','categorisation_rules',
    'recurring_items','networth_items','allocation_pools','allocation_items'
  ] loop
    execute format(
      'create trigger trg_%1$s_updated_at before update on public.%1$s
       for each row execute function public.set_updated_at();', t);
  end loop;
end$$;
