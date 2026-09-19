-- Expense operations that span rows stay in PostgreSQL. All entry points derive
-- the owner from auth.uid(), use a fixed search_path and share the owner lock.

alter table public.recurrence_rules add column notes text;

-- Keep notes on the rule so occurrences generated in later sessions retain the
-- same optional context as the first occurrence.
create or replace function public.generate_recurrences(p_through_date date) returns integer
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); r public.recurrence_rules; occurrence date; n integer;
  created integer := 0; inv uuid;
begin
  if p_through_date is null then raise exception 'Through date required' using errcode = '23514'; end if;
  for r in select * from public.recurrence_rules where user_id = u and active order by id for update loop
    n := 0;
    loop
      if r.max_occurrences is not null and n >= r.max_occurrences then exit; end if;
      occurrence := case r.frequency
        when 'daily' then r.start_date + n * r.interval_count
        when 'weekly' then r.start_date + n * r.interval_count * 7
        when 'monthly' then (r.start_date + make_interval(months => n * r.interval_count))::date
        when 'yearly' then (r.start_date + make_interval(years => n * r.interval_count))::date end;
      exit when occurrence > p_through_date or (r.end_date is not null and occurrence > r.end_date);
      if not exists(select 1 from public.transactions where recurrence_rule_id = r.id and transaction_date = occurrence) then
        if created >= 10000 then return created; end if;
        inv := null;
        if r.planned_payment_method = 'credit_card' then inv := private.ensure_invoice(u,r.credit_card_id,occurrence); end if;
        insert into public.transactions(user_id,type,description,category_id,amount,transaction_date,due_date,
          planned_payment_method,account_id,credit_card_id,credit_card_invoice_id,recurrence_rule_id,notes)
        values(u,r.type,r.description,r.category_id,r.amount,occurrence,
          coalesce((select due_date from public.credit_card_invoices where id=inv),occurrence),
          r.planned_payment_method,r.account_id,r.credit_card_id,inv,r.id,r.notes);
        created := created + 1;
      end if;
      n := n + 1;
    end loop;
  end loop;
  return created;
end;
$$;

create function public.create_paid_expense(
  p_description text, p_category_id uuid, p_amount numeric, p_transaction_date date,
  p_due_date date, p_planned_payment_method public.payment_method, p_notes text,
  p_account_id uuid, p_payment_method public.payment_method, p_settled_at date
) returns uuid language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); tid uuid;
begin
  if nullif(btrim(p_description),'') is null or p_amount is null or p_amount <= 0
    or p_amount >= 1000000000000 or p_amount <> round(p_amount,2)
    or p_transaction_date is null or p_planned_payment_method is null
    or p_planned_payment_method = 'credit_card' or p_payment_method is null
    or p_payment_method = 'credit_card' or p_settled_at is null then
    raise exception 'Invalid paid expense' using errcode = '23514';
  end if;
  if not exists(select 1 from public.categories where id=p_category_id and user_id=u
    and type='expense' and active) then
    raise exception 'Active expense category required' using errcode = '23514';
  end if;
  insert into public.transactions(user_id,type,description,category_id,amount,
    transaction_date,due_date,planned_payment_method,notes)
  values(u,'expense',btrim(p_description),p_category_id,p_amount,p_transaction_date,
    p_due_date,p_planned_payment_method,p_notes) returning id into tid;
  perform public.settle_transaction(tid,p_account_id,p_payment_method,p_settled_at);
  return tid;
end;
$$;

create function public.create_installment_expense(
  p_description text, p_category_id uuid, p_amount numeric, p_transaction_date date,
  p_due_date date, p_payment_method public.payment_method, p_notes text,
  p_account_id uuid, p_installment_count integer
) returns uuid[] language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); gid uuid; tid uuid; ids uuid[] := array[]::uuid[];
  part numeric; part_amount numeric; occurrence date; due date;
