-- Allocation pools carry an optional manual total (the virtual balance being carved up).
-- "unallocated" = coalesce(manual_total,0) - sum(allocation_items.amount).
alter table public.allocation_pools
  add column if not exists manual_total numeric(14,2) not null default 0;
