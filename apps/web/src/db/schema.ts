// Schema per README §7.1. All amounts are integer centavos. Dates are ISO strings (YYYY-MM-DD).
export const SCHEMA_VERSION = 1;

export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cash','ewallet','bank','investment','credit_card')),
  starting_balance INTEGER NOT NULL DEFAULT 0,
  essence_color TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  credit_limit INTEGER,
  statement_day INTEGER,
  due_day INTEGER,
  points_rate INTEGER
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('expense','income')),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS recurring (
  id TEXT PRIMARY KEY,
  template TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('subscription','loan','bill','transfer')),
  frequency TEXT NOT NULL CHECK (frequency IN ('monthly','custom')),
  next_due TEXT NOT NULL,
  auto_post INTEGER NOT NULL DEFAULT 0,
  remaining_payments INTEGER
);

CREATE TABLE IF NOT EXISTS saved_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  usual_price INTEGER NOT NULL,
  last_price INTEGER,
  category_id TEXT REFERENCES categories(id),
  kind TEXT NOT NULL CHECK (kind IN ('expense','income')),
  use_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  amount INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('expense','income','transfer')),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  to_account_id TEXT REFERENCES accounts(id),
  category_id TEXT REFERENCES categories(id),
  date TEXT NOT NULL,
  note TEXT,
  discount_rule_id TEXT,
  recurring_id TEXT REFERENCES recurring(id),
  saved_item_id TEXT REFERENCES saved_items(id)
);

CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id),
  month TEXT NOT NULL,
  cap_amount INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  target_amount INTEGER NOT NULL,
  deadline TEXT,
  account_id TEXT REFERENCES accounts(id),
  saved_amount INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS saving_periods (
  period TEXT PRIMARY KEY,
  saved_amount INTEGER NOT NULL,
  income_amount INTEGER NOT NULL,
  rate REAL,
  streak_counted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS split_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  buckets TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS investment_values (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  month TEXT NOT NULL,
  value INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS discount_logs (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  base_amount INTEGER NOT NULL
);
`;