begin
  if nullif(btrim(p_description),'') is null or p_amount is null or p_amount <= 0
    or p_amount >= 1000000000000 or p_amount <> round(p_amount,2)
    or p_transaction_date is null or p_payment_method is null or p_payment_method='credit_card'
    or p_installment_count is null or p_installment_count < 2 or p_installment_count > 600 then
    raise exception 'Invalid installment expense' using errcode = '23514';
  end if;
  if not exists(select 1 from public.categories where id=p_category_id and user_id=u
    and type='expense' and active) then
    raise exception 'Active expense category required' using errcode = '23514';
  end if;
  if p_payment_method in ('pix','debit_card','cash') and p_account_id is null then
    raise exception 'Account required for direct payment method' using errcode='23514';
  end if;
  if p_account_id is not null then perform private.require_account(u,p_account_id,p_transaction_date); end if;
  part := trunc(p_amount / p_installment_count,2);
  if part <= 0 then raise exception 'Each installment must be at least one cent' using errcode='23514'; end if;
  insert into public.installment_groups(user_id,description,original_amount,installment_count)
  values(u,btrim(p_description),p_amount,p_installment_count) returning id into gid;
  for i in 1..p_installment_count loop
    occurrence := (p_transaction_date + make_interval(months => i-1))::date;
    due := case when p_due_date is null then null else (p_due_date + make_interval(months => i-1))::date end;
    part_amount := case when i=p_installment_count then p_amount-part*(p_installment_count-1) else part end;
    insert into public.transactions(user_id,type,description,category_id,amount,
      transaction_date,due_date,planned_payment_method,notes,account_id,installment_group_id,
      installment_number,installment_total)
    values(u,'expense',btrim(p_description),p_category_id,part_amount,occurrence,
      due,p_payment_method,p_notes,p_account_id,gid,i,p_installment_count) returning id into tid;
    ids := array_append(ids,tid);
  end loop;
  return ids;
end;
$$;

create function public.create_expense_card_purchase(
  p_credit_card_id uuid, p_category_id uuid, p_description text, p_amount numeric,
  p_transaction_date date, p_notes text, p_installment_count integer
) returns uuid[] language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); ids uuid[];
begin
  ids := public.create_card_purchase(p_credit_card_id,p_category_id,p_description,
    p_amount,p_transaction_date,p_installment_count);
  if p_notes is not null then
    update public.transactions set notes=p_notes where user_id=u and id=any(ids);
  end if;
  return ids;
end;
$$;

create function public.create_expense_recurrence(
  p_description text, p_category_id uuid, p_amount numeric,
  p_frequency public.recurrence_frequency, p_interval_count integer,
  p_start_date date, p_end_date date, p_max_occurrences integer,
  p_payment_method public.payment_method, p_credit_card_id uuid, p_account_id uuid,
  p_notes text, p_through_date date
) returns uuid language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); rid uuid;
begin
  if nullif(btrim(p_description),'') is null or p_amount is null or p_amount <= 0
    or p_amount >= 1000000000000 or p_amount <> round(p_amount,2)
    or p_frequency is null or p_interval_count is null or p_interval_count < 1
    or p_start_date is null or p_through_date is null
    or (p_end_date is not null and p_end_date < p_start_date)
    or (p_max_occurrences is not null and p_max_occurrences < 1)
    or p_payment_method is null then
    raise exception 'Invalid recurring expense' using errcode='23514';
  end if;
  if not exists(select 1 from public.categories where id=p_category_id and user_id=u
    and type='expense' and active) then
    raise exception 'Active expense category required' using errcode='23514';
  end if;
  if p_payment_method='credit_card' then
    if p_account_id is not null then raise exception 'Card recurrence cannot use account' using errcode='23514'; end if;
    if not exists(select 1 from public.credit_cards where id=p_credit_card_id and user_id=u and active) then
      raise exception 'Active credit card required' using errcode='23514';
    end if;
  elsif p_credit_card_id is not null then
    raise exception 'Card only allowed for credit-card recurrence' using errcode='23514';
  end if;
  if p_payment_method in ('pix','debit_card','cash') and p_account_id is null then
    raise exception 'Account required for direct payment method' using errcode='23514';
  end if;
  if p_account_id is not null then perform private.require_account(u,p_account_id,p_start_date); end if;
  insert into public.recurrence_rules(user_id,type,description,category_id,amount,
    frequency,interval_count,start_date,end_date,max_occurrences,planned_payment_method,
    credit_card_id,account_id,notes)
  values(u,'expense',btrim(p_description),p_category_id,p_amount,p_frequency,
    p_interval_count,p_start_date,p_end_date,p_max_occurrences,p_payment_method,
    p_credit_card_id,p_account_id,p_notes) returning id into rid;
  perform public.generate_recurrences(p_through_date);
  return rid;
end;
$$;

