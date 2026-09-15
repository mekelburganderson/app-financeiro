import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { createTestDatabase } from './db-harness.mjs';

// Runs real PostgreSQL SQL, constraints, triggers, functions, and RLS in memory.
// Supabase Auth, HTTP/JWT validation, PostgREST, and true concurrent sessions
// still require a local Supabase stack or a separate integration environment.
const db = await createTestDatabase();
after(async () => db.close());

async function rows(sql, params = []) {
  return (await db.query(sql, params)).rows;
}

async function one(sql, params = []) {
  const result = await rows(sql, params);
  assert.equal(result.length, 1, `Expected one row: ${sql}`);
  return result[0];
}

async function scalar(sql, params = []) {
  return Object.values(await one(sql, params))[0];
}

async function asUser(userId, callback) {
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  try {
    return await callback();
  } finally {
    await db.exec('reset role');
    await db.exec("select set_config('request.jwt.claim.sub', '', false)");
  }
}

async function mustReject(sql, params = []) {
  await assert.rejects(() => db.query(sql, params));
}

async function fixture() {
  const userId = randomUUID();
  await db.query('insert into auth.users(id, raw_user_meta_data) values ($1, $2)', [
    userId,
    { full_name: 'Pessoa de teste', avatar_url: 'https://example.test/avatar.png' },
  ]);
  return asUser(userId, async () => ({
    userId,
    accountId: await scalar(`insert into public.accounts(user_id,name,type,initial_balance,initial_balance_date)
      values ($1,'Conta principal','checking',1000,'2020-01-01') returning id`, [userId]),
    secondAccountId: await scalar(`insert into public.accounts(user_id,name,type,initial_balance,initial_balance_date)
      values ($1,'Reserva','savings',-50,'2020-01-01') returning id`, [userId]),
    expenseCategoryId: await scalar(`insert into public.categories(user_id,name,type)
      values ($1,'Alimentação','expense') returning id`, [userId]),
    incomeCategoryId: await scalar(`insert into public.categories(user_id,name,type)
      values ($1,'Salário','income') returning id`, [userId]),
    cardId: await scalar(`insert into public.credit_cards(user_id,name,limit_amount,closing_day,due_day)
      values ($1,'Cartão principal',5000,31,5) returning id`, [userId]),
  }));
}

async function transaction(f, overrides = {}) {
  const values = {
    type: 'expense', description: 'Lançamento de teste', amount: 125.5,
    transaction_date: '2026-01-10', category_id: f.expenseCategoryId,
    ...overrides, user_id: f.userId,
  };
  const columns = Object.keys(values);
  return scalar(`insert into public.transactions (${columns.join(',')})
    values (${columns.map((_, i) => `$${i + 1}`).join(',')}) returning id`, Object.values(values));
}

async function purchase(f, amount, date, installments = 1, cardId = f.cardId) {
  return scalar('select public.create_card_purchase($1,$2,$3,$4,$5,$6)', [
    cardId, f.expenseCategoryId, 'Compra de teste', amount, date, installments,
  ]);
}

test('schema: all public tables use RLS; profile trigger copies Auth metadata', async () => {
  const f = await fixture();
  const tables = await rows(`select c.relname, c.relrowsecurity from pg_class c
    join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'`);
  assert.equal(tables.length, 9);
  assert.ok(tables.every((table) => table.relrowsecurity), 'Every public table must enable RLS');
  await asUser(f.userId, async () => {
    assert.deepEqual(await one('select full_name,avatar_url from public.profiles'), {
      full_name: 'Pessoa de teste', avatar_url: 'https://example.test/avatar.png',
    });
    await mustReject(`insert into public.categories(user_id,name,type) values ($1,'alimentação','expense')`, [f.userId]);
    await mustReject(`insert into public.accounts(user_id,name,type,initial_balance_date)
      values ($1,'   ','cash','2026-01-01')`, [f.userId]);
    await mustReject(`update public.accounts set user_id=$1 where id=$2`, [randomUUID(), f.accountId]);
    await mustReject('update public.accounts set id=$1 where id=$2', [randomUUID(), f.accountId]);
  });
});

