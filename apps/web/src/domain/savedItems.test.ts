import { describe, it, expect } from 'vitest';
import type { SavedItem } from '../db/repositories/types';
import { matchSavedItems, suggestedPrice, touchSavedItem } from './savedItems';

function item(p: Partial<SavedItem> & Pick<SavedItem, 'id' | 'name'>): SavedItem {
  return {
    description: null, usual_price: 2600, last_price: null, category_id: 'cat-food',
    kind: 'expense', use_count: 0, last_used_at: null,
    ...p,
  };
}

const sardines = item({
  id: 'si-sardines', name: 'Ligo Sardines', description: '155g easy-open',
  usual_price: 2600, use_count: 23, last_used_at: '2026-07-12',
});
const pandesal = item({
  id: 'si-pandesal', name: 'Ligaya Bakery pandesal',
  usual_price: 4000, use_count: 9, last_used_at: '2026-07-13',
});
const load = item({
  id: 'si-load', name: 'Globe load', usual_price: 5000, use_count: 40, last_used_at: '2026-07-14',
});
const library = [pandesal, load, sardines];

describe('matchSavedItems (§7.6 type-ahead)', () => {
  it('suggests nothing until something is typed', () => {
    expect(matchSavedItems(library, '')).toEqual([]);
    expect(matchSavedItems(library, '   ')).toEqual([]);
  });

  it('"Lig" suggests Ligo Sardines first', () => {
    const hits = matchSavedItems(library, 'Lig');
    expect(hits.map((i) => i.id)).toEqual(['si-sardines', 'si-pandesal']);
  });

  it('ranks by use_count then recency inside a tier', () => {
    const older = item({ id: 'si-a', name: 'Milo bar', use_count: 5, last_used_at: '2026-07-01' });
    const newer = item({ id: 'si-b', name: 'Milo sachet', use_count: 5, last_used_at: '2026-07-10' });
    const most = item({ id: 'si-c', name: 'Milo drink', use_count: 6, last_used_at: '2026-01-01' });
    const hits = matchSavedItems([older, newer, most], 'milo');
    expect(hits.map((i) => i.id)).toEqual(['si-c', 'si-b', 'si-a']);
  });

  it('never lets a heavily-used fuzzy hit outrank a closer match', () => {
    expect(matchSavedItems([sardines, load], 'lo').map((i) => i.id)).toEqual(['si-load', 'si-sardines']);
    const heavy = item({ id: 'si-hi', name: 'Globe load', use_count: 99 });
    const rare = item({ id: 'si-lo', name: 'Gobyerno fee', use_count: 1 });
    expect(matchSavedItems([heavy, rare], 'gob').map((i) => i.id)).toEqual(['si-lo', 'si-hi']);
  });

  it('matches a later word by its own prefix', () => {
    expect(matchSavedItems(library, 'sar').map((i) => i.id)).toEqual(['si-sardines']);
    expect(matchSavedItems(library, 'bakery').map((i) => i.id)).toEqual(['si-pandesal']);
  });

  it('matches a substring and a gapped subsequence, and is case-insensitive', () => {
    expect(matchSavedItems([sardines], 'ARDIN').map((i) => i.id)).toEqual(['si-sardines']);
    expect(matchSavedItems([sardines], 'lgsrd').map((i) => i.id)).toEqual(['si-sardines']);
  });

  it('drops items whose letters are not all there, in order', () => {
    expect(matchSavedItems([sardines], 'zebra')).toEqual([]);
    expect(matchSavedItems([sardines], 'sl')).toEqual([]);
  });

  it('honours the suggestion limit', () => {
    const many = Array.from({ length: 9 }, (_, n) =>
      item({ id: `si-${n}`, name: `Bread ${n}`, use_count: n }),
    );
    expect(matchSavedItems(many, 'bread')).toHaveLength(5);
    expect(matchSavedItems(many, 'bread', 2).map((i) => i.id)).toEqual(['si-8', 'si-7']);
  });

  it('is a stable total order — never-used items sort last, not randomly', () => {
    const fresh = item({ id: 'si-new', name: 'Bread roll' });
    const used = item({ id: 'si-old', name: 'Bread loaf', use_count: 1, last_used_at: '2026-01-02' });
    expect(matchSavedItems([fresh, used], 'bread').map((i) => i.id)).toEqual(['si-old', 'si-new']);
  });
});

describe('suggestedPrice / touchSavedItem', () => {
  it('prefills the usual price until the item has been logged once', () => {
    expect(suggestedPrice(sardines)).toBe(2600);
    expect(suggestedPrice({ ...sardines, last_price: 2800 })).toBe(2800);
  });

  it('records the price actually logged, bumps use_count, moves recency', () => {
    const after = touchSavedItem(sardines, 2800, '2026-07-14');
    expect(after.use_count).toBe(24);
    expect(after.last_price).toBe(2800);
    expect(after.last_used_at).toBe('2026-07-14');
    expect(after.usual_price).toBe(2600);
    expect(sardines.use_count).toBe(23);
  });
});
