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

test('categories enforce owner/type/name uniqueness and preserve referenced type and history', async () => {
  const f = await fixture();
  await asUser(f.userId, async () => {
    await mustReject(`insert into public.categories(user_id,name,type)
      values ($1,'  ALIMENTAÇÃO  ','expense')`, [f.userId]);
    const incomeId = await scalar(`insert into public.categories(user_id,name,type)
      values ($1,'Alimentação','income') returning id`, [f.userId]);
    const spareId = await scalar(`insert into public.categories(user_id,name,type)
      values ($1,'Transporte','expense') returning id`, [f.userId]);
    await mustReject(`update public.categories set name=' alimentação ' where id=$1`, [spareId]);
    await db.query(`update public.categories set type='income' where id=$1`, [spareId]);
    assert.equal(await scalar('select type from public.categories where id=$1', [spareId]), 'income');
    assert.equal(await scalar('select type from public.categories where id=$1', [incomeId]), 'income');
    await transaction(f);
    await mustReject(`update public.categories set type='income' where id=$1`, [f.expenseCategoryId]);
    await mustReject('delete from public.categories where id=$1', [f.expenseCategoryId]);
    await db.query(`update public.categories set name='Refeições',active=false where id=$1`, [f.expenseCategoryId]);
    assert.deepEqual(await one('select name,type,active from public.categories where id=$1', [f.expenseCategoryId]), {
      name: 'Refeições', type: 'expense', active: false,
    });
    await db.query('update public.categories set active=true where id=$1', [f.expenseCategoryId]);
    assert.equal(await scalar('select active from public.categories where id=$1', [f.expenseCategoryId]), true);
  });
});

test('card CRUD accepts zero and day 31; revised cycle affects only newly created invoices', async () => {
  const f = await fixture();
  await asUser(f.userId, async () => {
    const zeroCardId = await scalar(`insert into public.credit_cards(user_id,name,limit_amount,closing_day,due_day)
      values ($1,'Cartão zero',0,31,31) returning id`, [f.userId]);
    assert.equal(await scalar('select limit_amount::text from public.credit_cards where id=$1', [zeroCardId]), '0.00');
    await mustReject(`insert into public.credit_cards(user_id,name,limit_amount,closing_day,due_day)
      values ($1,'Negativo',-1,25,3)`, [f.userId]);
    await mustReject(`update public.credit_cards set closing_day=0 where id=$1`, [zeroCardId]);
    await mustReject(`update public.credit_cards set closing_day=32 where id=$1`, [zeroCardId]);
    await mustReject(`update public.credit_cards set due_day=0 where id=$1`, [zeroCardId]);
    await mustReject(`update public.credit_cards set due_day=32 where id=$1`, [zeroCardId]);
    await purchase(f, 100, '2026-01-10');
    const previous = await one(`select closing_date::text,due_date::text from public.credit_card_invoices
      where credit_card_id=$1 and reference_month='2026-01-01'`, [f.cardId]);
    assert.deepEqual(previous, { closing_date: '2026-01-31', due_date: '2026-02-05' });
    await db.query(`update public.credit_cards set name='Cartão revisado',limit_amount=6000,
      closing_day=25,due_day=3 where id=$1`, [f.cardId]);
    assert.deepEqual(await one(`select closing_date::text,due_date::text from public.credit_card_invoices
      where credit_card_id=$1 and reference_month='2026-01-01'`, [f.cardId]), previous);
    await purchase(f, 50, '2026-03-10');
    assert.deepEqual(await one(`select closing_date::text,due_date::text from public.credit_card_invoices
      where credit_card_id=$1 and reference_month='2026-03-01'`, [f.cardId]), {
      closing_date: '2026-03-25', due_date: '2026-04-03',
    });
    await db.query('update public.credit_cards set active=false where id=$1', [f.cardId]);
    await db.query('update public.credit_cards set active=true where id=$1', [f.cardId]);
    assert.equal(await scalar('select active from public.credit_cards where id=$1', [f.cardId]), true);
    assert.equal(Number(await scalar('select count(*) from public.credit_card_invoices where credit_card_id=$1', [f.cardId])), 2);
  });
});

