import type { SqlDriver } from '../driver';
import type { Sweep } from './types';

export function createSweepsRepo(db: SqlDriver) {
  return {
    async create(s: Sweep): Promise<void> {
      await db.run(
        `INSERT INTO sweeps (id, month, transaction_id) VALUES (?, ?, ?)`,
        [s.id, s.month, s.transaction_id],
      );
    },
    async getByMonth(month: string): Promise<Sweep | null> {
      const rows = await db.query<Sweep>('SELECT * FROM sweeps WHERE month = ?', [month]);
      return rows[0] ?? null;
    },
    async list(): Promise<Sweep[]> {
      return db.query<Sweep>('SELECT * FROM sweeps ORDER BY month', []);
    },
    async remove(id: string): Promise<void> {
      await db.run('DELETE FROM sweeps WHERE id = ?', [id]);
    },
  };
}
