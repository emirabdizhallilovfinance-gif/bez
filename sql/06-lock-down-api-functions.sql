-- Internal functions must not be callable through the REST API (/rest/v1/rpc/...).
-- Already applied in Supabase on 14.11.2026.
-- Trigger functions keep working: triggers do not need EXECUTE rights.
revoke execute on function public.check_expense_balance() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
-- is_admin() is used inside row-level security rules, so signed-in users keep it.
revoke execute on function public.is_admin() from public, anon;
