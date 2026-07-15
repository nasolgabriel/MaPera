import type { SqlDriver } from '../driver';
import type { Account } from './types';

type Row = Omit<Account, 'archived'> & { archived: number };

function toAccount(row: Row): Account {
  return { ...row, archived: !!row.archived };
}

export function createAccountsRepo(db: SqlDriver) {
  return {
    async create(a: Account): Promise<void> {
      await db.run(
        `INSERT INTO accounts (id, name, type, starting_balance, essence_color, archived, credit_limit, statement_day, due_day, points_rate)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [a.id, a.name, a.type, a.starting_balance, a.essence_color, a.archived ? 1 : 0, a.credit_limit, a.statement_day, a.due_day, a.points_rate],
      );
    },
    async getById(id: string): Promise<Account | null> {
      const rows = await db.query<Row>('SELECT * FROM accounts WHERE id = ?', [id]);
      return rows[0] ? toAccount(rows[0]) : null;
    },
    async list(): Promise<Account[]> {
      const rows = await db.query<Row>('SELECT * FROM accounts ORDER BY name');
      return rows.map(toAccount);
    },
    async update(a: Account): Promise<void> {
      await db.run(
        `UPDATE accounts SET name = ?, type = ?, starting_balance = ?, essence_color = ?, archived = ?,
         credit_limit = ?, statement_day = ?, due_day = ?, points_rate = ? WHERE id = ?`,
        [a.name, a.type, a.starting_balance, a.essence_color, a.archived ? 1 : 0, a.credit_limit, a.statement_day, a.due_day, a.points_rate, a.id],
      );
    },
    async remove(id: string): Promise<void> {
      await db.run('DELETE FROM accounts WHERE id = ?', [id]);
    },
  };
}
