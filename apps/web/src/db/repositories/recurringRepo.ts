import type { SqlDriver } from '../driver';
import type { Recurring } from './types';

type Row = Omit<Recurring, 'auto_post'> & { auto_post: number };

function toRecurring(row: Row): Recurring {
  return { ...row, auto_post: !!row.auto_post };
}

export function createRecurringRepo(db: SqlDriver) {
  return {
    async create(r: Recurring): Promise<void> {
      await db.run(
        `INSERT INTO recurring (id, template, kind, frequency, next_due, auto_post, remaining_payments)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [r.id, r.template, r.kind, r.frequency, r.next_due, r.auto_post ? 1 : 0, r.remaining_payments],
      );
    },
    async getById(id: string): Promise<Recurring | null> {
      const rows = await db.query<Row>('SELECT * FROM recurring WHERE id = ?', [id]);
      return rows[0] ? toRecurring(rows[0]) : null;
    },
    async list(): Promise<Recurring[]> {
      const rows = await db.query<Row>('SELECT * FROM recurring ORDER BY next_due');
      return rows.map(toRecurring);
    },
    async update(r: Recurring): Promise<void> {
      await db.run(
        `UPDATE recurring SET template = ?, kind = ?, frequency = ?, next_due = ?, auto_post = ?, remaining_payments = ? WHERE id = ?`,
        [r.template, r.kind, r.frequency, r.next_due, r.auto_post ? 1 : 0, r.remaining_payments, r.id],
      );
    },
    async remove(id: string): Promise<void> {
      await db.run('DELETE FROM recurring WHERE id = ?', [id]);
    },
  };
}
