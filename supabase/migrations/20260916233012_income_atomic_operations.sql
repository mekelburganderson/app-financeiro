-- Income creation and rule generation span multiple financial rows and must
-- succeed or fail as one PostgreSQL transaction.

create function public.create_received_income(
  p_description text, p_category_id uuid, p_amount numeric, p_transaction_date date,
  p_due_date date, p_notes text, p_account_id uuid, p_received_at date
) returns uuid language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); tid uuid;
begin
  if nullif(btrim(p_description),'') is null or p_amount is null or p_amount <= 0
    or p_amount >= 1000000000000 or p_amount <> round(p_amount,2)
    or p_transaction_date is null or p_received_at is null then
    raise exception 'Invalid received income' using errcode='23514';
  end if;
  if not exists(select 1 from public.categories where id=p_category_id and user_id=u
    and type='income' and active) then
    raise exception 'Active income category required' using errcode='23514';
  end if;
  insert into public.transactions(user_id,type,description,category_id,amount,
    transaction_date,due_date,planned_payment_method,notes)
  values(u,'income',btrim(p_description),p_category_id,p_amount,p_transaction_date,
    p_due_date,'bank_transfer',p_notes) returning id into tid;
  perform public.settle_transaction(tid,p_account_id,'bank_transfer',p_received_at);
  return tid;
end;
$$;

create function public.create_income_recurrence(
  p_description text, p_category_id uuid, p_amount numeric,
  p_frequency public.recurrence_frequency, p_interval_count integer,
  p_start_date date, p_end_date date, p_max_occurrences integer,
  p_account_id uuid, p_notes text, p_through_date date
) returns uuid language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); rid uuid;
begin
  if nullif(btrim(p_description),'') is null or p_amount is null or p_amount <= 0
    or p_amount >= 1000000000000 or p_amount <> round(p_amount,2)
    or p_frequency is null or p_interval_count is null or p_interval_count < 1
    or p_start_date is null or p_through_date is null
    or (p_end_date is not null and p_end_date < p_start_date)
    or (p_max_occurrences is not null and p_max_occurrences < 1) then
    raise exception 'Invalid recurring income' using errcode='23514';
  end if;
  if not exists(select 1 from public.categories where id=p_category_id and user_id=u
    and type='income' and active) then
    raise exception 'Active income category required' using errcode='23514';
  end if;
  if p_account_id is not null then perform private.require_account(u,p_account_id,p_start_date); end if;
  insert into public.recurrence_rules(user_id,type,description,category_id,amount,
    frequency,interval_count,start_date,end_date,max_occurrences,
    planned_payment_method,account_id,notes)
  values(u,'income',btrim(p_description),p_category_id,p_amount,p_frequency,
    p_interval_count,p_start_date,p_end_date,p_max_occurrences,
    'bank_transfer',p_account_id,p_notes) returning id into rid;
  perform public.generate_recurrences(p_through_date);
  return rid;
end;
$$;

create function public.update_income(
  p_income_id uuid, p_description text, p_category_id uuid, p_amount numeric,
  p_transaction_date date, p_due_date date, p_notes text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); t public.transactions; locked boolean;
begin
  select * into t from public.transactions where id=p_income_id and user_id=u and type='income' for update;
  if not found then raise exception 'Income not found' using errcode='42501'; end if;
  if nullif(btrim(p_description),'') is null then raise exception 'Description required' using errcode='23514'; end if;
  locked := t.status='settled' or exists(select 1 from public.account_movements
    where user_id=u and origin_type='income_receipt' and origin_id=t.id);
  if locked then
    if row(p_category_id,p_amount,p_transaction_date,p_due_date)
      is distinct from row(t.category_id,t.amount,t.transaction_date,t.due_date) then
      raise exception 'Income financial fields locked by history' using errcode='23514';
    end if;
    update public.transactions set description=btrim(p_description),notes=p_notes where id=t.id;
    return t.id;
  end if;
  if p_amount is null or p_amount <= 0 or p_amount >= 1000000000000
    or p_amount <> round(p_amount,2) or p_transaction_date is null then
    raise exception 'Invalid income edit' using errcode='23514';
  end if;
  if p_category_id is distinct from t.category_id and not exists(
    select 1 from public.categories where id=p_category_id and user_id=u and type='income' and active) then
    raise exception 'Active income category required' using errcode='23514';
  end if;
  update public.transactions set description=btrim(p_description),category_id=p_category_id,
    amount=p_amount,transaction_date=p_transaction_date,due_date=p_due_date,
    notes=p_notes where id=t.id;
  return t.id;
end;
$$;

revoke all on function public.create_received_income(text,uuid,numeric,date,date,text,uuid,date),
  public.create_income_recurrence(text,uuid,numeric,public.recurrence_frequency,integer,date,date,integer,uuid,text,date),
  public.update_income(uuid,text,uuid,numeric,date,date,text)
  from public,anon;
grant execute on function public.create_received_income(text,uuid,numeric,date,date,text,uuid,date),
  public.create_income_recurrence(text,uuid,numeric,public.recurrence_frequency,integer,date,date,integer,uuid,text,date),
  public.update_income(uuid,text,uuid,numeric,date,date,text)
  to authenticated;
