import { describe, it, expect, beforeEach } from 'vitest';
import { createSqlJsDriver } from '../drivers/sqljsDriver';
import type { SqlDriver } from '../driver';
import { createAccountsRepo } from './accountsRepo';
import { createCategoriesRepo } from './categoriesRepo';
import { createTransactionsRepo } from './transactionsRepo';
import { createBudgetsRepo } from './budgetsRepo';
import { createGoalsRepo } from './goalsRepo';
import { createRecurringRepo } from './recurringRepo';
import { createSavedItemsRepo } from './savedItemsRepo';
import { createSavingPeriodsRepo } from './savingPeriodsRepo';
import { createSplitPresetsRepo } from './splitPresetsRepo';
import { createInvestmentValuesRepo } from './investmentValuesRepo';
import { createDiscountLogsRepo } from './discountLogsRepo';
import { seed } from '../seed';

let db: SqlDriver;

beforeEach(async () => {
  db = await createSqlJsDriver();
});

describe('accountsRepo', () => {
  it('round-trips create/get/update/delete', async () => {
    const repo = createAccountsRepo(db);
    await repo.create({
      id: 'a1', name: 'Cash', type: 'cash', starting_balance: 10000, essence_color: '#B3282D',
      archived: false, credit_limit: null, statement_day: null, due_day: null, points_rate: null,
    });
    const got = await repo.getById('a1');
    expect(got).toMatchObject({ id: 'a1', name: 'Cash', starting_balance: 10000, archived: false });

    await repo.update({ ...got!, name: 'Wallet', archived: true });
    const updated = await repo.getById('a1');
    expect(updated).toMatchObject({ name: 'Wallet', archived: true });

    expect(await repo.list()).toHaveLength(1);
    await repo.remove('a1');
    expect(await repo.getById('a1')).toBeNull();
  });
});

describe('categoriesRepo', () => {
  it('round-trips create/get/update/delete', async () => {
    const repo = createCategoriesRepo(db);
    await repo.create({ id: 'c1', name: 'Food', icon: 'utensils', kind: 'expense', sort_order: 0 });
    expect(await repo.getById('c1')).toMatchObject({ name: 'Food' });
    await repo.update({ id: 'c1', name: 'Groceries', icon: 'utensils', kind: 'expense', sort_order: 1 });
    expect(await repo.getById('c1')).toMatchObject({ name: 'Groceries', sort_order: 1 });
    expect(await repo.list()).toHaveLength(1);
    await repo.remove('c1');
    expect(await repo.getById('c1')).toBeNull();
  });
});

describe('transactionsRepo', () => {
  it('round-trips create/get/update/delete and filters by account', async () => {
    const accounts = createAccountsRepo(db);
    await accounts.create({
      id: 'a1', name: 'Cash', type: 'cash', starting_balance: 0, essence_color: '#B3282D',
      archived: false, credit_limit: null, statement_day: null, due_day: null, points_rate: null,
    });
    const repo = createTransactionsRepo(db);
    await repo.create({
      id: 't1', amount: 5000, kind: 'expense', account_id: 'a1', to_account_id: null,
      category_id: null, date: '2026-07-01', note: 'Coffee',
      discount_rule_id: null, recurring_id: null, saved_item_id: null,
    });
    expect(await repo.getById('t1')).toMatchObject({ amount: 5000, note: 'Coffee' });
    await repo.update({
      id: 't1', amount: 6000, kind: 'expense', account_id: 'a1', to_account_id: null,
      category_id: null, date: '2026-07-01', note: 'Coffee + snack',
      discount_rule_id: null, recurring_id: null, saved_item_id: null,
    });
    expect(await repo.getById('t1')).toMatchObject({ amount: 6000 });
    expect(await repo.listByAccount('a1')).toHaveLength(1);
    await repo.remove('t1');
    expect(await repo.getById('t1')).toBeNull();
  });
});