test('RLS isolates two users, rejects foreign ownership, and protects both aggregate views', async () => {
  const a = await fixture();
  const b = await fixture();
  await asUser(b.userId, async () => {
    await transaction(b);
    await purchase(b, 25, '2026-01-10');
  });
  await asUser(a.userId, async () => {
    await transaction(a);
    await purchase(a, 50, '2026-01-10');
    for (const table of ['accounts', 'categories', 'credit_cards', 'credit_card_invoices', 'transactions']) {
      const visible = await rows(`select user_id from public.${table}`);
      assert.ok(visible.length > 0);
      assert.ok(visible.every((row) => row.user_id === a.userId), `${table} exposed another user`);
      assert.equal((await rows(`update public.${table} set user_id=user_id where user_id=$1 returning id`, [b.userId])).length, 0);
      assert.equal((await rows(`delete from public.${table} where user_id=$1 returning id`, [b.userId])).length, 0);
    }
    assert.equal(Number(await scalar('select count(*) from public.profiles')), 1);
    assert.equal(Number(await scalar('select count(*) from public.account_balances')), 2);
    assert.equal(Number(await scalar('select count(*) from public.invoice_totals')), 1);
    await mustReject(`insert into public.categories(user_id,name,type) values ($1,'Intrusão','expense')`, [b.userId]);
    await mustReject(`insert into public.transactions(user_id,type,description,category_id,amount,transaction_date)
      values ($1,'expense','Categoria alheia',$2,10,'2026-01-01')`, [a.userId, b.expenseCategoryId]);
    await mustReject(`insert into public.transactions(user_id,type,description,category_id,account_id,amount,transaction_date)
      values ($1,'expense','Conta alheia',$2,$3,10,'2026-01-01')`, [a.userId, a.expenseCategoryId, b.accountId]);
    await mustReject(`insert into public.credit_card_invoices(user_id,credit_card_id,reference_month,closing_date,due_date)
      values ($1,$2,'2026-02-01','2026-02-28','2026-03-05')`, [a.userId, b.cardId]);
    await mustReject('select public.create_card_purchase($1,$2,$3,$4,$5,$6)', [b.cardId, a.expenseCategoryId, 'Cartão alheio', 10, '2026-01-01', 1]);
  });
  await db.exec('set role anon');
  try {
    for (const relation of ['profiles', 'accounts', 'categories', 'credit_cards', 'credit_card_invoices',
      'installment_groups', 'recurrence_rules', 'transactions', 'account_movements', 'account_balances', 'invoice_totals']) {
      try {
        assert.equal((await rows(`select * from public.${relation}`)).length, 0, `anon read ${relation}`);
      } catch (error) {
        if (error.code !== '42501') throw error;
      }
    }
    await mustReject('select public.generate_recurrences($1)', ['2026-01-01']);
  } finally {
    await db.exec('reset role');
  }
});

