-- All financial RPCs authenticate explicitly, serialize work for one owner,
-- and execute atomically. Fixed search_path prevents object shadowing.
create function private.require_user() returns uuid
language plpgsql set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text, 0));
  return u;
end;
$$;

create function private.require_account(p_user_id uuid, p_account_id uuid, p_date date) returns void
language plpgsql set search_path = '' as $$
begin
  if p_date is null or not exists(select 1 from public.accounts
    where id = p_account_id and user_id = p_user_id and active and initial_balance_date <= p_date) then
    raise exception 'Active account and valid movement date required' using errcode = '23514';
  end if;
  perform 1 from public.accounts where id = p_account_id and user_id = p_user_id for update;
end;
$$;

create function public.settle_transaction(
  p_transaction_id uuid, p_account_id uuid, p_payment_method public.payment_method, p_settled_at date
) returns uuid language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); t public.transactions; m public.account_movements; mid uuid;
begin
  select * into t from public.transactions where id = p_transaction_id and user_id = u for update;
  if not found then raise exception 'Transaction not found' using errcode = '42501'; end if;
  if t.planned_payment_method = 'credit_card' or p_payment_method is null or p_payment_method = 'credit_card' then
    raise exception 'Credit card purchases are paid through their invoice' using errcode = '23514';
  end if;
  if t.status = 'settled' then
    select * into m from public.account_movements x where x.user_id = u and x.origin_id = t.id
      and x.origin_type in ('expense_payment','income_receipt')
      and not exists(select 1 from public.account_movements r where r.reversal_of_movement_id = x.id);
    if m.id is null or m.account_id is distinct from p_account_id or m.movement_date is distinct from p_settled_at
      or t.actual_payment_method is distinct from p_payment_method then
      raise exception 'Transaction already settled with different payment details' using errcode = '23514';
    end if;
    return m.id;
  end if;
  perform private.require_account(u,p_account_id,p_settled_at);
  update public.transactions set status = 'settled', settled_at = p_settled_at,
    actual_payment_method = p_payment_method, account_id = p_account_id where id = t.id;
  insert into public.account_movements(user_id,account_id,type,amount,movement_date,origin_type,origin_id,description)
  values(u,p_account_id,case when t.type = 'expense' then 'out'::public.movement_type else 'in'::public.movement_type end,
    t.amount,p_settled_at,case when t.type = 'expense' then 'expense_payment'::public.movement_origin_type
    else 'income_receipt'::public.movement_origin_type end,t.id,t.description) returning id into mid;
  return mid;
end;
$$;

create function public.close_invoice(p_invoice_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); inv public.credit_card_invoices;
begin
  select * into inv from public.credit_card_invoices where id = p_invoice_id and user_id = u for update;
  if not found then raise exception 'Invoice not found' using errcode = '42501'; end if;
  if inv.status = 'open' then update public.credit_card_invoices set status = 'closed' where id = inv.id; end if;
end;
$$;

create function public.pay_invoice(p_invoice_id uuid,p_account_id uuid,p_paid_at date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); inv public.credit_card_invoices; m public.account_movements; total numeric; mid uuid;
begin
  select * into inv from public.credit_card_invoices where id = p_invoice_id and user_id = u for update;
  if not found then raise exception 'Invoice not found' using errcode = '42501'; end if;
  if inv.status = 'paid' then
    select * into m from public.account_movements x where x.user_id = u and x.origin_id = inv.id
      and x.origin_type = 'credit_card_payment'
      and not exists(select 1 from public.account_movements r where r.reversal_of_movement_id = x.id);
    if m.id is null or m.account_id is distinct from p_account_id or m.movement_date is distinct from p_paid_at then
      raise exception 'Invoice already paid with different details' using errcode = '23514';
    end if;
    return m.id;
  end if;
  perform private.require_account(u,p_account_id,p_paid_at);
  select coalesce(sum(amount),0) into total from public.transactions where credit_card_invoice_id = inv.id and user_id = u;
  if total <= 0 then raise exception 'Cannot pay an empty invoice' using errcode = '23514'; end if;
  update public.credit_card_invoices set status = 'paid',paid_at = p_paid_at,payment_account_id = p_account_id where id = inv.id;
  insert into public.account_movements(user_id,account_id,type,amount,movement_date,origin_type,origin_id,description)
  values(u,p_account_id,'out',total,p_paid_at,'credit_card_payment',inv.id,'Pagamento de fatura ' || inv.reference_month)
  returning id into mid;
  return mid;
end;
$$;