create function public.update_expense(
  p_expense_id uuid, p_description text, p_category_id uuid, p_amount numeric,
  p_transaction_date date, p_due_date date,
  p_payment_method public.payment_method, p_credit_card_id uuid, p_account_id uuid, p_notes text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); t public.transactions; invoice_id uuid; due date;
  locked boolean;
begin
  select * into t from public.transactions where id=p_expense_id and user_id=u and type='expense' for update;
  if not found then raise exception 'Expense not found' using errcode='42501'; end if;
  if nullif(btrim(p_description),'') is null then raise exception 'Description required' using errcode='23514'; end if;
  locked := t.status='settled' or t.installment_group_id is not null
    or exists(select 1 from public.account_movements where user_id=u and origin_type='expense_payment' and origin_id=t.id)
    or exists(select 1 from public.credit_card_invoices where id=t.credit_card_invoice_id and user_id=u and status<>'open');
  if locked then
    if row(p_category_id,p_amount,p_transaction_date,p_due_date,p_payment_method,p_credit_card_id,p_account_id)
      is distinct from row(t.category_id,t.amount,t.transaction_date,t.due_date,t.planned_payment_method,t.credit_card_id,t.account_id) then
      raise exception 'Financial fields locked by history' using errcode='23514';
    end if;
    update public.transactions set description=btrim(p_description),notes=p_notes where id=t.id;
    return t.id;
  end if;
  if p_amount is null or p_amount <= 0 or p_amount >= 1000000000000
    or p_amount <> round(p_amount,2) or p_transaction_date is null or p_payment_method is null then
    raise exception 'Invalid expense edit' using errcode='23514';
  end if;
  if p_category_id is distinct from t.category_id and not exists(
    select 1 from public.categories where id=p_category_id and user_id=u and type='expense' and active) then
    raise exception 'Active expense category required' using errcode='23514';
  end if;
  if p_payment_method='credit_card' then
    if p_account_id is not null then raise exception 'Card expense cannot use account' using errcode='23514'; end if;
    if p_credit_card_id is null then raise exception 'Active credit card required' using errcode='23514'; end if;
    invoice_id := private.ensure_invoice(u,p_credit_card_id,p_transaction_date);
    select due_date into due from public.credit_card_invoices where id=invoice_id and user_id=u;
  else
    if p_credit_card_id is not null then raise exception 'Card only allowed for credit card expense' using errcode='23514'; end if;
    if p_payment_method in ('pix','debit_card','cash') and p_account_id is null then
      raise exception 'Account required for direct payment method' using errcode='23514';
    end if;
    if p_account_id is not null then perform private.require_account(u,p_account_id,p_transaction_date); end if;
    invoice_id := null;
    due := p_due_date;
  end if;
  update public.transactions set description=btrim(p_description),category_id=p_category_id,
    amount=p_amount,transaction_date=p_transaction_date,due_date=due,
    planned_payment_method=p_payment_method,credit_card_id=p_credit_card_id,
    credit_card_invoice_id=invoice_id,account_id=p_account_id,
    notes=p_notes where id=t.id;
  return t.id;
end;
$$;

revoke all on function public.create_paid_expense(text,uuid,numeric,date,date,public.payment_method,text,uuid,public.payment_method,date),
  public.create_installment_expense(text,uuid,numeric,date,date,public.payment_method,text,uuid,integer),
  public.create_expense_card_purchase(uuid,uuid,text,numeric,date,text,integer),
  public.create_expense_recurrence(text,uuid,numeric,public.recurrence_frequency,integer,date,date,integer,public.payment_method,uuid,uuid,text,date),
  public.update_expense(uuid,text,uuid,numeric,date,date,public.payment_method,uuid,uuid,text)
  from public,anon;
grant execute on function public.create_paid_expense(text,uuid,numeric,date,date,public.payment_method,text,uuid,public.payment_method,date),
  public.create_installment_expense(text,uuid,numeric,date,date,public.payment_method,text,uuid,integer),
  public.create_expense_card_purchase(uuid,uuid,text,numeric,date,text,integer),
  public.create_expense_recurrence(text,uuid,numeric,public.recurrence_frequency,integer,date,date,integer,public.payment_method,uuid,uuid,text,date),
  public.update_expense(uuid,text,uuid,numeric,date,date,public.payment_method,uuid,uuid,text)
  to authenticated;