test('composite references and domain checks reject mismatched ownership, types, and incomplete card/installment data', async () => {
  const a = await fixture();
  const b = await fixture();
  const foreign = await asUser(b.userId, async () => {
    const purchaseIds = await purchase(b, 40, '2026-01-01', 2);
    const cardTransaction = await one('select credit_card_invoice_id,installment_group_id from public.transactions where id=$1', [purchaseIds[0]]);
    const recurrenceId = await scalar(`insert into public.recurrence_rules(user_id,type,description,category_id,amount,frequency,start_date)
      values ($1,'expense','Regra alheia',$2,10,'monthly','2026-01-01') returning id`, [b.userId, b.expenseCategoryId]);
    return { ...cardTransaction, recurrenceId };
  });
  await asUser(a.userId, async () => {
    const purchaseIds = await purchase(a, 40, '2026-01-01', 2);
    const own = await one('select credit_card_invoice_id,installment_group_id from public.transactions where id=$1', [purchaseIds[0]]);
    const invalidTransactions = [
      { category_id: a.incomeCategoryId },
      { recurrence_rule_id: foreign.recurrenceId },
      { planned_payment_method: 'credit_card', credit_card_id: a.cardId, credit_card_invoice_id: foreign.credit_card_invoice_id },
      { planned_payment_method: 'credit_card', credit_card_id: b.cardId, credit_card_invoice_id: foreign.credit_card_invoice_id },
      { credit_card_id: a.cardId, credit_card_invoice_id: own.credit_card_invoice_id },
      { planned_payment_method: 'credit_card', credit_card_id: a.cardId, credit_card_invoice_id: own.credit_card_invoice_id, account_id: a.accountId },
      { installment_group_id: foreign.installment_group_id, installment_number: 1, installment_total: 2 },
      { installment_group_id: own.installment_group_id, installment_number: null, installment_total: 2 },
      { installment_number: 1, installment_total: 2 },
      { amount: 'NaN' },
      { amount: 0 },
      { status: 'settled', settled_at: '2026-01-01', actual_payment_method: 'pix', account_id: a.accountId },
    ];
    for (const override of invalidTransactions) {
      await assert.rejects(() => transaction(a, override), JSON.stringify(override));
    }
    await mustReject('update public.credit_cards set limit_amount=\'NaN\' where id=$1', [a.cardId]);
    await mustReject('update public.accounts set initial_balance=\'NaN\' where id=$1', [a.accountId]);
    await mustReject('update public.credit_cards set closing_day=32 where id=$1', [a.cardId]);
    await mustReject('update public.credit_cards set due_day=0 where id=$1', [a.cardId]);
    await mustReject('update public.installment_groups set original_amount=41 where id=$1', [own.installment_group_id]);
    await mustReject('update public.transactions set amount=1 where id=$1', [purchaseIds[0]]);
    await mustReject('delete from public.transactions where id=$1', [purchaseIds[0]]);
    await mustReject(`insert into public.transactions(user_id,type,description,category_id,amount,transaction_date,
      planned_payment_method,credit_card_id,credit_card_invoice_id,installment_group_id,installment_number,installment_total)
      values ($1,'expense','Parcela direta',$2,20,'2026-01-01','credit_card',$3,$4,$5,2,2)`,
    [a.userId, a.expenseCategoryId, a.cardId, own.credit_card_invoice_id, own.installment_group_id]);
    await mustReject(`update public.credit_card_invoices set paid_at='2026-01-01' where id=$1`, [own.credit_card_invoice_id]);
    await mustReject(`insert into public.credit_card_invoices(user_id,credit_card_id,reference_month,closing_date,due_date)
      values ($1,$2,'2027-01-01','2027-01-30','2027-02-05')`, [a.userId, a.cardId]);
    await mustReject('update public.credit_cards set closing_day=15 where id=$1', [a.cardId]);
    await mustReject(`insert into public.recurrence_rules(user_id,type,description,category_id,amount,frequency,start_date,credit_card_id)
      values ($1,'expense','Cartão sem método',$2,10,'monthly','2026-01-01',$3)`, [a.userId, a.expenseCategoryId, a.cardId]);
  });
});

