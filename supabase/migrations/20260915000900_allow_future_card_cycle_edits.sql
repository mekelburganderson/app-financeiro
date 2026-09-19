-- A credit card may change its configured cycle after invoices exist. Each
-- invoice stores its own closing_date and due_date, so updating credit_cards
-- cannot rewrite historical invoice dates. Future invoices read current days.
drop trigger if exists guard_card_cycle on public.credit_cards;
drop function if exists private.guard_card_cycle();
