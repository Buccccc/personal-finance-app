-- ============================================================================
-- 0028: finish what 0027 started.
--
-- Postgres grants EXECUTE to PUBLIC by default on every new function, and
-- anon/authenticated inherit that. 0027 revoked the role-level grants but left
-- the PUBLIC one (visible as the leading `=X/postgres` in proacl), so the
-- functions were still reachable at /rest/v1/rpc/... and the advisor warnings
-- stood. Revoking from PUBLIC is the part that actually closes them.
--
-- Triggers are unaffected: PostgreSQL checks EXECUTE on a trigger function at
-- CREATE TRIGGER time, not when the trigger fires. Verified by inserting a
-- transaction under `set local role authenticated` after the revoke and
-- confirming the balance still recomputed.
--
-- sync_account_networth() keeps its `authenticated` grant: the app calls it as
-- an RPC after imports and account edits. It loses PUBLIC and anon.
--
-- Applied via MCP migration 0028_revoke_public_execute_on_internal_functions
-- (2026-08-14).
-- ============================================================================

revoke execute on function public.recompute_account_balance(uuid)   from public;
revoke execute on function public.sync_account_networth_for(uuid)   from public;
revoke execute on function public.tg_account_balance_write()        from public;
revoke execute on function public.tg_recompute_balance_ins()        from public;
revoke execute on function public.tg_recompute_balance_upd()        from public;
revoke execute on function public.tg_recompute_balance_del()        from public;
revoke execute on function public.tg_sync_networth_on_balance()     from public;

revoke execute on function public.sync_account_networth()           from public, anon;
grant  execute on function public.sync_account_networth()           to authenticated;