describe('budgetsRepo', () => {
  it('round-trips create/get/update/delete', async () => {
    const categories = createCategoriesRepo(db);
    await categories.create({ id: 'c1', name: 'Food', icon: 'utensils', kind: 'expense', sort_order: 0 });
    const repo = createBudgetsRepo(db);
    await repo.create({ id: 'b1', category_id: 'c1', month: '2026-07', cap_amount: 500000 });
    expect(await repo.getById('b1')).toMatchObject({ cap_amount: 500000 });
    await repo.update({ id: 'b1', category_id: 'c1', month: '2026-07', cap_amount: 600000 });
    expect(await repo.getById('b1')).toMatchObject({ cap_amount: 600000 });
    expect(await repo.listByMonth('2026-07')).toHaveLength(1);
    await repo.remove('b1');
    expect(await repo.getById('b1')).toBeNull();
  });
});

describe('goalsRepo', () => {
  it('round-trips create/get/update/delete', async () => {
    const repo = createGoalsRepo(db);
    await repo.create({ id: 'g1', name: 'Emergency fund', target_amount: 1000000, deadline: '2027-01-01', account_id: null, saved_amount: 0 });
    expect(await repo.getById('g1')).toMatchObject({ name: 'Emergency fund' });
    await repo.update({ id: 'g1', name: 'Emergency fund', target_amount: 1000000, deadline: '2027-01-01', account_id: null, saved_amount: 250000 });
    expect(await repo.getById('g1')).toMatchObject({ saved_amount: 250000 });
    expect(await repo.list()).toHaveLength(1);
    await repo.remove('g1');
    expect(await repo.getById('g1')).toBeNull();
  });
});

describe('recurringRepo', () => {
  it('round-trips create/get/update/delete', async () => {
    const repo = createRecurringRepo(db);
    await repo.create({
      id: 'r1', template: '{}', kind: 'loan', frequency: 'monthly', next_due: '2026-08-01',
      auto_post: false, remaining_payments: 24,
    });
    expect(await repo.getById('r1')).toMatchObject({ auto_post: false, remaining_payments: 24 });
    await repo.update({
      id: 'r1', template: '{}', kind: 'loan', frequency: 'monthly', next_due: '2026-08-01',
      auto_post: true, remaining_payments: 23,
    });
    expect(await repo.getById('r1')).toMatchObject({ auto_post: true, remaining_payments: 23 });
    expect(await repo.list()).toHaveLength(1);
    await repo.remove('r1');
    expect(await repo.getById('r1')).toBeNull();
  });
});

describe('savedItemsRepo', () => {
  it('round-trips create/get/update/delete', async () => {
    const repo = createSavedItemsRepo(db);
    await repo.create({
      id: 's1', name: 'Ligo Sardines', description: null, usual_price: 3500, last_price: null,
      category_id: null, kind: 'expense', use_count: 0, last_used_at: null,
    });
    expect(await repo.getById('s1')).toMatchObject({ name: 'Ligo Sardines' });
    await repo.update({
      id: 's1', name: 'Ligo Sardines', description: null, usual_price: 3500, last_price: 3500,
      category_id: null, kind: 'expense', use_count: 1, last_used_at: '2026-07-10',
    });
    expect(await repo.getById('s1')).toMatchObject({ use_count: 1, last_price: 3500 });
    expect(await repo.list()).toHaveLength(1);
    await repo.remove('s1');
    expect(await repo.getById('s1')).toBeNull();
  });
});

describe('savingPeriodsRepo', () => {
  it('round-trips create/get/update/delete keyed by period', async () => {
    const repo = createSavingPeriodsRepo(db);
    await repo.create({ period: '2026-W28', saved_amount: 200000, income_amount: 2000000, rate: 10, streak_counted: false });
    expect(await repo.getByPeriod('2026-W28')).toMatchObject({ saved_amount: 200000, streak_counted: false });
    await repo.update({ period: '2026-W28', saved_amount: 200000, income_amount: 2000000, rate: 10, streak_counted: true });
    expect(await repo.getByPeriod('2026-W28')).toMatchObject({ streak_counted: true });
    expect(await repo.list()).toHaveLength(1);
    await repo.remove('2026-W28');
    expect(await repo.getByPeriod('2026-W28')).toBeNull();
  });
});

