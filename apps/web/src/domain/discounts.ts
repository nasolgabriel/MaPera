import type { DiscountLog, Transaction } from '../db/repositories/types';

export const VAT_BP = 1200;
export const QUARTER_PESO = 25;

export type DiscountRounding = 'quarter_peso' | 'none';
export type DiscountRole = 'student' | 'senior' | 'pwd';
export type FareMode = 'jeepney' | 'bus_train';

export interface DiscountRule {
  id: string;
  category: string;
  mode: string;
  role: string;
  label: string;
  rate_bp: number;
  vat_exempt: boolean;
  rounding: DiscountRounding;
}

export interface DiscountRuleSet {
  version: number;
  updated: string;
  rules: DiscountRule[];
}

export interface DiscountResult {
  base: number;
  discounted: number;
  kept: number;
}

export function roundToQuarterPeso(centavos: number): number {
  return Math.round(centavos / QUARTER_PESO) * QUARTER_PESO;
}

export function removeVat(centavos: number): number {
  return Math.round((centavos * 10000) / (10000 + VAT_BP));
}

export function applyDiscount(baseCentavos: number, rule: DiscountRule): DiscountResult {
  const preDiscount = rule.vat_exempt ? removeVat(baseCentavos) : baseCentavos;
  const scaled = preDiscount * (10000 - rule.rate_bp);
  const discounted =
    rule.rounding === 'quarter_peso'
      ? Math.round(scaled / (10000 * QUARTER_PESO)) * QUARTER_PESO
      : Math.round(scaled / 10000);
  return { base: baseCentavos, discounted, kept: baseCentavos - discounted };
}

export function findRule(
  rules: DiscountRule[],
  role: string,
  mode: string,
): DiscountRule | null {
  return rules.find((r) => r.role === role && r.mode === mode) ?? null;
}

export function ratePercent(rule: DiscountRule): number {
  return rule.rate_bp / 100;
}

export function discountSaved(
  logs: DiscountLog[],
  transactions: Transaction[],
  year: string,
): number {
  const byId = new Map(transactions.map((t) => [t.id, t]));
  return logs.reduce((sum, log) => {
    const txn = byId.get(log.transaction_id);
    if (txn === undefined || !txn.date.startsWith(year)) return sum;
    return sum + (log.base_amount - txn.amount);
  }, 0);
}
