-- ============================================================================
-- 0027: stop internal SECURITY DEFINER functions being reachable as PostgREST
-- RPCs. Trigger functions still fire normally (the trigger mechanism does not
-- check EXECUTE at fire time), and recompute_account_balance is only ever
-- called from inside those definer-owned triggers, so it does not need a grant
-- to anon/authenticated either.
--
-- sync_account_networth() is deliberately left granted: the app calls it as an
-- RPC after imports and account edits.
--
-- Applied via MCP migration 0027_lock_down_internal_functions (2026-08-14),
-- clearing the Supabase security advisor warnings raised by 0026.
-- ============================================================================

revoke execute on function public.recompute_account_balance(uuid)   from anon, authenticated;
revoke execute on function public.sync_account_networth_for(uuid)   from anon, authenticated;
revoke execute on function public.tg_account_balance_write()        from anon, authenticated;
revoke execute on function public.tg_recompute_balance_ins()        from anon, authenticated;
revoke execute on function public.tg_recompute_balance_upd()        from anon, authenticated;
revoke execute on function public.tg_recompute_balance_del()        from anon, authenticated;
revoke execute on function public.tg_sync_networth_on_balance()     from anon, authenticated;