describe('splitPresetsRepo', () => {
  it('round-trips create/get/update/delete', async () => {
    const repo = createSplitPresetsRepo(db);
    const buckets = JSON.stringify([{ target: { type: 'budget', category_id: 'c1' }, mode: 'percent', value: 5000 }]);
    await repo.create({ id: 'p1', name: 'Salary', buckets });
    expect(await repo.getById('p1')).toMatchObject({ name: 'Salary', buckets });
    await repo.update({ id: 'p1', name: 'Side income', buckets });
    expect(await repo.getById('p1')).toMatchObject({ name: 'Side income' });
    expect(await repo.list()).toHaveLength(1);
    await repo.remove('p1');
    expect(await repo.getById('p1')).toBeNull();
  });
});

describe('investmentValuesRepo', () => {
  it('round-trips create/get/update/delete', async () => {
    const accounts = createAccountsRepo(db);
    await accounts.create({
      id: 'a1', name: 'MP2', type: 'investment', starting_balance: 1200000, essence_color: '#7A3FD0',
      archived: false, credit_limit: null, statement_day: null, due_day: null, points_rate: null,
    });
    const repo = createInvestmentValuesRepo(db);
    await repo.create({ id: 'iv1', account_id: 'a1', month: '2026-07', value: 1320000 });
    expect(await repo.getById('iv1')).toMatchObject({ account_id: 'a1', month: '2026-07', value: 1320000 });
    await repo.update({ id: 'iv1', account_id: 'a1', month: '2026-07', value: 1350000 });
    expect(await repo.getById('iv1')).toMatchObject({ value: 1350000 });
    expect(await repo.list()).toHaveLength(1);
    await repo.remove('iv1');
    expect(await repo.getById('iv1')).toBeNull();
  });
});

describe('seed', () => {
  it('populates accounts, categories, and transactions matching §8.1 worked example', async () => {
    await seed(db);
    const accounts = await createAccountsRepo(db).list();
    const categories = await createCategoriesRepo(db).list();
    const transactions = await createTransactionsRepo(db).list();

    expect(accounts).toHaveLength(2);
    expect(categories).toHaveLength(3);
    expect(transactions).toHaveLength(3);

    const income = transactions.filter((t) => t.kind === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expense = transactions.filter((t) => t.kind === 'expense').reduce((sum, t) => sum + t.amount, 0);
    expect(income - expense).toBe(650000); // cash_flow(t) = +₱6,500.00 in centavos
  });
});

describe('discountLogsRepo', () => {
  it('round-trips create/get/delete against a transaction', async () => {
    const accounts = createAccountsRepo(db);
    await accounts.create({
      id: 'a1', name: 'Cash', type: 'cash', starting_balance: 0, essence_color: '#1E3A6E',
      archived: false, credit_limit: null, statement_day: null, due_day: null, points_rate: null,
    });
    await createTransactionsRepo(db).create({
      id: 't1', amount: 1200, kind: 'expense', account_id: 'a1', to_account_id: null,
      category_id: null, date: '2026-07-14', note: 'student fare',
      discount_rule_id: 'fare-jeepney-student', recurring_id: null, saved_item_id: null,
    });

    const repo = createDiscountLogsRepo(db);
    await repo.create({ id: 'd1', transaction_id: 't1', base_amount: 1500 });
    expect(await repo.getById('d1')).toMatchObject({ transaction_id: 't1', base_amount: 1500 });
    expect(await repo.list()).toHaveLength(1);
    await repo.remove('d1');
    expect(await repo.getById('d1')).toBeNull();
  });
});