create function public.reverse_movement(p_movement_id uuid,p_reversed_at date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); m public.account_movements; rid uuid;
begin
  select * into m from public.account_movements where id = p_movement_id and user_id = u for update;
  if not found then raise exception 'Movement not found' using errcode = '42501'; end if;
  if m.origin_type not in ('expense_payment','income_receipt','credit_card_payment') then
    raise exception 'Only transaction and invoice payments can be reversed by this RPC' using errcode = '23514';
  end if;
  select id into rid from public.account_movements where reversal_of_movement_id = m.id and user_id = u;
  if found then return rid; end if;
  if p_reversed_at is null or p_reversed_at < m.movement_date then
    raise exception 'Reversal date cannot precede original movement' using errcode = '23514';
  end if;
  -- Inactive accounts can receive reversals of their existing history.
  if m.origin_type = 'credit_card_payment' then
    update public.credit_card_invoices set status = 'closed',paid_at = null,payment_account_id = null
    where id = m.origin_id and user_id = u;
  else
    update public.transactions set status = 'pending',settled_at = null,actual_payment_method = null,account_id = null
    where id = m.origin_id and user_id = u;
  end if;
  insert into public.account_movements(user_id,account_id,type,amount,movement_date,origin_type,origin_id,reversal_of_movement_id,description)
  values(u,m.account_id,case when m.type = 'out' then 'in'::public.movement_type else 'out'::public.movement_type end,
    m.amount,p_reversed_at,'reversal',m.origin_id,m.id,'Estorno: ' || m.description) returning id into rid;
  return rid;
end;
$$;

create function public.transfer_between_accounts(p_from_account_id uuid,p_to_account_id uuid,
  p_amount numeric,p_movement_date date,p_description text,p_transfer_group_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); m public.account_movements;
begin
  if p_from_account_id is null or p_to_account_id is null or p_from_account_id = p_to_account_id
    or p_transfer_group_id is null or p_amount is null or p_amount <= 0
    or p_amount >= 1000000000000 or p_amount <> round(p_amount,2) or nullif(btrim(p_description),'') is null then
    raise exception 'Distinct accounts, positive amount in cents, description and idempotency key required' using errcode = '23514';
  end if;
  select * into m from public.account_movements where transfer_group_id = p_transfer_group_id and type = 'out';
  if found then
    if m.user_id <> u or m.account_id <> p_from_account_id or m.amount <> p_amount
      or m.movement_date is distinct from p_movement_date or m.description <> p_description
      or not exists(select 1 from public.account_movements where transfer_group_id = p_transfer_group_id
        and user_id = u and type = 'in' and account_id = p_to_account_id) then
      raise exception 'Transfer key already used with different details' using errcode = '23514';
    end if;
    return p_transfer_group_id;
  end if;
  perform private.require_account(u,p_from_account_id,p_movement_date);
  perform private.require_account(u,p_to_account_id,p_movement_date);
  insert into public.account_movements(user_id,account_id,type,amount,movement_date,origin_type,transfer_group_id,description)
  values(u,p_from_account_id,'out',p_amount,p_movement_date,'transfer',p_transfer_group_id,p_description),
    (u,p_to_account_id,'in',p_amount,p_movement_date,'transfer',p_transfer_group_id,p_description);
  return p_transfer_group_id;
end;
$$;

create function private.month_day(p_month date,p_day integer) returns date
language sql immutable strict set search_path = '' as $$
  select (date_trunc('month',p_month)::date + (least(p_day,
    extract(day from (date_trunc('month',p_month) + interval '1 month - 1 day')))::integer - 1))::date;
$$;

-- The reference month is the closing month. Purchases on closing day are
-- included; due day <= closing day means payment in the following month.
create function private.ensure_invoice(p_user_id uuid,p_credit_card_id uuid,p_date date) returns uuid
language plpgsql set search_path = '' as $$
declare c public.credit_cards; inv public.credit_card_invoices; ref date; closing date; due date;
begin
  select * into c from public.credit_cards where id = p_credit_card_id and user_id = p_user_id and active for update;
  if not found or p_date is null then raise exception 'Active credit card and purchase date required' using errcode = '23514'; end if;
  ref := date_trunc('month',p_date)::date;
  closing := private.month_day(ref,c.closing_day);
  if p_date > closing then ref := (ref + interval '1 month')::date; closing := private.month_day(ref,c.closing_day); end if;
  due := private.month_day(case when c.due_day <= c.closing_day then (ref + interval '1 month')::date else ref end,c.due_day);
  insert into public.credit_card_invoices(user_id,credit_card_id,reference_month,closing_date,due_date)
  values(p_user_id,c.id,ref,closing,due) on conflict (credit_card_id,reference_month) do nothing;
  select * into inv from public.credit_card_invoices where credit_card_id = c.id and reference_month = ref for update;
  if inv.status <> 'open' then raise exception 'The corresponding invoice is already closed or paid' using errcode = '23514'; end if;
  return inv.id;
end;
$$;

create function public.create_card_purchase(p_credit_card_id uuid,p_category_id uuid,p_description text,
  p_amount numeric,p_transaction_date date,p_installment_count integer default 1) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); gid uuid; invoice_id uuid; tid uuid; ids uuid[] := array[]::uuid[];
  part numeric; part_amount numeric; occurrence date;
