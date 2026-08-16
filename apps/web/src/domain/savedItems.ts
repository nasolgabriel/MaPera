import type { SavedItem } from '../db/repositories/types';

export const SUGGESTION_LIMIT = 5;

const PREFIX = 0;
const WORD_PREFIX = 1;
const SUBSTRING = 2;
const FUZZY = 3;
const NO_MATCH = 4;

function isSubsequence(query: string, text: string): boolean {
  let q = 0;
  for (const ch of text) {
    if (ch === query[q]) q += 1;
    if (q === query.length) return true;
  }
  return query.length === 0;
}

function matchTier(name: string, query: string): number {
  if (name.startsWith(query)) return PREFIX;
  if (name.split(/\s+/).some((word) => word.startsWith(query))) return WORD_PREFIX;
  if (name.includes(query)) return SUBSTRING;
  return isSubsequence(query, name) ? FUZZY : NO_MATCH;
}

export function matchSavedItems(
  items: SavedItem[],
  query: string,
  limit = SUGGESTION_LIMIT,
): SavedItem[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  return items
    .map((item) => ({ item, tier: matchTier(item.name.toLowerCase(), q) }))
    .filter((row) => row.tier !== NO_MATCH)
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        b.item.use_count - a.item.use_count ||
        (b.item.last_used_at ?? '').localeCompare(a.item.last_used_at ?? '') ||
        a.item.name.localeCompare(b.item.name),
    )
    .slice(0, limit)
    .map((row) => row.item);
}

export function suggestedPrice(item: SavedItem): number {
  return item.last_price ?? item.usual_price;
}

export function touchSavedItem(item: SavedItem, priceCentavos: number, atISO: string): SavedItem {
  return {
    ...item,
    last_price: priceCentavos,
    use_count: item.use_count + 1,
    last_used_at: atISO,
  };
}
