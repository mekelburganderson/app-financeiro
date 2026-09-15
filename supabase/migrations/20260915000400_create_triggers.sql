-- Internal trigger functions are deliberately outside the exposed API schema.
create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, full_name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function private.handle_new_user();
-- Also support existing Auth users when installing into an empty public schema.
insert into public.profiles(id, full_name, avatar_url)
select id, coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name'),
  coalesce(raw_user_meta_data->>'avatar_url', raw_user_meta_data->>'picture')
from auth.users on conflict (id) do nothing;

create function private.protect_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id
    or (to_jsonb(new)->>'user_id') is distinct from (to_jsonb(old)->>'user_id')
    or new.created_at is distinct from old.created_at then
    raise exception 'Record identity and creation date are immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles','accounts','categories','credit_cards','credit_card_invoices',
    'installment_groups','recurrence_rules','transactions','account_movements'] loop
    execute format('create trigger protect_identity before update on public.%I for each row execute function private.protect_identity()', t);
  end loop;
  foreach t in array array['profiles','accounts','categories','credit_cards','credit_card_invoices','recurrence_rules','transactions'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', t);
  end loop;
end;
$$;

-- Acquire the same per-user lock before PostgreSQL locks individual rows for
-- direct Data API statements. Financial RPCs acquire it before their queries.
create function private.lock_current_owner() returns trigger
language plpgsql set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is not null then perform pg_advisory_xact_lock(hashtextextended(u::text, 0)); end if;
  return null;
end;
$$;
create trigger lock_owner before insert or update or delete on public.accounts
for each statement execute function private.lock_current_owner();
create trigger lock_owner before insert or update or delete on public.credit_cards
for each statement execute function private.lock_current_owner();
create trigger lock_owner before insert or update or delete on public.credit_card_invoices
for each statement execute function private.lock_current_owner();
create trigger lock_owner before insert or update or delete on public.transactions
for each statement execute function private.lock_current_owner();

-- This trigger is SECURITY INVOKER: current_user is the API role for direct
-- writes, and postgres only while executing one of the guarded RPCs below.
create function private.guard_transaction() returns trigger
language plpgsql set search_path = '' as $$
declare invoice public.credit_card_invoices; invoice_id uuid; owner_id uuid;
begin
  if tg_op = 'DELETE' then owner_id := old.user_id; else owner_id := new.user_id; end if;
  if tg_op = 'DELETE' and current_user = 'postgres' then
    if not exists(select 1 from auth.users where id = old.user_id) then return old; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  if tg_op = 'INSERT' and current_user <> 'postgres' and new.status <> 'pending' then
    raise exception 'Use settle_transaction to settle a transaction' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and current_user <> 'postgres' and new.installment_group_id is not null then
    raise exception 'Use create_card_purchase to create installments' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if current_user <> 'postgres' and
      row(new.status,new.settled_at,new.actual_payment_method) is distinct from
      row(old.status,old.settled_at,old.actual_payment_method) then
      raise exception 'Use payment RPCs to change settlement' using errcode = '23514';
    end if;
    if old.status = 'settled' and (to_jsonb(new) - array['notes','description','updated_at','status','settled_at','actual_payment_method','account_id'])
       is distinct from (to_jsonb(old) - array['notes','description','updated_at','status','settled_at','actual_payment_method','account_id']) then
      raise exception 'Reverse the payment before changing a settled transaction' using errcode = '23514';
    end if;
    if old.status = 'settled' and current_user <> 'postgres' and new.account_id is distinct from old.account_id then
      raise exception 'Settlement account is immutable; reverse the payment first' using errcode = '23514';
    end if;
    if (old.installment_group_id is not null or new.installment_group_id is not null)
      and (to_jsonb(new) - array['description','notes','updated_at']) is distinct from
          (to_jsonb(old) - array['description','notes','updated_at']) then
      raise exception 'Installment financial fields are immutable' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'DELETE' then
    if old.installment_group_id is not null or old.status = 'settled' or exists(select 1 from public.account_movements
      where user_id = old.user_id and origin_id = old.id and origin_type in ('expense_payment','income_receipt')) then
      raise exception 'Cannot delete a transaction with financial history' using errcode = '23514';
    end if;
  end if;
  -- Lock both invoices (ordered) to serialize changes with close/pay RPCs.
  for invoice_id in select distinct x from unnest(array[
    case when tg_op <> 'INSERT' then old.credit_card_invoice_id end,
    case when tg_op <> 'DELETE' then new.credit_card_invoice_id end]) x where x is not null order by x loop
    select * into invoice from public.credit_card_invoices where id = invoice_id and user_id = owner_id for update;
    if found and invoice.status <> 'open' then
      if tg_op <> 'UPDATE' then
        raise exception 'Closed or paid invoice cannot be changed' using errcode = '23514';
      end if;
      if (to_jsonb(new) - array['description','notes','updated_at']) is distinct from
         (to_jsonb(old) - array['description','notes','updated_at']) then
        raise exception 'Closed or paid invoice financial fields are immutable' using errcode = '23514';
      end if;
    end if;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  if new.installment_group_id is not null and not exists (
    select 1 from public.installment_groups g where g.id = new.installment_group_id
      and g.user_id = new.user_id and g.installment_count = new.installment_total) then
    raise exception 'Installment total must match its group' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger guard_transaction before insert or update or delete on public.transactions
for each row execute function private.guard_transaction();

create function private.guard_invoice() returns trigger
language plpgsql set search_path = '' as $$
declare c public.credit_cards; expected_closing date; expected_due date;
begin
  if tg_op = 'DELETE' and current_user = 'postgres' then
    if not exists(select 1 from auth.users where id = old.user_id) then return old; end if;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'open' then
      raise exception 'Create an open invoice first' using errcode = '23514';
    end if;
    select * into c from public.credit_cards where id = new.credit_card_id and user_id = new.user_id;
    if found then
      expected_closing := (new.reference_month + (least(c.closing_day,
        extract(day from (new.reference_month + interval '1 month - 1 day')))::integer - 1))::date;
      expected_due := ((case when c.due_day <= c.closing_day then
        (new.reference_month + interval '1 month')::date else new.reference_month end) +
        (least(c.due_day,extract(day from (date_trunc('month',case when c.due_day <= c.closing_day then
          (new.reference_month + interval '1 month')::date else new.reference_month end) +
          interval '1 month - 1 day')))::integer - 1))::date;
      if new.closing_date is distinct from expected_closing or new.due_date is distinct from expected_due then
        raise exception 'Invoice dates must match the card cycle' using errcode = '23514';
      end if;
    end if;
  elsif tg_op = 'DELETE' then
    if old.status <> 'open' or exists(select 1 from public.account_movements
      where user_id = old.user_id and origin_type = 'credit_card_payment' and origin_id = old.id) then
      raise exception 'Cannot delete an invoice with consolidated history' using errcode = '23514';
    end if;
    return old;
  else
    if current_user <> 'postgres' and row(new.status,new.paid_at,new.payment_account_id)
      is distinct from row(old.status,old.paid_at,old.payment_account_id) then
      raise exception 'Use invoice RPCs to change status or payment' using errcode = '23514';
    end if;
    if row(new.credit_card_id,new.reference_month,new.closing_date,new.due_date)
      is distinct from row(old.credit_card_id,old.reference_month,old.closing_date,old.due_date) then
      raise exception 'Invoice period and card are immutable' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_invoice before insert or update or delete on public.credit_card_invoices
for each row execute function private.guard_invoice();

create function private.guard_ledger() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and current_user = 'postgres' then
    if not exists(select 1 from auth.users where id = old.user_id) then return old; end if;
  end if;
  if tg_op <> 'INSERT' then
    raise exception 'Account movements are append-only; create a reversal' using errcode = '23514';
  end if;
  if current_user <> 'postgres' then
    raise exception 'Use financial RPCs to create movements' using errcode = '42501';
  end if;
  if not exists(select 1 from public.accounts a where a.id = new.account_id and a.user_id = new.user_id
    and new.movement_date >= a.initial_balance_date) then
    raise exception 'Movement precedes account initial balance date or account is invalid' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger guard_ledger before insert or update or delete on public.account_movements
for each row execute function private.guard_ledger();

create function private.guard_account_opening() returns trigger
language plpgsql set search_path = '' as $$
begin
  if row(new.initial_balance,new.initial_balance_date) is distinct from row(old.initial_balance,old.initial_balance_date)
    and exists(select 1 from public.account_movements where account_id = old.id) then
    raise exception 'Initial balance is immutable after the first movement' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger guard_account_opening before update on public.accounts
for each row execute function private.guard_account_opening();

create function private.guard_installment_group() returns trigger
language plpgsql set search_path = '' as $$
begin
  if row(new.original_amount,new.installment_count) is distinct from row(old.original_amount,old.installment_count)
    and exists(select 1 from public.transactions where installment_group_id = old.id) then
    raise exception 'Consolidated installment group is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger guard_installment_group before update on public.installment_groups
for each row execute function private.guard_installment_group();

create function private.guard_card_cycle() returns trigger
language plpgsql set search_path = '' as $$
begin
  if row(new.closing_day,new.due_day) is distinct from row(old.closing_day,old.due_day)
    and exists(select 1 from public.credit_card_invoices where credit_card_id = old.id) then
    raise exception 'Card cycle is immutable after the first invoice' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger guard_card_cycle before update on public.credit_cards
for each row execute function private.guard_card_cycle();

revoke all on all functions in schema private from public, anon, authenticated;