begin
  if p_amount is null or p_amount <= 0 or p_amount >= 1000000000000 or p_amount <> round(p_amount,2)
    or p_installment_count is null or p_installment_count < 1 or p_installment_count > 600
    or p_transaction_date is null or nullif(btrim(p_description),'') is null then
    raise exception 'Valid amount in cents, description, date and 1..600 installments required' using errcode = '23514';
  end if;
  if not exists(select 1 from public.categories where id = p_category_id and user_id = u and type = 'expense' and active) then
    raise exception 'Active expense category required' using errcode = '23514';
  end if;
  part := trunc(p_amount / p_installment_count,2);
  if part <= 0 then raise exception 'Each installment must be at least one cent' using errcode = '23514'; end if;
  if p_installment_count > 1 then
    insert into public.installment_groups(user_id,description,original_amount,installment_count)
    values(u,p_description,p_amount,p_installment_count) returning id into gid;
  end if;
  -- Choose the first period once. Later parcels use consecutive closing months,
  -- even when clamping a 31st purchase date into February would change its window.
  invoice_id := private.ensure_invoice(u,p_credit_card_id,p_transaction_date);
  for i in 1..p_installment_count loop
    occurrence := (p_transaction_date + make_interval(months => i - 1))::date;
    if i > 1 then
      declare c public.credit_cards; first_ref date; ref date; closing date; due date; s public.invoice_status;
      begin
        select * into c from public.credit_cards where id = p_credit_card_id;
        select reference_month into first_ref from public.credit_card_invoices where id =
          (select credit_card_invoice_id from public.transactions where id = ids[1]);
        ref := (first_ref + make_interval(months => i - 1))::date;
        closing := private.month_day(ref,c.closing_day);
        due := private.month_day(case when c.due_day <= c.closing_day then (ref + interval '1 month')::date else ref end,c.due_day);
        insert into public.credit_card_invoices(user_id,credit_card_id,reference_month,closing_date,due_date)
        values(u,c.id,ref,closing,due) on conflict(credit_card_id,reference_month) do nothing;
        select id,status into invoice_id,s from public.credit_card_invoices where credit_card_id = c.id and reference_month = ref for update;
        if s <> 'open' then raise exception 'Installment invoice already closed or paid' using errcode = '23514'; end if;
      end;
    end if;
    part_amount := case when i = p_installment_count then p_amount - part * (p_installment_count - 1) else part end;
    insert into public.transactions(user_id,type,description,category_id,amount,transaction_date,due_date,planned_payment_method,
      credit_card_id,credit_card_invoice_id,installment_group_id,installment_number,installment_total)
    values(u,'expense',p_description,p_category_id,part_amount,occurrence,
      (select due_date from public.credit_card_invoices where id = invoice_id),'credit_card',p_credit_card_id,invoice_id,
      gid,case when gid is not null then i end,case when gid is not null then p_installment_count end)
    returning id into tid;
    ids := array_append(ids,tid);
  end loop;
  return ids;
end;
$$;

create function public.generate_recurrences(p_through_date date) returns integer
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
        -- Bounded batches count new rows only. Repeating the call safely resumes
        -- after the previous batch, even with more than 10000 historical rows.
        if created >= 10000 then return created; end if;
        inv := null;
        if r.planned_payment_method = 'credit_card' then inv := private.ensure_invoice(u,r.credit_card_id,occurrence); end if;
        insert into public.transactions(user_id,type,description,category_id,amount,transaction_date,due_date,
          planned_payment_method,account_id,credit_card_id,credit_card_invoice_id,recurrence_rule_id)
        values(u,r.type,r.description,r.category_id,r.amount,occurrence,
          coalesce((select due_date from public.credit_card_invoices where id = inv),occurrence),
          r.planned_payment_method,r.account_id,r.credit_card_id,inv,r.id);
        created := created + 1;
      end if;
      n := n + 1;
    end loop;
  end loop;
  return created;
end;
$$;

revoke all on all functions in schema private from public,anon,authenticated;
revoke all on function public.settle_transaction(uuid,uuid,public.payment_method,date),
  public.close_invoice(uuid),public.pay_invoice(uuid,uuid,date),public.reverse_movement(uuid,date),
  public.transfer_between_accounts(uuid,uuid,numeric,date,text,uuid),
  public.create_card_purchase(uuid,uuid,text,numeric,date,integer),public.generate_recurrences(date)
  from public,anon;
grant execute on function public.settle_transaction(uuid,uuid,public.payment_method,date),
  public.close_invoice(uuid),public.pay_invoice(uuid,uuid,date),public.reverse_movement(uuid,date),
  public.transfer_between_accounts(uuid,uuid,numeric,date,text,uuid),
  public.create_card_purchase(uuid,uuid,text,numeric,date,integer),public.generate_recurrences(date)
  to authenticated;
