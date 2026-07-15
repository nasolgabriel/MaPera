import type { SqlDriver } from '../driver';
import type { Goal } from './types';

export function createGoalsRepo(db: SqlDriver) {
  return {
    async create(g: Goal): Promise<void> {
      await db.run(
        `INSERT INTO goals (id, name, target_amount, deadline, account_id, saved_amount) VALUES (?, ?, ?, ?, ?, ?)`,
        [g.id, g.name, g.target_amount, g.deadline, g.account_id, g.saved_amount],
      );
    },
    async getById(id: string): Promise<Goal | null> {
      const rows = await db.query<Goal>('SELECT * FROM goals WHERE id = ?', [id]);
      return rows[0] ?? null;
    },
    async list(): Promise<Goal[]> {
      return db.query<Goal>('SELECT * FROM goals ORDER BY deadline');
    },
    async update(g: Goal): Promise<void> {
      await db.run(
        `UPDATE goals SET name = ?, target_amount = ?, deadline = ?, account_id = ?, saved_amount = ? WHERE id = ?`,
        [g.name, g.target_amount, g.deadline, g.account_id, g.saved_amount, g.id],
      );
    },
    async remove(id: string): Promise<void> {
      await db.run('DELETE FROM goals WHERE id = ?', [id]);
    },
  };
}
