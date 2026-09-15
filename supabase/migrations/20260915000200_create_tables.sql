-- Internal relationships preserve history on ordinary deletes. NO ACTION checks
-- at statement end let auth.users ON DELETE CASCADE remove all of a user's rows
-- together, without depending on the order of the cascading FK triggers.
-- See PostgreSQL 17 CREATE TABLE: DEFERRABLE / INITIALLY IMMEDIATE.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  type public.account_type not null,
  initial_balance numeric(14,2) not null default 0,
  initial_balance_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_user_id_id_key unique (user_id, id),
  constraint accounts_name_not_blank check (btrim(name) <> ''),
  constraint accounts_initial_balance_finite check (
    initial_balance not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
  )
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  type public.transaction_type not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_user_id_id_type_key unique (user_id, id, type),
  constraint categories_name_not_blank check (btrim(name) <> '')
);

create table public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  limit_amount numeric(14,2) not null,
  closing_day smallint not null,
  due_day smallint not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_cards_user_id_id_key unique (user_id, id),
  constraint credit_cards_name_not_blank check (btrim(name) <> ''),
  constraint credit_cards_limit_amount_valid check (
    limit_amount >= 0 and limit_amount not in ('NaN'::numeric, 'Infinity'::numeric)
  ),
  constraint credit_cards_closing_day_valid check (closing_day between 1 and 31),
  constraint credit_cards_due_day_valid check (due_day between 1 and 31)
);

create table public.credit_card_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  credit_card_id uuid not null,
  reference_month date not null,
  closing_date date not null,
  due_date date not null,
  status public.invoice_status not null default 'open',
  paid_at date,
  payment_account_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_card_invoices_user_id_id_card_key unique (user_id, id, credit_card_id),
  constraint credit_card_invoices_card_month_key unique (credit_card_id, reference_month),
  constraint credit_card_invoices_card_fkey foreign key (user_id, credit_card_id)
    references public.credit_cards (user_id, id) on delete no action deferrable initially immediate,
  constraint credit_card_invoices_payment_account_fkey foreign key (user_id, payment_account_id)
    references public.accounts (user_id, id) on delete no action deferrable initially immediate,
  constraint credit_card_invoices_reference_month_first_day check (
    isfinite(reference_month) and extract(day from reference_month) = 1
  ),
  constraint credit_card_invoices_dates_valid check (
    isfinite(closing_date) and isfinite(due_date) and due_date >= closing_date
    and date_trunc('month', closing_date)::date = reference_month
  ),
  constraint credit_card_invoices_payment_consistent check (
    (status = 'paid' and paid_at is not null and payment_account_id is not null)
    or (status <> 'paid' and paid_at is null and payment_account_id is null)
  )
);

create table public.installment_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  description text not null,
  original_amount numeric(14,2) not null,
  installment_count integer not null,
  created_at timestamptz not null default now(),
  constraint installment_groups_user_id_id_key unique (user_id, id),
  constraint installment_groups_description_not_blank check (btrim(description) <> ''),
  constraint installment_groups_original_amount_valid check (
    original_amount > 0 and original_amount not in ('NaN'::numeric, 'Infinity'::numeric)
  ),
  constraint installment_groups_count_valid check (installment_count > 1)
);

