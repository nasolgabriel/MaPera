import type { SqlDriver } from '../driver';
import type { DiscountLog } from './types';

export function createDiscountLogsRepo(db: SqlDriver) {
  return {
    async create(l: DiscountLog): Promise<void> {
      await db.run(
        `INSERT INTO discount_logs (id, transaction_id, base_amount) VALUES (?, ?, ?)`,
        [l.id, l.transaction_id, l.base_amount],
      );
    },
    async getById(id: string): Promise<DiscountLog | null> {
      const rows = await db.query<DiscountLog>('SELECT * FROM discount_logs WHERE id = ?', [id]);
      return rows[0] ?? null;
    },
    async list(): Promise<DiscountLog[]> {
      return db.query<DiscountLog>('SELECT * FROM discount_logs', []);
    },
    async remove(id: string): Promise<void> {
      await db.run('DELETE FROM discount_logs WHERE id = ?', [id]);
    },
  };
}
