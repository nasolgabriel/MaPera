import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import type { SqlDriver } from '../driver';
import { CREATE_TABLES_SQL } from '../schema';

const DB_NAME = 'mapera';

// Real driver for device + browser (jeep-sqlite web fallback registered in main.ts).
export async function createCapacitorDriver(): Promise<SqlDriver> {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const db = await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
  await db.open();
  await db.execute(CREATE_TABLES_SQL);

  return {
    async run(sql: string, params: unknown[] = []) {
      await db.run(sql, params as unknown[]);
    },
    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
      const result = await db.query(sql, params as unknown[]);
      return (result.values ?? []) as T[];
    },
  };
}
