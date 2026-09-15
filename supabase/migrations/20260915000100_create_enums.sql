-- Internal trigger helpers live outside the schemas exposed by the Data API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.account_type as enum ('checking', 'savings', 'cash', 'other');
create type public.transaction_type as enum ('expense', 'income');
create type public.transaction_status as enum ('pending', 'settled');
create type public.payment_method as enum (
  'credit_card', 'debit_card', 'pix', 'cash', 'boleto', 'bank_transfer', 'other'
);
create type public.invoice_status as enum ('open', 'closed', 'paid');
create type public.recurrence_frequency as enum ('daily', 'weekly', 'monthly', 'yearly');
create type public.movement_type as enum ('in', 'out');
create type public.movement_origin_type as enum (
  'expense_payment', 'income_receipt', 'credit_card_payment',
  'transfer', 'balance_adjustment', 'reversal'
);
