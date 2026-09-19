-- The accounts module lets the owner revise the opening balance and date,
-- including after movements exist. RLS, identity protection, finite numeric
-- constraint and the derived balance view remain in place. The UI confirms
-- that an edit with movements can change the current balance.
drop trigger if exists guard_account_opening on public.accounts;
drop function if exists private.guard_account_opening();
