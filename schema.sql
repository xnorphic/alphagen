-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  chat_id BIGINT NOT NULL,
  username VARCHAR(255),
  subscribed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Holdings table
CREATE TABLE IF NOT EXISTS holdings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticker VARCHAR(10) NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL,
  buy_price DECIMAL(10, 2) NOT NULL,
  buy_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, ticker)
);

-- Recommendations table
CREATE TABLE IF NOT EXISTS recommendations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_of DATE NOT NULL,
  portfolio_analysis JSONB,  -- Existing stocks analysis
  new_ideas JSONB,           -- 5-6 new stock ideas
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, week_of)
);

-- Analysis logs table
CREATE TABLE IF NOT EXISTS analysis_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Portfolio snapshots — one row per week, keyed by Monday date
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id             SERIAL PRIMARY KEY,
  week_of        DATE NOT NULL UNIQUE,
  holdings       JSONB NOT NULL,
  total_invested DECIMAL(12,2),
  total_value    DECIMAL(12,2),
  uploaded_at    TIMESTAMP DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_holdings_user_id      ON holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_user_id ON recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_analysis_logs_user_id  ON analysis_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_users_telegram_id      ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_week_of      ON portfolio_snapshots(week_of DESC);
