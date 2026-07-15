import type { SqlDriver } from '../driver';
import type { Category } from './types';

export function createCategoriesRepo(db: SqlDriver) {
  return {
    async create(c: Category): Promise<void> {
      await db.run(
        `INSERT INTO categories (id, name, icon, kind, sort_order) VALUES (?, ?, ?, ?, ?)`,
        [c.id, c.name, c.icon, c.kind, c.sort_order],
      );
    },
    async getById(id: string): Promise<Category | null> {
      const rows = await db.query<Category>('SELECT * FROM categories WHERE id = ?', [id]);
      return rows[0] ?? null;
    },
    async list(): Promise<Category[]> {
      return db.query<Category>('SELECT * FROM categories ORDER BY sort_order');
    },
    async update(c: Category): Promise<void> {
      await db.run(
        `UPDATE categories SET name = ?, icon = ?, kind = ?, sort_order = ? WHERE id = ?`,
        [c.name, c.icon, c.kind, c.sort_order, c.id],
      );
    },
    async remove(id: string): Promise<void> {
      await db.run('DELETE FROM categories WHERE id = ?', [id]);
    },
  };
}
