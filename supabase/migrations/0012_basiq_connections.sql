-- Links an app user to their Basiq user id (one per app user).
create table if not exists public.basiq_connections (
  user_id        uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  basiq_user_id  text not null,
  last_synced_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.basiq_connections enable row level security;
alter table public.basiq_connections force row level security;

create policy "basiq_connections_select" on public.basiq_connections
  for select using (user_id = auth.uid());
create policy "basiq_connections_insert" on public.basiq_connections
  for insert with check (user_id = auth.uid());
create policy "basiq_connections_update" on public.basiq_connections
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "basiq_connections_delete" on public.basiq_connections
  for delete using (user_id = auth.uid());

create trigger trg_basiq_connections_updated_at
  before update on public.basiq_connections
  for each row execute function public.set_updated_at();
