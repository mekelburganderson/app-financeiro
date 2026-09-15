-- Explicit privileges do not depend on Supabase's default public-schema grants.
revoke all on table public.profiles, public.accounts, public.categories,
  public.credit_cards, public.credit_card_invoices, public.installment_groups,
  public.recurrence_rules, public.transactions, public.account_movements
  from public, anon, authenticated;

grant select, insert, update, delete on table public.profiles, public.accounts,
  public.categories, public.credit_cards, public.credit_card_invoices,
  public.installment_groups, public.recurrence_rules, public.transactions
  to authenticated;
grant select on table public.account_movements to authenticated;
grant all on table public.profiles, public.accounts, public.categories,
  public.credit_cards, public.credit_card_invoices, public.installment_groups,
  public.recurrence_rules, public.transactions, public.account_movements to service_role;

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.credit_cards enable row level security;
alter table public.credit_card_invoices enable row level security;
alter table public.installment_groups enable row level security;
alter table public.recurrence_rules enable row level security;
alter table public.transactions enable row level security;
alter table public.account_movements enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profiles_delete_own on public.profiles for delete to authenticated
  using (id = (select auth.uid()));

create policy accounts_select_own on public.accounts for select to authenticated
  using (user_id = (select auth.uid()));
create policy accounts_insert_own on public.accounts for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy accounts_update_own on public.accounts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy accounts_delete_own on public.accounts for delete to authenticated
  using (user_id = (select auth.uid()));

create policy categories_select_own on public.categories for select to authenticated
  using (user_id = (select auth.uid()));
create policy categories_insert_own on public.categories for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy categories_update_own on public.categories for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy categories_delete_own on public.categories for delete to authenticated
  using (user_id = (select auth.uid()));

create policy credit_cards_select_own on public.credit_cards for select to authenticated
  using (user_id = (select auth.uid()));
create policy credit_cards_insert_own on public.credit_cards for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy credit_cards_update_own on public.credit_cards for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy credit_cards_delete_own on public.credit_cards for delete to authenticated
  using (user_id = (select auth.uid()));

create policy credit_card_invoices_select_own on public.credit_card_invoices for select to authenticated
  using (user_id = (select auth.uid()));
create policy credit_card_invoices_insert_own on public.credit_card_invoices for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy credit_card_invoices_update_own on public.credit_card_invoices for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy credit_card_invoices_delete_own on public.credit_card_invoices for delete to authenticated
  using (user_id = (select auth.uid()));

create policy installment_groups_select_own on public.installment_groups for select to authenticated
  using (user_id = (select auth.uid()));
create policy installment_groups_insert_own on public.installment_groups for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy installment_groups_update_own on public.installment_groups for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy installment_groups_delete_own on public.installment_groups for delete to authenticated
  using (user_id = (select auth.uid()));

create policy recurrence_rules_select_own on public.recurrence_rules for select to authenticated
  using (user_id = (select auth.uid()));
create policy recurrence_rules_insert_own on public.recurrence_rules for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy recurrence_rules_update_own on public.recurrence_rules for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy recurrence_rules_delete_own on public.recurrence_rules for delete to authenticated
  using (user_id = (select auth.uid()));

create policy transactions_select_own on public.transactions for select to authenticated
  using (user_id = (select auth.uid()));
create policy transactions_insert_own on public.transactions for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy transactions_update_own on public.transactions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy transactions_delete_own on public.transactions for delete to authenticated
  using (user_id = (select auth.uid()));

-- No client INSERT / UPDATE / DELETE policies for the consolidated cash ledger.
-- RPCs check ownership and perform the state transition and ledger insert atomically.
create policy account_movements_select_own on public.account_movements for select to authenticated
  using (user_id = (select auth.uid()));

create view public.account_balances with (security_invoker = true) as
select
  a.id as account_id,
  a.user_id,
  a.name,
  a.type,
  a.active,
  a.initial_balance,
  a.initial_balance_date,
  coalesce(sum(m.amount) filter (where m.type = 'in'), 0::numeric) as total_in,
  coalesce(sum(m.amount) filter (where m.type = 'out'), 0::numeric) as total_out,
  a.initial_balance + coalesce(sum(case when m.type = 'in' then m.amount else -m.amount end), 0::numeric)
    as current_balance
from public.accounts a
left join public.account_movements m
  on m.account_id = a.id and m.user_id = a.user_id and m.movement_date >= a.initial_balance_date
group by a.id;

create view public.invoice_totals with (security_invoker = true) as
select
  i.id as invoice_id,
  i.user_id,
  i.credit_card_id,
  i.reference_month,
  i.status,
  coalesce(sum(t.amount), 0::numeric) as total_amount,
  count(t.id) as transaction_count
from public.credit_card_invoices i
left join public.transactions t on t.credit_card_invoice_id = i.id and t.user_id = i.user_id
group by i.id;

revoke all on table public.account_balances, public.invoice_totals from public, anon, authenticated;
grant select on table public.account_balances, public.invoice_totals to authenticated, service_role;

comment on view public.account_balances is
  'Balances derived from the opening balance and cash ledger; caller privileges and RLS apply.';
comment on view public.invoice_totals is
  'Invoice totals derived from purchases, without counting invoice payments as new expenses.';