test('atomic paid expense creates one cash movement and reversal restores pending state', async () => {
  const f = await fixture();
  await asUser(f.userId, async () => {
    const expenseId = await scalar(`select public.create_paid_expense(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [
      'Mercado', f.expenseCategoryId, 125.5, '2026-01-10', null, 'pix', 'compra',
      f.accountId, 'pix', '2026-01-10',
    ]);
    assert.deepEqual(await one('select status,actual_payment_method,account_id,settled_at::text from public.transactions where id=$1', [expenseId]), {
      status: 'settled', actual_payment_method: 'pix', account_id: f.accountId, settled_at: '2026-01-10',
    });
    const movement = await one(`select id,type,origin_type,amount::text from public.account_movements
      where origin_id=$1 and origin_type='expense_payment'`, [expenseId]);
    assert.deepEqual({ type: movement.type, origin_type: movement.origin_type, amount: movement.amount }, {
      type: 'out', origin_type: 'expense_payment', amount: '125.50',
    });
    assert.equal(await scalar('select current_balance::text from public.account_balances where account_id=$1', [f.accountId]), '874.50');
    const reversalId = await scalar('select public.reverse_movement($1,$2)', [movement.id, '2026-01-11']);
    assert.equal(await scalar('select status from public.transactions where id=$1', [expenseId]), 'pending');
    assert.equal(await scalar('select current_balance::text from public.account_balances where account_id=$1', [f.accountId]), '1000.00');
    assert.equal(await scalar('select reversal_of_movement_id from public.account_movements where id=$1', [reversalId]), movement.id);
    await mustReject(`select public.create_paid_expense($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [
      'Outro', f.expenseCategoryId, 10, '2026-01-10', null, 'credit_card', null,
      f.accountId, 'pix', '2026-01-10',
    ]);
  });
});

test('installment and card purchase RPCs keep exact cents and never duplicate cash outflow', async () => {
  const f = await fixture();
  await asUser(f.userId, async () => {
    const ids = await scalar(`select public.create_installment_expense($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
      'Curso', f.expenseCategoryId, 100.01, '2026-01-10', '2026-01-20', 'boleto', 'parcelado', null, 3,
    ]);
    assert.equal(ids.length, 3);
    const ordinary = await rows(`select installment_number,installment_total,amount::text,
      transaction_date::text,due_date::text,installment_group_id from public.transactions
      where id=any($1) order by installment_number`, [ids]);
    assert.deepEqual(ordinary.map((x) => x.amount), ['33.33', '33.33', '33.35']);
    assert.deepEqual(ordinary.map((x) => x.transaction_date), ['2026-01-10', '2026-02-10', '2026-03-10']);
    assert.deepEqual(ordinary.map((x) => x.due_date), ['2026-01-20', '2026-02-20', '2026-03-20']);
    assert.ok(ordinary.every((x) => x.installment_group_id === ordinary[0].installment_group_id));
    const cardIds = await scalar(`select public.create_expense_card_purchase($1,$2,$3,$4,$5,$6,$7)`, [
      f.cardId, f.expenseCategoryId, 'Notebook', 100.01, '2026-01-10', 'nota', 3,
    ]);
    assert.equal(cardIds.length, 3);
    const cardRows = await rows(`select amount::text,notes,credit_card_invoice_id,account_id,
      installment_number from public.transactions where id=any($1) order by installment_number`, [cardIds]);
    assert.deepEqual(cardRows.map((x) => x.amount), ['33.33', '33.33', '33.35']);
    assert.ok(cardRows.every((x) => x.credit_card_invoice_id && x.account_id === null && x.notes === 'nota'));
    assert.equal(Number(await scalar('select count(*) from public.account_movements')), 0);
    await mustReject(`select public.create_installment_expense($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
      'Inválido', f.expenseCategoryId, 0.01, '2026-01-10', null, 'pix', null, f.accountId, 3,
    ]);
  });
});

test('recurrence wrapper generates separate expenses and card edits preserve closed invoices', async () => {
  const f = await fixture();
  await asUser(f.userId, async () => {
    const ruleId = await scalar(`select public.create_expense_recurrence($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [
      'Academia', f.expenseCategoryId, 20, 'weekly', 1, '2026-01-01', null, 3,
      'pix', null, f.accountId, 'mensalidade', '2026-01-31',
    ]);
    const occurrences = await rows(`select transaction_date::text,status from public.transactions
      where recurrence_rule_id=$1 order by transaction_date`, [ruleId]);
    assert.deepEqual(occurrences, [
      { transaction_date: '2026-01-01', status: 'pending' },
      { transaction_date: '2026-01-08', status: 'pending' },
      { transaction_date: '2026-01-15', status: 'pending' },
    ]);
    assert.equal(await scalar('select notes from public.transactions where recurrence_rule_id=$1 limit 1', [ruleId]), 'mensalidade');
    assert.equal(await scalar('select public.generate_recurrences($1)', ['2026-01-31']), 0);
    const cardIds = await scalar(`select public.create_expense_card_purchase($1,$2,$3,$4,$5,$6,$7)`, [
      f.cardId, f.expenseCategoryId, 'Livro', 50, '2026-01-10', null, 1,
    ]);
    const cardExpenseId = cardIds[0];
    const originalInvoiceId = await scalar('select credit_card_invoice_id from public.transactions where id=$1', [cardExpenseId]);
    await db.query(`select public.update_expense($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [
      cardExpenseId, 'Livro editado', f.expenseCategoryId, 60, '2026-02-10', null,
      'credit_card', f.cardId, null, 'nova nota',
    ]);
    const newInvoiceId = await scalar('select credit_card_invoice_id from public.transactions where id=$1', [cardExpenseId]);
    assert.notEqual(newInvoiceId, originalInvoiceId);
    assert.equal(Number(await scalar('select count(*) from public.account_movements')), 0);
    await db.query('select public.close_invoice($1)', [newInvoiceId]);
    await mustReject(`select public.update_expense($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [
      cardExpenseId, 'Livro editado', f.expenseCategoryId, 70, '2026-02-10',
      await scalar('select due_date::text from public.transactions where id=$1', [cardExpenseId]),
      'credit_card', f.cardId, null, 'nota',
    ]);
    await db.query(`select public.update_expense($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [
      cardExpenseId, 'Livro fechado', f.expenseCategoryId, 60, '2026-02-10',
      await scalar('select due_date::text from public.transactions where id=$1', [cardExpenseId]),
      'credit_card', f.cardId, null, 'somente nota',
    ]);
    assert.equal(await scalar('select description from public.transactions where id=$1', [cardExpenseId]), 'Livro fechado');
  });
});

test('deleting a recurring expense keeps the rule active without regenerating the removed occurrence', async () => {
  const f = await fixture();
  await asUser(f.userId, async () => {
    const ruleId = await scalar(`select public.create_expense_recurrence($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [
      'Assinatura', f.expenseCategoryId, 100, 'monthly', 1, '2026-01-10', null, 4,
      'boleto', null, null, null, '2026-02-10',
    ]);
    const removedId = await scalar(`select id from public.transactions
      where recurrence_rule_id=$1 and transaction_date='2026-02-10'`, [ruleId]);

    await db.query('select public.delete_expense($1)', [removedId]);

    assert.equal(await scalar('select active from public.recurrence_rules where id=$1', [ruleId]), true);
    assert.equal(Number(await scalar('select public.generate_recurrences($1)', ['2026-04-30'])), 2);
    const dates = (await rows(`select transaction_date::text from public.transactions
      where recurrence_rule_id=$1 order by transaction_date`, [ruleId])).map((row) => row.transaction_date);
    assert.deepEqual(dates, ['2026-01-10', '2026-03-10', '2026-04-10']);
  });
});

test('income lifecycle keeps competence separate from cash flow and preserves RLS', async () => {
  const f = await fixture();
  const foreign = await fixture();
  const foreignIncomeId = await asUser(foreign.userId, () => transaction(foreign, {
    type: 'income', category_id: foreign.incomeCategoryId,
  }));
  await asUser(f.userId, async () => {
    const pendingId = await transaction(f, { type: 'income', category_id: f.incomeCategoryId,
      description: 'Freela pendente', planned_payment_method: 'bank_transfer' });
    assert.equal(Number(await scalar(`select count(*) from public.account_movements
      where origin_id=$1 and origin_type='income_receipt'`, [pendingId])), 0);
    const receivedId = await scalar(`select public.create_received_income($1,$2,$3,$4,$5,$6,$7,$8)`, [
      'Salário', f.incomeCategoryId, 5000, '2026-01-31', '2026-02-05', 'competência janeiro',
      f.accountId, '2026-02-05',
    ]);
    assert.deepEqual(await one(`select status,settled_at::text,account_id from public.transactions where id=$1`, [receivedId]), {
      status: 'settled', settled_at: '2026-02-05', account_id: f.accountId,
    });
    const movement = await one(`select id,type,origin_type,movement_date::text from public.account_movements
      where origin_id=$1 and origin_type='income_receipt'`, [receivedId]);
    assert.deepEqual({ type: movement.type, origin_type: movement.origin_type, movement_date: movement.movement_date }, {
      type: 'in', origin_type: 'income_receipt', movement_date: '2026-02-05',
    });
    assert.equal(await scalar('select current_balance::text from public.account_balances where account_id=$1', [f.accountId]), '6000.00');
    const reversalId = await scalar('select public.reverse_movement($1,$2)', [movement.id, '2026-02-06']);
    assert.deepEqual(await one('select type,reversal_of_movement_id from public.account_movements where id=$1', [reversalId]), {
      type: 'out', reversal_of_movement_id: movement.id,
    });
    assert.equal(await scalar('select status from public.transactions where id=$1', [receivedId]), 'pending');
    assert.equal(await scalar('select current_balance::text from public.account_balances where account_id=$1', [f.accountId]), '1000.00');
    const ruleId = await scalar(`select public.create_income_recurrence($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [
      'Aluguel', f.incomeCategoryId, 2000, 'monthly', 1, '2026-01-01', null, 3,
      f.accountId, 'contrato', '2026-04-01',
    ]);
    assert.equal(Number(await scalar('select count(*) from public.transactions where recurrence_rule_id=$1', [ruleId])), 3);
    assert.equal(Number(await scalar(`select count(*) from public.account_movements m join public.transactions t on t.id=m.origin_id
      where t.recurrence_rule_id=$1`, [ruleId])), 0);
    assert.equal(Number(await scalar('select count(*) from public.transactions where user_id=$1', [foreign.userId])), 0);
    await mustReject(`select public.update_income($1,$2,$3,$4,$5,$6,$7)`, [
      foreignIncomeId, 'Inválida', f.incomeCategoryId, 1, '2026-01-01', null, null,
    ]);
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
    await mustReject('select public.delete_expense($1)', [randomUUID()]);
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
    const originalCycle = await one('select closing_date::text,due_date::text from public.credit_card_invoices where id=$1', [own.credit_card_invoice_id]);
    await db.query('update public.credit_cards set closing_day=15 where id=$1', [a.cardId]);
    assert.deepEqual(await one('select closing_date::text,due_date::text from public.credit_card_invoices where id=$1', [own.credit_card_invoice_id]), originalCycle);
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

test('account opening can be revised after movements and the view derives the new balance', async () => {
  const f = await fixture();
  await asUser(f.userId, async () => {
    const expenseId = await transaction(f);
    await scalar('select public.settle_transaction($1,$2,$3,$4)', [expenseId, f.accountId, 'pix', '2026-01-10']);
    assert.equal(await scalar('select current_balance::text from public.account_balances where account_id=$1', [f.accountId]), '874.50');
    await db.query(`update public.accounts set name='Conta revisada',type='savings',initial_balance=-50,
      initial_balance_date='2026-01-11' where id=$1`, [f.accountId]);
    assert.deepEqual(await one('select name,type,initial_balance::text,initial_balance_date::text from public.accounts where id=$1', [f.accountId]), {
      name: 'Conta revisada', type: 'savings', initial_balance: '-50.00', initial_balance_date: '2026-01-11',
    });
    assert.equal(await scalar('select current_balance::text from public.account_balances where account_id=$1', [f.accountId]), '-50.00');
    assert.equal(Number(await scalar('select count(*) from public.account_movements where account_id=$1', [f.accountId])), 1);
    await db.query('update public.accounts set active=false where id=$1', [f.accountId]);
    await db.query('update public.accounts set active=true where id=$1', [f.accountId]);
    assert.equal(await scalar('select active from public.accounts where id=$1', [f.accountId]), true);
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
  const foreignGroupId = await asUser(other.userId, async () => {
    const id = randomUUID();
    await scalar('select public.transfer_between_accounts($1,$2,$3,$4,$5,$6)',
      [other.accountId, other.secondAccountId, 5, '2026-01-10', 'Transferência alheia', id]);
    return id;
  });
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
    await mustReject('select public.reverse_transfer_group($1,$2)', [groupId, '2026-01-09']);
    assert.equal(await scalar('select public.reverse_transfer_group($1,$2)', [groupId, '2026-01-11']), groupId);
    assert.equal(Number(await scalar('select count(*) from public.account_movements')), 4);
    assert.equal(Number(await scalar(`select count(*) from public.account_movements
      where transfer_group_id=$1 and origin_type='reversal' and reversal_of_movement_id is not null`, [groupId])), 2);
    assert.equal(Number(await scalar(`select sum(case type when 'in' then amount else -amount end)
      from public.account_movements where transfer_group_id=$1`, [groupId])), 0);
    assert.equal(await scalar('select current_balance::text from public.account_balances where account_id=$1', [f.accountId]), '1000.00');
    assert.equal(await scalar('select current_balance::text from public.account_balances where account_id=$1', [f.secondAccountId]), '-50.00');
    await mustReject('select public.reverse_transfer_group($1,$2)', [groupId, '2026-01-12']);
    await mustReject('select public.reverse_transfer_group($1,$2)', [randomUUID(), '2026-01-12']);
    await mustReject('select public.reverse_transfer_group($1,$2)', [foreignGroupId, '2026-01-12']);
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
    const recurrenceId = await scalar(`insert into public.recurrence_rules(user_id,type,description,category_id,amount,frequency,start_date)
      values ($1,'expense','Recorrência removida',$2,10,'monthly','2026-01-01') returning id`, [f.userId, f.expenseCategoryId]);
    await scalar('select public.generate_recurrences($1)', ['2026-01-01']);
    const recurringExpenseId = await scalar('select id from public.transactions where recurrence_rule_id=$1', [recurrenceId]);
    await db.query('select public.delete_expense($1)', [recurringExpenseId]);
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
  assert.equal(Number(await scalar('select count(*) from private.recurrence_exceptions where user_id=$1', [f.userId])), 1);
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
  assert.equal(Number(await scalar('select count(*) from private.recurrence_exceptions where user_id=$1', [f.userId])), 0);
});

test('integrated MVP scenario preserves competence, cash, invoices, reversals, and balances', async () => {
  const f = await fixture();
  await asUser(f.userId, async () => {
    await db.query('update public.accounts set initial_balance=5000 where id=$1', [f.accountId]);
    await db.query('update public.accounts set initial_balance=1000 where id=$1', [f.secondAccountId]);
    await db.query('update public.credit_cards set limit_amount=10000 where id=$1', [f.cardId]);

    const paidExpenseId = await scalar(`select public.create_paid_expense($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [
      'Despesa PIX', f.expenseCategoryId, 200, '2026-01-10', '2026-01-10', 'pix', null,
      f.accountId, 'pix', '2026-01-10',
    ]);
    await transaction(f, { description: 'Boleto pendente', amount: 300, due_date: '2026-01-20', planned_payment_method: 'boleto' });
    const singlePurchase = await purchase(f, 600, '2026-01-10');
    const installmentPurchases = await purchase(f, 1200, '2026-01-10', 3);
    const receivedIncomeId = await scalar(`select public.create_received_income($1,$2,$3,$4,$5,$6,$7,$8)`, [
      'Salário recebido', f.incomeCategoryId, 3000, '2026-01-10', '2026-01-10', null,
      f.accountId, '2026-01-10',
    ]);
    await transaction(f, { type: 'income', description: 'Receita pendente', category_id: f.incomeCategoryId,
      amount: 500, due_date: '2026-01-25', planned_payment_method: 'bank_transfer' });

    const transferGroup = randomUUID();
    await scalar('select public.transfer_between_accounts($1,$2,$3,$4,$5,$6)', [
      f.accountId, f.secondAccountId, 1000, '2026-01-15', 'Reserva mensal', transferGroup,
    ]);
    const invoiceId = await scalar('select credit_card_invoice_id from public.transactions where id=$1', [singlePurchase[0]]);
    assert.equal(await scalar('select total_amount::text from public.invoice_totals where invoice_id=$1', [invoiceId]), '1000.00');
    await scalar('select public.close_invoice($1)', [invoiceId]);
    const firstInvoicePayment = await scalar('select public.pay_invoice($1,$2,$3)', [invoiceId, f.accountId, '2026-02-05']);

    const expenseMovement = await scalar(`select id from public.account_movements
      where origin_type='expense_payment' and origin_id=$1`, [paidExpenseId]);
    const incomeMovement = await scalar(`select id from public.account_movements
      where origin_type='income_receipt' and origin_id=$1`, [receivedIncomeId]);
    await scalar('select public.reverse_movement($1,$2)', [expenseMovement, '2026-02-06']);
    await scalar('select public.reverse_movement($1,$2)', [incomeMovement, '2026-02-06']);
    await scalar('select public.reverse_movement($1,$2)', [firstInvoicePayment, '2026-02-06']);
    const secondInvoicePayment = await scalar('select public.pay_invoice($1,$2,$3)', [invoiceId, f.accountId, '2026-02-07']);

    assert.equal(Number(await scalar('select count(*) from public.transactions')), 8);
    assert.equal(Number(await scalar('select count(*) from public.account_movements')), 9);
    assert.equal(Number(await scalar(`select count(*) from public.account_movements
      where origin_type='transfer' and transfer_group_id=$1`, [transferGroup])), 2);
    assert.deepEqual(await rows(`select type,amount::text from public.account_movements
      where origin_type='transfer' and transfer_group_id=$1 order by type`, [transferGroup]), [
      { type: 'in', amount: '1000.00' }, { type: 'out', amount: '1000.00' },
    ]);
    assert.equal(Number(await scalar('select count(*) from public.transactions where installment_group_id is not null')), 3);
    assert.equal(await scalar(`select sum(amount)::text from public.transactions
      where id=any($1::uuid[])`, [installmentPurchases]), '1200.00');
    assert.deepEqual(await one(`select status,paid_at::text,payment_account_id from public.credit_card_invoices where id=$1`, [invoiceId]), {
      status: 'paid', paid_at: '2026-02-07', payment_account_id: f.accountId,
    });
    assert.notEqual(secondInvoicePayment, firstInvoicePayment);
    assert.equal(await scalar('select current_balance::text from public.account_balances where account_id=$1', [f.accountId]), '3000.00');
    assert.equal(await scalar('select current_balance::text from public.account_balances where account_id=$1', [f.secondAccountId]), '2000.00');
    assert.deepEqual(await one(`select
      sum(amount) filter(where type='income')::text as income,
      sum(amount) filter(where type='expense')::text as expense
      from public.transactions`), { income: '3500.00', expense: '2300.00' });
    assert.deepEqual(await one(`select
      coalesce(sum(m.amount) filter(where m.type='in'),0)::text as incoming,
      coalesce(sum(m.amount) filter(where m.type='out'),0)::text as outgoing
      from public.account_movements m left join public.account_movements original
        on original.id=m.reversal_of_movement_id and original.user_id=m.user_id
      where m.origin_type<>'transfer' and not (m.origin_type='reversal' and original.origin_type='transfer')`), {
      incoming: '4200.00', outgoing: '5200.00',
    });
    assert.equal(Number(await scalar(`select count(*) from public.account_movements m
      left join public.account_movements original on original.id=m.reversal_of_movement_id and original.user_id=m.user_id
      where (m.origin_type='reversal' and original.id is null)
        or (m.origin_type in ('expense_payment','income_receipt','credit_card_payment') and m.origin_id is null)`)), 0);
  });
});
