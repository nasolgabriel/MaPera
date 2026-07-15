import type { SqlDriver } from '../driver';
import type { SavingPeriod } from './types';

type Row = Omit<SavingPeriod, 'streak_counted'> & { streak_counted: number };

function toSavingPeriod(row: Row): SavingPeriod {
  return { ...row, streak_counted: !!row.streak_counted };
}

// PK is `period` (ISO week), not `id` — matches README §7.1.
export function createSavingPeriodsRepo(db: SqlDriver) {
  return {
    async create(s: SavingPeriod): Promise<void> {
      await db.run(
        `INSERT INTO saving_periods (period, saved_amount, income_amount, rate, streak_counted) VALUES (?, ?, ?, ?, ?)`,
        [s.period, s.saved_amount, s.income_amount, s.rate, s.streak_counted ? 1 : 0],
      );
    },
    async getByPeriod(period: string): Promise<SavingPeriod | null> {
      const rows = await db.query<Row>('SELECT * FROM saving_periods WHERE period = ?', [period]);
      return rows[0] ? toSavingPeriod(rows[0]) : null;
    },
    async list(): Promise<SavingPeriod[]> {
      const rows = await db.query<Row>('SELECT * FROM saving_periods ORDER BY period');
      return rows.map(toSavingPeriod);
    },
    async update(s: SavingPeriod): Promise<void> {
      await db.run(
        `UPDATE saving_periods SET saved_amount = ?, income_amount = ?, rate = ?, streak_counted = ? WHERE period = ?`,
        [s.saved_amount, s.income_amount, s.rate, s.streak_counted ? 1 : 0, s.period],
      );
    },
    async remove(period: string): Promise<void> {
      await db.run('DELETE FROM saving_periods WHERE period = ?', [period]);
    },
  };
}
