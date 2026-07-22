export interface Account {
  id: string;
  name: string;
  type: 'cash' | 'ewallet' | 'bank' | 'investment' | 'credit_card';
  starting_balance: number;
  essence_color: string;
  archived: boolean;
  credit_limit: number | null;
  statement_day: number | null;
  due_day: number | null;
  points_rate: number | null;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  kind: 'expense' | 'income';
  sort_order: number;
}

export interface Transaction {
  id: string;
  amount: number;
  kind: 'expense' | 'income' | 'transfer';
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  date: string;
  note: string | null;
  discount_rule_id: string | null;
  recurring_id: string | null;
  saved_item_id: string | null;
}

export interface Budget {
  id: string;
  category_id: string;
  month: string;
  cap_amount: number;
}

export interface Goal {
  id: string;
  name: string;
  target_amount: number;
  deadline: string | null;
  account_id: string | null;
  saved_amount: number;
}

export interface Recurring {
  id: string;
  template: string;
  kind: 'subscription' | 'loan' | 'bill' | 'transfer';
  frequency: 'monthly' | 'custom';
  next_due: string;
  auto_post: boolean;
  remaining_payments: number | null;
}

export interface SavedItem {
  id: string;
  name: string;
  description: string | null;
  usual_price: number;
  last_price: number | null;
  category_id: string | null;
  kind: 'expense' | 'income';
  use_count: number;
  last_used_at: string | null;
}

export interface SplitPreset {
  id: string;
  name: string;
  /** JSON array of split buckets — parse with domain/split parsePresetBuckets, never eval. */
  buckets: string;
}

export interface SavingPeriod {
  period: string;
  saved_amount: number;
  income_amount: number;
  rate: number | null;
  streak_counted: boolean;
}
