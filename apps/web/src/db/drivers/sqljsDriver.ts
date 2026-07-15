import initSqlJs, { type Database } from 'sql.js';
import type { SqlDriver } from '../driver';
import { CREATE_TABLES_SQL } from '../schema';

// In-memory sql.js driver. Used by tests only — real app uses capacitorDriver.
export async function createSqlJsDriver(): Promise<SqlDriver> {
  const SQL = await initSqlJs();
  const db: Database = new SQL.Database();
  db.run(CREATE_TABLES_SQL);

  return {
    async run(sql: string, params: unknown[] = []) {
      db.run(sql, params as (string | number | null)[]);
    },
    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
      const stmt = db.prepare(sql);
      stmt.bind(params as (string | number | null)[]);
      const rows: T[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as T);
      }
      stmt.free();
      return rows;
    },
  };
}