test('settlement and reversal are idempotent, preserve the ledger, and permit a later repayment', async () => {
  const f = await fixture();
  await asUser(f.userId, async () => {
    const expenseId = await transaction(f);
    const args = [expenseId, f.accountId, 'pix', '2026-01-10'];
    const movementId = await scalar('select public.settle_transaction($1,$2,$3,$4)', args);
    assert.equal(await scalar('select public.settle_transaction($1,$2,$3,$4)', args), movementId);
    await mustReject('select public.settle_transaction($1,$2,$3,$4)', [expenseId, f.secondAccountId, 'pix', '2026-01-10']);
    assert.deepEqual(await one('select type,origin_type,amount::text,origin_id from public.account_movements where id=$1', [movementId]), {
      type: 'out', origin_type: 'expense_payment', amount: '125.50', origin_id: expenseId,
    });
    assert.equal(await scalar('select current_balance::text from public.account_balances where account_id=$1', [f.accountId]), '874.50');
    await mustReject('update public.transactions set amount=999 where id=$1', [expenseId]);
    await mustReject('delete from public.transactions where id=$1', [expenseId]);
    await mustReject('update public.transactions set status=\'pending\',settled_at=null,actual_payment_method=null,account_id=null where id=$1', [expenseId]);
    await mustReject('update public.account_movements set amount=999 where id=$1', [movementId]);
    await mustReject('delete from public.account_movements where id=$1', [movementId]);
    await mustReject(`insert into public.account_movements(user_id,account_id,type,amount,movement_date,origin_type,origin_id,description)
      values ($1,$2,'out',125.5,'2026-01-10','expense_payment',$3,'Duplicata direta')`, [f.userId, f.accountId, expenseId]);
    const reversalId = await scalar('select public.reverse_movement($1,$2)', [movementId, '2026-01-11']);
    assert.equal(await scalar('select public.reverse_movement($1,$2)', [movementId, '2026-01-11']), reversalId);
    assert.deepEqual(await one(`select status,settled_at,actual_payment_method,account_id from public.transactions where id=$1`, [expenseId]), {
      status: 'pending', settled_at: null, actual_payment_method: null, account_id: null,
    });
    assert.equal(await scalar('select current_balance::text from public.account_balances where account_id=$1', [f.accountId]), '1000.00');
    assert.equal(Number(await scalar('select count(*) from public.account_movements')), 2);
    const secondPayment = await scalar('select public.settle_transaction($1,$2,$3,$4)', [expenseId, f.accountId, 'cash', '2026-01-12']);
    assert.notEqual(secondPayment, movementId);
    assert.equal(Number(await scalar('select count(*) from public.account_movements')), 3);
    const incomeId = await transaction(f, { type: 'income', category_id: f.incomeCategoryId, amount: 500 });
    const receiptId = await scalar('select public.settle_transaction($1,$2,$3,$4)', [incomeId, f.accountId, 'bank_transfer', '2026-01-12']);
    assert.deepEqual(await one('select type,origin_type from public.account_movements where id=$1', [receiptId]), { type: 'in', origin_type: 'income_receipt' });
    assert.equal(await scalar('select current_balance::text from public.account_balances where account_id=$1', [f.accountId]), '1374.50');
  });
});

test('installments sum exactly, clamp closing days, and use the next invoice after closing', async () => {
  const f = await fixture();
  await asUser(f.userId, async () => {
    const ids = await purchase(f, 100, '2024-02-29', 3);
    assert.equal(ids.length, 3);
    const installments = await rows(`select t.amount::text,t.installment_number,t.installment_total,
      i.reference_month::text,i.closing_date::text,i.due_date::text
      from public.transactions t join public.credit_card_invoices i on i.id=t.credit_card_invoice_id
      where t.id=any($1::uuid[]) order by t.installment_number`, [ids]);
    assert.deepEqual(installments, [
      { amount: '33.33', installment_number: 1, installment_total: 3, reference_month: '2024-02-01', closing_date: '2024-02-29', due_date: '2024-03-05' },
      { amount: '33.33', installment_number: 2, installment_total: 3, reference_month: '2024-03-01', closing_date: '2024-03-31', due_date: '2024-04-05' },
      { amount: '33.34', installment_number: 3, installment_total: 3, reference_month: '2024-04-01', closing_date: '2024-04-30', due_date: '2024-05-05' },
    ]);
    assert.equal(await scalar('select sum(amount)::text from public.transactions where id=any($1::uuid[])', [ids]), '100.00');
    assert.equal(Number(await scalar('select count(*) from public.account_movements')), 0);
    assert.equal(Number(await scalar('select count(*) from public.installment_groups')), 1);
    await purchase(f, 10, '2025-02-28');
    assert.equal(await scalar(`select closing_date::text from public.credit_card_invoices where reference_month='2025-02-01'`), '2025-02-28');
    const earlyCardId = await scalar(`insert into public.credit_cards(user_id,name,limit_amount,closing_day,due_day)
      values ($1,'Fechamento dia 10',5000,10,31) returning id`, [f.userId]);
    const onClosing = await purchase(f, 10, '2026-02-10', 1, earlyCardId);
    const afterClosing = await purchase(f, 10, '2026-02-11', 1, earlyCardId);
    assert.deepEqual(await one(`select i.reference_month::text,i.due_date::text from public.transactions t
      join public.credit_card_invoices i on i.id=t.credit_card_invoice_id where t.id=$1`, [onClosing[0]]), {
      reference_month: '2026-02-01', due_date: '2026-02-28',
    });
    assert.equal(await scalar(`select i.reference_month::text from public.transactions t
      join public.credit_card_invoices i on i.id=t.credit_card_invoice_id where t.id=$1`, [afterClosing[0]]), '2026-03-01');
  });
});

