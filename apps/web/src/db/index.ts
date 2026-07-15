// App-level SQLite bootstrap. One shared connection for the whole app.
// Tests never import this — they build their own in-memory driver (sqljsDriver).
import { createCapacitorDriver } from './drivers/capacitorDriver';
import type { SqlDriver } from './driver';
import { createAccountsRepo } from './repositories/accountsRepo';
import { seed } from './seed';

let dbPromise: Promise<SqlDriver> | null = null;

/** Lazily open (and first-run seed) the app database. Idempotent. */
export function getDb(): Promise<SqlDriver> {
  if (!dbPromise) dbPromise = init();
  return dbPromise;
}

async function init(): Promise<SqlDriver> {
  const db = await createCapacitorDriver();
  // First launch: seed the §8.1 worked example so screens have data to show.
  // Real fresh-install empty-state handling is C4.
  const accounts = await createAccountsRepo(db).list();
  if (accounts.length === 0) await seed(db);
  return db;
}
