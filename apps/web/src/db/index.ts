// App-level SQLite bootstrap. One shared connection for the whole app, opened
// lazily so a DB problem can never block the UI from mounting (see main.ts).
// Tests never import this — they build their own in-memory driver (sqljsDriver).
import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
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
  await initWebStoreIfNeeded();
  const db = await createCapacitorDriver();
  // First launch: seed the §8.1 worked example so screens have data to show.
  // Real fresh-install empty-state handling is C4.
  const accounts = await createAccountsRepo(db).list();
  if (accounts.length === 0) await seed(db);
  return db;
}

// Web has no native SQLite: @capacitor-community/sqlite is backed by jeep-sqlite,
// which stores data in IndexedDB and loads sql-wasm.wasm from /assets/. Native
// (Android) skips this entirely. Runs off the mount path, so a hang here degrades
// gracefully to "no data" instead of a blank screen.
async function initWebStoreIfNeeded(): Promise<void> {
  if (Capacitor.getPlatform() !== 'web') return;
  await import('jeep-sqlite');
  if (!document.querySelector('jeep-sqlite')) {
    document.body.appendChild(document.createElement('jeep-sqlite'));
  }
  await customElements.whenDefined('jeep-sqlite');
  await new SQLiteConnection(CapacitorSQLite).initWebStore();
}