test('closed invoices freeze financial items; invoice payment creates no additional expense', async () => {
  const f = await fixture();
  await asUser(f.userId, async () => {
    const ids = await purchase(f, 300, '2026-01-05');
    const invoiceId = await scalar('select credit_card_invoice_id from public.transactions where id=$1', [ids[0]]);
    await scalar('select public.close_invoice($1)', [invoiceId]);
    await scalar('select public.close_invoice($1)', [invoiceId]);
    for (const sql of [
      'update public.transactions set amount=301 where id=$1',
      "update public.transactions set transaction_date='2026-02-01' where id=$1",
      'update public.transactions set credit_card_invoice_id=null where id=$1',
      'delete from public.transactions where id=$1',
    ]) await mustReject(sql, [ids[0]]);
    await mustReject(`update public.credit_card_invoices set status='open' where id=$1`, [invoiceId]);
    await mustReject('delete from public.credit_card_invoices where id=$1', [invoiceId]);
    await mustReject('select public.settle_transaction($1,$2,$3,$4)', [ids[0], f.accountId, 'pix', '2026-02-05']);
    const countBefore = Number(await scalar('select count(*) from public.transactions'));
    const movementId = await scalar('select public.pay_invoice($1,$2,$3)', [invoiceId, f.accountId, '2026-02-05']);
    assert.equal(await scalar('select public.pay_invoice($1,$2,$3)', [invoiceId, f.accountId, '2026-02-05']), movementId);
    await mustReject('select public.pay_invoice($1,$2,$3)', [invoiceId, f.secondAccountId, '2026-02-05']);
    assert.equal(Number(await scalar('select count(*) from public.transactions')), countBefore);
    assert.deepEqual(await one('select type,origin_type,amount::text from public.account_movements where id=$1', [movementId]), {
      type: 'out', origin_type: 'credit_card_payment', amount: '300.00',
    });
    assert.equal(await scalar('select current_balance::text from public.account_balances where account_id=$1', [f.accountId]), '700.00');
    const reversalId = await scalar('select public.reverse_movement($1,$2)', [movementId, '2026-02-06']);
    assert.equal(await scalar('select public.reverse_movement($1,$2)', [movementId, '2026-02-06']), reversalId);
    assert.deepEqual(await one('select status,paid_at,payment_account_id from public.credit_card_invoices where id=$1', [invoiceId]), {
      status: 'closed', paid_at: null, payment_account_id: null,
    });
    assert.notEqual(await scalar('select public.pay_invoice($1,$2,$3)', [invoiceId, f.accountId, '2026-02-07']), movementId);
    assert.equal(Number(await scalar('select count(*) from public.transactions')), countBefore);
    assert.equal(Number(await scalar('select count(*) from public.account_movements')), 3);
  });
});

