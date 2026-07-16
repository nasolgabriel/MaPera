import type { SqlDriver } from '../driver';
import type { Budget } from './types';

export function createBudgetsRepo(db: SqlDriver) {
  return {
    async create(b: Budget): Promise<void> {
      await db.run(
        `INSERT INTO budgets (id, category_id, month, cap_amount) VALUES (?, ?, ?, ?)`,
        [b.id, b.category_id, b.month, b.cap_amount],
      );
    },
    async getById(id: string): Promise<Budget | null> {
      const rows = await db.query<Budget>('SELECT * FROM budgets WHERE id = ?', [id]);
      return rows[0] ?? null;
    },
    async list(): Promise<Budget[]> {
      return db.query<Budget>('SELECT * FROM budgets', []);
    },
    async listByMonth(month: string): Promise<Budget[]> {
      return db.query<Budget>('SELECT * FROM budgets WHERE month = ?', [month]);
    },
    async update(b: Budget): Promise<void> {
      await db.run(
        `UPDATE budgets SET category_id = ?, month = ?, cap_amount = ? WHERE id = ?`,
        [b.category_id, b.month, b.cap_amount, b.id],
      );
    },
    async remove(id: string): Promise<void> {
      await db.run('DELETE FROM budgets WHERE id = ?', [id]);
    },
  };
}
