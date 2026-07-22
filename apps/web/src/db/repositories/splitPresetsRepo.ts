import type { SqlDriver } from '../driver';
import type { SplitPreset } from './types';

export function createSplitPresetsRepo(db: SqlDriver) {
  return {
    async create(p: SplitPreset): Promise<void> {
      await db.run(
        `INSERT INTO split_presets (id, name, buckets) VALUES (?, ?, ?)`,
        [p.id, p.name, p.buckets],
      );
    },
    async getById(id: string): Promise<SplitPreset | null> {
      const rows = await db.query<SplitPreset>('SELECT * FROM split_presets WHERE id = ?', [id]);
      return rows[0] ?? null;
    },
    async list(): Promise<SplitPreset[]> {
      return db.query<SplitPreset>('SELECT * FROM split_presets', []);
    },
    async update(p: SplitPreset): Promise<void> {
      await db.run(
        `UPDATE split_presets SET name = ?, buckets = ? WHERE id = ?`,
        [p.name, p.buckets, p.id],
      );
    },
    async remove(id: string): Promise<void> {
      await db.run('DELETE FROM split_presets WHERE id = ?', [id]);
    },
  };
}