test('transfers are atomic balanced ledger pairs, idempotent, and never income or expenses', async () => {
  const f = await fixture();
  const other = await fixture();
  await asUser(f.userId, async () => {
    const groupId = randomUUID();
    const args = [f.accountId, f.secondAccountId, 75.25, '2026-01-10', 'Transferência de teste', groupId];
    assert.equal(await scalar('select public.transfer_between_accounts($1,$2,$3,$4,$5,$6)', args), groupId);
    assert.equal(await scalar('select public.transfer_between_accounts($1,$2,$3,$4,$5,$6)', args), groupId);
    await mustReject('select public.transfer_between_accounts($1,$2,$3,$4,$5,$6)', [f.accountId, f.secondAccountId, 99, '2026-01-10', 'Transferência de teste', groupId]);
    assert.equal(Number(await scalar('select count(*) from public.transactions')), 0);
    assert.equal(Number(await scalar('select count(*) from public.account_movements')), 2);
    assert.equal(Number(await scalar(`select sum(case type when 'in' then amount else -amount end)
      from public.account_movements where transfer_group_id=$1`, [groupId])), 0);
    assert.equal(await scalar('select current_balance::text from public.account_balances where account_id=$1', [f.accountId]), '924.75');
    assert.equal(await scalar('select current_balance::text from public.account_balances where account_id=$1', [f.secondAccountId]), '25.25');
    await mustReject('select public.transfer_between_accounts($1,$2,$3,$4,$5,$6)', [f.accountId, other.accountId, 5, '2026-01-10', 'Conta alheia', randomUUID()]);
    await mustReject('select public.transfer_between_accounts($1,$2,$3,$4,$5,$6)', [f.accountId, f.accountId, 5, '2026-01-10', 'Mesma conta', randomUUID()]);
    await mustReject('select public.transfer_between_accounts($1,$2,$3,$4,$5,$6)', [f.accountId, f.secondAccountId, 0, '2026-01-10', 'Valor zero', randomUUID()]);
    const movementId = await scalar('select id from public.account_movements where transfer_group_id=$1 and type=\'out\'', [groupId]);
    await mustReject('select public.reverse_movement($1,$2)', [movementId, '2026-01-11']);
    assert.equal(Number(await scalar('select count(*) from public.account_movements')), 2);
  });
});

test('financial RPCs reject foreign records and roll back a purchase if a later installment invoice is closed', async () => {
  const a = await fixture();
  const b = await fixture();
  const foreign = await asUser(b.userId, async () => {
    const transactionId = await transaction(b);
    const movementId = await scalar('select public.settle_transaction($1,$2,$3,$4)', [transactionId, b.accountId, 'pix', '2026-01-10']);
    const ids = await purchase(b, 50, '2026-01-01');
    const invoiceId = await scalar('select credit_card_invoice_id from public.transactions where id=$1', [ids[0]]);
    return { transactionId, movementId, invoiceId };
  });
  await asUser(a.userId, async () => {
    await mustReject('select public.settle_transaction($1,$2,$3,$4)', [foreign.transactionId, a.accountId, 'pix', '2026-01-10']);
    await mustReject('select public.reverse_movement($1,$2)', [foreign.movementId, '2026-01-11']);
    await mustReject('select public.close_invoice($1)', [foreign.invoiceId]);
    await mustReject('select public.pay_invoice($1,$2,$3)', [foreign.invoiceId, a.accountId, '2026-02-05']);
    const pendingId = await transaction(a);
    await mustReject('select public.settle_transaction($1,$2,$3,$4)', [pendingId, b.accountId, 'pix', '2026-01-10']);
    await mustReject('select public.settle_transaction($1,$2,$3,$4)', [pendingId, a.accountId, 'pix', '2019-12-31']);
    assert.equal(await scalar('select status from public.transactions where id=$1', [pendingId]), 'pending');
    const ids = await purchase(a, 50, '2026-02-01');
    const invoiceId = await scalar('select credit_card_invoice_id from public.transactions where id=$1', [ids[0]]);
    await scalar('select public.close_invoice($1)', [invoiceId]);
    await assert.rejects(() => purchase(a, 90, '2026-01-01', 3));
    assert.equal(Number(await scalar('select count(*) from public.transactions')), 2);
    assert.equal(Number(await scalar('select count(*) from public.credit_card_invoices')), 1);
    assert.equal(Number(await scalar('select count(*) from public.installment_groups')), 0);
    assert.equal(Number(await scalar('select count(*) from public.account_movements')), 0);
  });
});

