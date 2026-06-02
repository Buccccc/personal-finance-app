-- ============================================================================
-- Row-Level Security — every table isolated per user (auth.uid() = user_id)
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'categories','merchants','merchant_aliases','tags','accounts','transactions',
    'transaction_tags','categorisation_rules','recurring_items','networth_classes',
    'networth_items','value_entries','allocation_pools','allocation_items'
  ] loop
    execute format('alter table public.%1$s enable row level security;', t);
    execute format('alter table public.%1$s force row level security;', t);

    execute format($f$
      create policy "%1$s_select" on public.%1$s
        for select using (user_id = auth.uid());
    $f$, t);

    execute format($f$
      create policy "%1$s_insert" on public.%1$s
        for insert with check (user_id = auth.uid());
    $f$, t);

    execute format($f$
      create policy "%1$s_update" on public.%1$s
        for update using (user_id = auth.uid()) with check (user_id = auth.uid());
    $f$, t);

    execute format($f$
      create policy "%1$s_delete" on public.%1$s
        for delete using (user_id = auth.uid());
    $f$, t);
  end loop;
end$$;