create table public.recurrence_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type public.transaction_type not null,
  description text not null,
  category_id uuid not null,
  amount numeric(14,2) not null,
  frequency public.recurrence_frequency not null,
  interval_count integer not null default 1,
  start_date date not null,
  end_date date,
  max_occurrences integer,
  planned_payment_method public.payment_method,
  account_id uuid,
  credit_card_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurrence_rules_user_id_id_key unique (user_id, id),
  constraint recurrence_rules_category_fkey foreign key (user_id, category_id, type)
    references public.categories (user_id, id, type) on delete no action deferrable initially immediate,
  constraint recurrence_rules_account_fkey foreign key (user_id, account_id)
    references public.accounts (user_id, id) on delete no action deferrable initially immediate,
  constraint recurrence_rules_card_fkey foreign key (user_id, credit_card_id)
    references public.credit_cards (user_id, id) on delete no action deferrable initially immediate,
  constraint recurrence_rules_description_not_blank check (btrim(description) <> ''),
  constraint recurrence_rules_amount_valid check (
    amount > 0 and amount not in ('NaN'::numeric, 'Infinity'::numeric)
  ),
  constraint recurrence_rules_interval_valid check (interval_count >= 1),
  constraint recurrence_rules_max_occurrences_valid check (
    max_occurrences is null or max_occurrences >= 1
  ),
  constraint recurrence_rules_dates_valid check (
    isfinite(start_date) and (end_date is null or (isfinite(end_date) and end_date >= start_date))
  ),
  constraint recurrence_rules_credit_card_consistent check (
    (planned_payment_method is not distinct from 'credit_card'::public.payment_method
      and credit_card_id is not null and account_id is null and type = 'expense')
    or (planned_payment_method is distinct from 'credit_card'::public.payment_method
      and credit_card_id is null)
  )
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type public.transaction_type not null,
  description text not null,
  category_id uuid not null,
  amount numeric(14,2) not null,
  transaction_date date not null,
  due_date date,
  status public.transaction_status not null default 'pending',
  planned_payment_method public.payment_method,
  actual_payment_method public.payment_method,
  account_id uuid,
  credit_card_id uuid,
  credit_card_invoice_id uuid,
  installment_group_id uuid,
  installment_number integer,
  installment_total integer,
  recurrence_rule_id uuid,
  settled_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_category_fkey foreign key (user_id, category_id, type)
    references public.categories (user_id, id, type) on delete no action deferrable initially immediate,
  constraint transactions_account_fkey foreign key (user_id, account_id)
    references public.accounts (user_id, id) on delete no action deferrable initially immediate,
  constraint transactions_card_fkey foreign key (user_id, credit_card_id)
    references public.credit_cards (user_id, id) on delete no action deferrable initially immediate,
  constraint transactions_invoice_fkey foreign key (user_id, credit_card_invoice_id, credit_card_id)
    references public.credit_card_invoices (user_id, id, credit_card_id)
    on delete no action deferrable initially immediate,
  constraint transactions_installment_group_fkey foreign key (user_id, installment_group_id)
    references public.installment_groups (user_id, id) on delete no action deferrable initially immediate,
  constraint transactions_recurrence_rule_fkey foreign key (user_id, recurrence_rule_id)
    references public.recurrence_rules (user_id, id) on delete no action deferrable initially immediate,
  constraint transactions_description_not_blank check (btrim(description) <> ''),
  constraint transactions_amount_valid check (
    amount > 0 and amount not in ('NaN'::numeric, 'Infinity'::numeric)
  ),
  constraint transactions_dates_valid check (
    isfinite(transaction_date) and (due_date is null or isfinite(due_date))
    and (settled_at is null or isfinite(settled_at))
  ),
  constraint transactions_installment_consistent check (
    (installment_group_id is null and installment_number is null and installment_total is null)
    or (installment_group_id is not null and installment_number is not null
      and installment_total is not null and installment_number >= 1
      and installment_total > 1 and installment_number <= installment_total)
  ),
  constraint transactions_credit_card_consistent check (
    (planned_payment_method is not distinct from 'credit_card'::public.payment_method
      and credit_card_id is not null and credit_card_invoice_id is not null
      and account_id is null and type = 'expense')
    or (planned_payment_method is distinct from 'credit_card'::public.payment_method
      and credit_card_id is null and credit_card_invoice_id is null)
  ),
  constraint transactions_settlement_consistent check (
    (status = 'pending' and settled_at is null and actual_payment_method is null)
    or (status = 'settled' and settled_at is not null and account_id is not null
      and actual_payment_method is not null and actual_payment_method <> 'credit_card'
      and planned_payment_method is distinct from 'credit_card'::public.payment_method)
  )
);

create table public.account_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null,
  type public.movement_type not null,
  amount numeric(14,2) not null,
  movement_date date not null,
  origin_type public.movement_origin_type not null,
  origin_id uuid,
  transfer_group_id uuid,
  reversal_of_movement_id uuid,
  description text not null,
  created_at timestamptz not null default now(),
  constraint account_movements_user_id_id_key unique (user_id, id),
  constraint account_movements_account_fkey foreign key (user_id, account_id)
    references public.accounts (user_id, id) on delete no action deferrable initially immediate,
  constraint account_movements_reversal_fkey foreign key (user_id, reversal_of_movement_id)
    references public.account_movements (user_id, id) on delete no action deferrable initially immediate,
  constraint account_movements_amount_valid check (
    amount > 0 and amount not in ('NaN'::numeric, 'Infinity'::numeric)
  ),
  constraint account_movements_date_valid check (isfinite(movement_date)),
  constraint account_movements_description_not_blank check (btrim(description) <> ''),
  constraint account_movements_reversal_consistent check (
    (origin_type = 'reversal' and reversal_of_movement_id is not null and reversal_of_movement_id <> id)
    or (origin_type <> 'reversal' and reversal_of_movement_id is null)
  ),
  constraint account_movements_transfer_group_required check (
    origin_type <> 'transfer' or transfer_group_id is not null
  ),
  constraint account_movements_payment_origin_consistent check (
    origin_type not in ('expense_payment', 'income_receipt', 'credit_card_payment')
    or (origin_id is not null
      and ((origin_type in ('expense_payment', 'credit_card_payment') and type = 'out')
        or (origin_type = 'income_receipt' and type = 'in')))
  )
);

comment on table public.transactions is
  'Income and expenses; a credit-card purchase is an expense without a bank-account movement.';
comment on table public.account_movements is
  'Append-only cash ledger. Payment, transfer and reversal RPCs are its only client write path.';
comment on column public.accounts.initial_balance_date is
  'Opening date: current balance includes account movements on or after this date.';