test('recurrences respect calendar anchors, frequency intervals, end dates, and occurrence limits', async () => {
  const f = await fixture();
  await asUser(f.userId, async () => {
    async function rule(frequency, interval, start, end, max) {
      return scalar(`insert into public.recurrence_rules(user_id,type,description,category_id,amount,
        frequency,interval_count,start_date,end_date,max_occurrences)
        values ($1,'expense',$2,$3,15,$4,$5,$6,$7,$8) returning id`, [
        f.userId, `Recorrência ${frequency}`, f.expenseCategoryId, frequency, interval, start, end, max,
      ]);
    }
    const monthly = await rule('monthly', 1, '2024-01-31', '2024-04-30', 5);
    const yearly = await rule('yearly', 1, '2024-02-29', null, 3);
    const weekly = await rule('weekly', 2, '2024-01-01', '2024-02-15', null);
    const daily = await rule('daily', 2, '2024-01-01', '2024-01-10', 3);
    assert.equal(Number(await scalar('select public.generate_recurrences($1)', ['2026-12-31'])), 14);
    assert.equal(Number(await scalar('select public.generate_recurrences($1)', ['2026-12-31'])), 0);
    const dates = async (ruleId) => (await rows(`select transaction_date::text from public.transactions
      where recurrence_rule_id=$1 order by transaction_date`, [ruleId])).map((row) => row.transaction_date);
    assert.deepEqual(await dates(monthly), ['2024-01-31', '2024-02-29', '2024-03-31', '2024-04-30']);
    assert.deepEqual(await dates(yearly), ['2024-02-29', '2025-02-28', '2026-02-28']);
    assert.deepEqual(await dates(weekly), ['2024-01-01', '2024-01-15', '2024-01-29', '2024-02-12']);
    assert.deepEqual(await dates(daily), ['2024-01-01', '2024-01-03', '2024-01-05']);
    assert.equal(Number(await scalar('select count(*) from public.account_movements')), 0);
  });
});

test('deleting an Auth user cascades its financial data while ordinary historical deletes remain blocked', async () => {
  const f = await fixture();
  await asUser(f.userId, async () => {
    const expenseId = await transaction(f);
    const movementId = await scalar('select public.settle_transaction($1,$2,$3,$4)', [expenseId, f.accountId, 'pix', '2026-01-10']);
    await scalar('select public.reverse_movement($1,$2)', [movementId, '2026-01-11']);
    const ids = await purchase(f, 90, '2026-01-01', 3);
    const invoiceId = await scalar('select credit_card_invoice_id from public.transactions where id=$1', [ids[0]]);
    await scalar('select public.close_invoice($1)', [invoiceId]);
    await scalar('select public.pay_invoice($1,$2,$3)', [invoiceId, f.accountId, '2026-02-05']);
    await mustReject('delete from public.accounts where id=$1', [f.accountId]);
    await mustReject('delete from public.transactions where id=$1', [expenseId]);
    await mustReject('delete from public.credit_cards where id=$1', [f.cardId]);
  });
  await db.exec('set role supabase_auth_admin');
  try {
    await db.query('delete from auth.users where id=$1', [f.userId]);
  } finally {
    await db.exec('reset role');
  }
  for (const table of ['accounts', 'categories', 'credit_cards', 'credit_card_invoices', 'installment_groups', 'recurrence_rules', 'transactions', 'account_movements']) {
    assert.equal(Number(await scalar(`select count(*) from public.${table} where user_id=$1`, [f.userId])), 0);
  }
  assert.equal(Number(await scalar('select count(*) from public.profiles where id=$1', [f.userId])), 0);
});
