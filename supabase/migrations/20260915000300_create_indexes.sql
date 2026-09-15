create index accounts_user_active_idx on public.accounts (user_id, active);

create unique index categories_user_type_name_key
  on public.categories (user_id, type, lower(btrim(name)));
create index categories_user_active_idx on public.categories (user_id, active);
create index credit_cards_user_active_idx on public.credit_cards (user_id, active);

-- (credit_card_id, reference_month) is already indexed by the unique constraint.
create index credit_card_invoices_card_status_idx
  on public.credit_card_invoices (credit_card_id, status);
create index credit_card_invoices_user_due_date_idx
  on public.credit_card_invoices (user_id, due_date);
create index credit_card_invoices_payment_account_idx
  on public.credit_card_invoices (payment_account_id) where payment_account_id is not null;

create index recurrence_rules_user_active_idx on public.recurrence_rules (user_id, active);
create index recurrence_rules_category_idx on public.recurrence_rules (category_id);
create index recurrence_rules_account_idx on public.recurrence_rules (account_id) where account_id is not null;
create index recurrence_rules_card_idx on public.recurrence_rules (credit_card_id) where credit_card_id is not null;

create index transactions_user_transaction_date_idx on public.transactions (user_id, transaction_date);
create index transactions_user_due_date_idx on public.transactions (user_id, due_date);
create index transactions_user_status_idx on public.transactions (user_id, status);
create index transactions_user_category_idx on public.transactions (user_id, category_id);
create index transactions_invoice_idx
  on public.transactions (credit_card_invoice_id) where credit_card_invoice_id is not null;
create index transactions_account_idx on public.transactions (account_id) where account_id is not null;
create index transactions_card_idx on public.transactions (credit_card_id) where credit_card_id is not null;

-- These unique indexes also support lookups by installment group / recurrence rule.
create unique index transactions_installment_number_key
  on public.transactions (installment_group_id, installment_number) where installment_group_id is not null;
create unique index transactions_recurrence_date_key
  on public.transactions (recurrence_rule_id, transaction_date) where recurrence_rule_id is not null;

create index account_movements_account_date_idx on public.account_movements (account_id, movement_date);
create index account_movements_user_date_idx on public.account_movements (user_id, movement_date);
create index account_movements_origin_idx on public.account_movements (origin_type, origin_id);
create index account_movements_transfer_group_idx
  on public.account_movements (transfer_group_id) where transfer_group_id is not null;
create unique index account_movements_transfer_direction_key
  on public.account_movements (transfer_group_id, type) where origin_type = 'transfer';
create unique index account_movements_reversal_once_key
  on public.account_movements (reversal_of_movement_id) where reversal_of_movement_id is not null;
