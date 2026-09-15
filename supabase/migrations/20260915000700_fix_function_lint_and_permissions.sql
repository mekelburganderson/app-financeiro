-- Keep the remote function aligned with the lint-clean definition in 005.
create or replace function public.create_card_purchase(p_credit_card_id uuid,p_category_id uuid,p_description text,
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

revoke all on function public.create_card_purchase(uuid,uuid,text,numeric,date,integer) from public,anon;
grant execute on function public.create_card_purchase(uuid,uuid,text,numeric,date,integer) to authenticated;

-- This function is provisioned outside this application's migrations on hosted
-- Supabase projects and is not part of the client API.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;
