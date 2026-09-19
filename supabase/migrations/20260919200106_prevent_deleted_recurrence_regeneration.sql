-- A removed recurring occurrence is an explicit exception to its recurrence
-- rule. Keep the exception outside exposed schemas and mutate it only through
-- the authenticated deletion RPC.
create table private.recurrence_exceptions (
  user_id uuid not null references auth.users (id) on delete cascade,
  recurrence_rule_id uuid not null,
  occurrence_date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, recurrence_rule_id, occurrence_date),
  constraint recurrence_exceptions_rule_fkey
    foreign key (user_id, recurrence_rule_id)
    references public.recurrence_rules (user_id, id) on delete cascade
);

revoke all on table private.recurrence_exceptions from public, anon, authenticated;

create function public.delete_expense(p_expense_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.require_user();
  t public.transactions;
begin
  select * into t from public.transactions
  where id = p_expense_id and user_id = u and type = 'expense'
  for update;

  if not found then
    raise exception 'Expense not found' using errcode = '42501';
  end if;

  if t.recurrence_rule_id is not null then
    insert into private.recurrence_exceptions(user_id, recurrence_rule_id, occurrence_date)
    values(u, t.recurrence_rule_id, t.transaction_date)
    on conflict do nothing;
  end if;

  delete from public.transactions where id = t.id and user_id = u;
end;
$$;

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
      if not exists(select 1 from public.transactions where recurrence_rule_id = r.id and transaction_date = occurrence)
        and not exists(select 1 from private.recurrence_exceptions e
          where e.user_id = u and e.recurrence_rule_id = r.id and e.occurrence_date = occurrence) then
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

revoke all on function public.delete_expense(uuid) from public, anon;
grant execute on function public.delete_expense(uuid) to authenticated;
