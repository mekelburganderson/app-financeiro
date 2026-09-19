create function public.reverse_transfer_group(p_transfer_group_id uuid, p_reversed_at date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.require_user();
  outgoing public.account_movements;
  incoming public.account_movements;
begin
  if p_transfer_group_id is null then
    raise exception 'Transfer not found' using errcode = '42501';
  end if;

  select * into outgoing from public.account_movements
  where user_id = u and transfer_group_id = p_transfer_group_id
    and origin_type = 'transfer' and type = 'out'
  for update;
  select * into incoming from public.account_movements
  where user_id = u and transfer_group_id = p_transfer_group_id
    and origin_type = 'transfer' and type = 'in'
  for update;

  if outgoing.id is null or incoming.id is null
    or outgoing.amount <> incoming.amount
    or outgoing.movement_date <> incoming.movement_date then
    raise exception 'Transfer not found or inconsistent' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.account_movements
    where user_id = u and reversal_of_movement_id in (outgoing.id, incoming.id)
  ) then
    raise exception 'Transfer already reversed' using errcode = '23514';
  end if;
  if p_reversed_at is null or p_reversed_at < outgoing.movement_date then
    raise exception 'Reversal date cannot precede original transfer' using errcode = '23514';
  end if;

  insert into public.account_movements(
    user_id, account_id, type, amount, movement_date, origin_type, origin_id,
    transfer_group_id, reversal_of_movement_id, description
  ) values
    (u, outgoing.account_id, 'in', outgoing.amount, p_reversed_at, 'reversal',
      p_transfer_group_id, p_transfer_group_id, outgoing.id, 'Estorno: ' || outgoing.description),
    (u, incoming.account_id, 'out', incoming.amount, p_reversed_at, 'reversal',
      p_transfer_group_id, p_transfer_group_id, incoming.id, 'Estorno: ' || incoming.description);

  return p_transfer_group_id;
end;
$$;

revoke all on function public.reverse_transfer_group(uuid,date) from public,anon;
grant execute on function public.reverse_transfer_group(uuid,date) to authenticated;
