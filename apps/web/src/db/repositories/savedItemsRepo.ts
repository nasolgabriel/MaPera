import type { SqlDriver } from '../driver';
import type { SavedItem } from './types';

export function createSavedItemsRepo(db: SqlDriver) {
  return {
    async create(s: SavedItem): Promise<void> {
      await db.run(
        `INSERT INTO saved_items (id, name, description, usual_price, last_price, category_id, kind, use_count, last_used_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [s.id, s.name, s.description, s.usual_price, s.last_price, s.category_id, s.kind, s.use_count, s.last_used_at],
      );
    },
    async getById(id: string): Promise<SavedItem | null> {
      const rows = await db.query<SavedItem>('SELECT * FROM saved_items WHERE id = ?', [id]);
      return rows[0] ?? null;
    },
    async list(): Promise<SavedItem[]> {
      return db.query<SavedItem>('SELECT * FROM saved_items ORDER BY use_count DESC, last_used_at DESC');
    },
    async update(s: SavedItem): Promise<void> {
      await db.run(
        `UPDATE saved_items SET name = ?, description = ?, usual_price = ?, last_price = ?, category_id = ?,
         kind = ?, use_count = ?, last_used_at = ? WHERE id = ?`,
        [s.name, s.description, s.usual_price, s.last_price, s.category_id, s.kind, s.use_count, s.last_used_at, s.id],
      );
    },
    async remove(id: string): Promise<void> {
      await db.run('DELETE FROM saved_items WHERE id = ?', [id]);
    },
  };
}
