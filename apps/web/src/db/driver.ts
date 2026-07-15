// Minimal driver interface repositories code against.
// Real implementations: capacitorDriver.ts (device/browser via @capacitor-community/sqlite),
// sqljsDriver.ts (Vitest, in-memory).
export interface SqlDriver {
  run(sql: string, params?: unknown[]): Promise<void>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}
