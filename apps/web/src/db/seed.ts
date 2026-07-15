import type { SqlDriver } from './driver';
import { createAccountsRepo } from './repositories/accountsRepo';
import { createCategoriesRepo } from './repositories/categoriesRepo';
import { createTransactionsRepo } from './repositories/transactionsRepo';

export async function seed(db: SqlDriver): Promise<void> {
  const accounts = createAccountsRepo(db);
  const categories = createCategoriesRepo(db);
  const transactions = createTransactionsRepo(db);

  await accounts.create({
    id: 'acc-cash', name: 'Cash', type: 'cash', starting_balance: 0, essence_color: '#1E3A6E',
    archived: false, credit_limit: null, statement_day: null, due_day: null, points_rate: null,
  });
  await accounts.create({
    id: 'acc-bank', name: 'BPI', type: 'bank', starting_balance: 0, essence_color: '#0D7A3F',
    archived: false, credit_limit: null, statement_day: null, due_day: null, points_rate: null,
  });

  await categories.create({ id: 'cat-salary', name: 'Salary', icon: 'briefcase', kind: 'income', sort_order: 0 });
  await categories.create({ id: 'cat-food', name: 'Food', icon: 'utensils', kind: 'expense', sort_order: 0 });
  await categories.create({ id: 'cat-transport', name: 'Transport', icon: 'bus', kind: 'expense', sort_order: 1 });

  await transactions.create({
    id: 'txn-income-1', amount: 2000000, kind: 'income', account_id: 'acc-bank', to_account_id: null,
    category_id: 'cat-salary', date: '2026-07-01', note: 'July salary',
    discount_rule_id: null, recurring_id: null, saved_item_id: null,
  });
  await transactions.create({
    id: 'txn-expense-1', amount: 900000, kind: 'expense', account_id: 'acc-bank', to_account_id: null,
    category_id: 'cat-food', date: '2026-07-05', note: 'Groceries',
    discount_rule_id: null, recurring_id: null, saved_item_id: null,
  });
  await transactions.create({
    id: 'txn-expense-2', amount: 450000, kind: 'expense', account_id: 'acc-cash', to_account_id: null,
    category_id: 'cat-transport', date: '2026-07-06', note: 'Jeepney + bus fares',
    discount_rule_id: null, recurring_id: null, saved_item_id: null,
  });
  // I=20,000.00, E=13,500.00 → cash_flow = +6,500.00 (650000 centavos)
}
