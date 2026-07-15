import type { SqlDriver } from '../driver';
import type { Transaction } from './types';

export function createTransactionsRepo(db: SqlDriver) {
  return {
    async create(t: Transaction): Promise<void> {
      await db.run(
        `INSERT INTO transactions (id, amount, kind, account_id, to_account_id, category_id, date, note, discount_rule_id, recurring_id, saved_item_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [t.id, t.amount, t.kind, t.account_id, t.to_account_id, t.category_id, t.date, t.note, t.discount_rule_id, t.recurring_id, t.saved_item_id],
      );
    },
    async getById(id: string): Promise<Transaction | null> {
      const rows = await db.query<Transaction>('SELECT * FROM transactions WHERE id = ?', [id]);
      return rows[0] ?? null;
    },
    async list(): Promise<Transaction[]> {
      return db.query<Transaction>('SELECT * FROM transactions ORDER BY date DESC');
    },
    async listByAccount(accountId: string): Promise<Transaction[]> {
      return db.query<Transaction>(
        'SELECT * FROM transactions WHERE account_id = ? OR to_account_id = ? ORDER BY date DESC',
        [accountId, accountId],
      );
    },
    async update(t: Transaction): Promise<void> {
      await db.run(
        `UPDATE transactions SET amount = ?, kind = ?, account_id = ?, to_account_id = ?, category_id = ?,
         date = ?, note = ?, discount_rule_id = ?, recurring_id = ?, saved_item_id = ? WHERE id = ?`,
        [t.amount, t.kind, t.account_id, t.to_account_id, t.category_id, t.date, t.note, t.discount_rule_id, t.recurring_id, t.saved_item_id, t.id],
      );
    },
    async remove(id: string): Promise<void> {
      await db.run('DELETE FROM transactions WHERE id = ?', [id]);
    },
  };
}
