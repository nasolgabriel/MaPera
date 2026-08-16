// App-level SQLite bootstrap. One shared connection for the whole app, opened
// lazily so a DB problem can never block the UI from mounting (see main.ts).
// Tests never import this — they build their own in-memory driver (sqljsDriver).
import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { createCapacitorDriver } from './drivers/capacitorDriver';
import type { SqlDriver } from './driver';
import { createAccountsRepo } from './repositories/accountsRepo';
import { createBudgetsRepo } from './repositories/budgetsRepo';
import { createGoalsRepo } from './repositories/goalsRepo';
import { createInvestmentValuesRepo } from './repositories/investmentValuesRepo';
import { createRecurringRepo } from './repositories/recurringRepo';
import { createSplitPresetsRepo } from './repositories/splitPresetsRepo';
import { createTransactionsRepo } from './repositories/transactionsRepo';
import { seed, seedBudgets, seedCreditCard, seedDailySpend, seedHistory, seedInvestments, seedRecurring, seedSavings, seedSplitPresets } from './seed';

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
  if (accounts.length === 0) {
    await seed(db);
  } else {
    if ((await createBudgetsRepo(db).list()).length === 0) {
      // Dev DBs created before B2 have no budgets — top up so the hub gauge has data.
      await seedBudgets(db);
    }
    if ((await createSplitPresetsRepo(db).list()).length === 0) {
      // Dev DBs created before B4 have no split presets — top up the starter preset.
      await seedSplitPresets(db);
    }
  }
  // Day-to-day spend lives outside seed() so tests keep the exact §8.1 totals; the app
  // wants it or the calendar heat strip and 7-day graph draw an empty month (E2).
  if ((await createTransactionsRepo(db).getById('txn-daily-01')) === null) {
    await seedDailySpend(db);
  }
  // Savings accounts + a goal (B5) — same test-preserving reason: app path only.
  if ((await createGoalsRepo(db).list()).length === 0) {
    await seedSavings(db);
  }
  // Investment value snapshots (B8) so the §6.3 MP2 row shows returns — app path only, runs
  // after seedSavings creates acc-mp2. Self-guards on the account + existing snapshots.
  if ((await createInvestmentValuesRepo(db).list()).length === 0) {
    await seedInvestments(db);
  }
  // Recurring auto-transfers + dues (B6) — app path only; the auto-transfer would perturb
  // §8.1 totals if it ran in tests, so it lives outside seed() like the others.
  if ((await createRecurringRepo(db).list()).length === 0) {
    await seedRecurring(db);
  }
  // Monthly history (B7) so the §6.4 trend charts have shape — app path only, same reason.
  if ((await createTransactionsRepo(db).getById('txn-h-2026-02-inc')) === null) {
    await seedHistory(db);
  }
  // Credit card + its charges/payment (B9) so the §7.8 health screen has the D3 scene to
  // draw — app path only (the charges move E(July)); self-guards on the account existing.
  await seedCreditCard(db);
  return db;
}

// Web has no native SQLite: @capacitor-community/sqlite is backed by jeep-sqlite,
// which stores data in IndexedDB and loads sql-wasm.wasm from /assets/. Native
// (Android) skips this entirely. Runs off the mount path, so a hang here degrades
// gracefully to "no data" instead of a blank screen.
async function initWebStoreIfNeeded(): Promise<void> {
  if (Capacitor.getPlatform() !== 'web') return;
  // jeep-sqlite is a Stencil component: importing the package does NOT register the
  // custom element — its lazy loader must be invoked, or whenDefined() waits forever.
  const { defineCustomElements } = await import('jeep-sqlite/loader');
  defineCustomElements(window);
  if (!document.querySelector('jeep-sqlite')) {
    document.body.appendChild(document.createElement('jeep-sqlite'));
  }
  await customElements.whenDefined('jeep-sqlite');
  await new SQLiteConnection(CapacitorSQLite).initWebStore();
}
