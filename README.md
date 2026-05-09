# Alpha-Gen

AI-powered quantitative portfolio dashboard with a Telegram bot for weekly trade recommendations.

## Architecture

```
Browser (React SPA)
  └── Upload screenshots → Claude Vision extracts holdings
  └── AI signals → OpenAI / Claude Haiku (batch) + Claude Sonnet (deep dive)
  └── On extract → POST /api/sync-portfolio → Supabase (updates holdings + snapshot)

Vercel (Serverless Functions)
  ├── /api/telegram          — Telegram webhook handler
  ├── /api/sync-portfolio    — Syncs app portfolio to database
  ├── /api/anthropic         — Claude API proxy
  ├── /api/openai            — OpenAI API proxy
  └── /api/cron/weekly-recommendations — Triggered by EasyCron every Sunday

Supabase (PostgreSQL)
  ├── users                  — Telegram users + subscription state
  ├── holdings               — Current portfolio per user
  ├── portfolio_snapshots    — Week-on-week history (keyed by Monday date)
  ├── recommendations        — Stored weekly analysis output
  └── analysis_logs          — Cron run audit trail

Telegram Bot
  ├── /portfolio             — Live holdings (stocks + ETFs separated)
  ├── /analyze               — On-demand AI signals (same model as app)
  ├── /subscribe             — Weekly Sunday recommendations
  └── /add, /remove          — Manual portfolio edits
```

## Dependencies

| Package | Purpose |
|---|---|
| `react` 18 | UI framework |
| `vite` | Build tool |
| `@supabase/supabase-js` | Database client |
| `node-telegram-bot-api` | Telegram Bot API |
| Anthropic Claude API | Vision extraction, signal generation, deep-dive analysis |
| OpenAI API | Signal generation (primary), Claude as fallback |

## Setup

### 1. Install

```bash
npm install
```

### 2. Environment variables

```bash
cp .env.example .env
```

Required:
```
VITE_ANTHROPIC_API_KEY=
VITE_OPENAI_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
SUPABASE_URL=
SUPABASE_ANON_KEY=
DATABASE_URL=
```

### 3. Database

Run `schema.sql` in the Supabase SQL Editor, then disable RLS:

```sql
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE holdings DISABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations DISABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_snapshots DISABLE ROW LEVEL SECURITY;
```

### 4. Run locally

```bash
npm run dev
```

Login: `xnorphic` / `!Welcome1234`

### 5. Deploy

```bash
npx vercel deploy --prod
```

Set all env vars in Vercel project settings. Register the Telegram webhook:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-app.vercel.app/api/telegram&secret_token=<WEBHOOK_SECRET>"
```

### 6. Weekly cron (EasyCron)

POST `https://your-app.vercel.app/api/cron/weekly-recommendations?secret=<WEBHOOK_SECRET>` — schedule `30 3 * * 0` (Sunday 9 AM IST).

## License

MIT
