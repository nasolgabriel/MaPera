import { afterEach, beforeEach, vi } from 'vitest';

export const SEED_TODAY = '2026-07-14';

export function pinSeedClock(): void {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${SEED_TODAY}T09:00:00`));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
}
