import type { SqlDriver } from '../driver';
import type { InvestmentValue } from './types';

export function createInvestmentValuesRepo(db: SqlDriver) {
  return {
    async create(v: InvestmentValue): Promise<void> {
      await db.run(
        `INSERT INTO investment_values (id, account_id, month, value) VALUES (?, ?, ?, ?)`,
        [v.id, v.account_id, v.month, v.value],
      );
    },
    async getById(id: string): Promise<InvestmentValue | null> {
      const rows = await db.query<InvestmentValue>('SELECT * FROM investment_values WHERE id = ?', [id]);
      return rows[0] ?? null;
    },
    async list(): Promise<InvestmentValue[]> {
      return db.query<InvestmentValue>('SELECT * FROM investment_values ORDER BY month', []);
    },
    async update(v: InvestmentValue): Promise<void> {
      await db.run(
        `UPDATE investment_values SET account_id = ?, month = ?, value = ? WHERE id = ?`,
        [v.account_id, v.month, v.value, v.id],
      );
    },
    async remove(id: string): Promise<void> {
      await db.run('DELETE FROM investment_values WHERE id = ?', [id]);
    },
  };
}
