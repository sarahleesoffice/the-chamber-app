# The Chamber — Trading Platform

A full-stack AI-powered trading platform for ICT methodology traders. Includes an AI mentor chat, trade journal, performance analytics, market tools, and a structured learning hub — all built around Inner Circle Trader (ICT) concepts.

**Live:** [chamber-app-ruby.vercel.app](https://chamber-app-ruby.vercel.app)

---

## Architecture Overview

```
Client (Browser)
    |
    v
Vercel Edge Network (CDN + SSL + DDoS protection)
    |
    v
Next.js 16 (App Router + Turbopack)
    |
    +---> Supabase Auth (JWT sessions, email/password)
    |
    +---> Supabase PostgreSQL (trades, journal, knowledge base, RLS)
    |         + pgvector extension (semantic search on ICT transcripts)
    |
    +---> Anthropic Claude API (AI mentor chat + trade analysis)
    |         or Google Gemini API (user's choice, key stored encrypted)
    |
    +---> Yahoo Finance (real-time quotes + OHLCV candles)
    |
    +---> Forex Factory XML (economic calendar)
    |
    +---> Financial Juice RSS (live market news)
    |
    +---> Supabase Storage (chart image uploads for AI analysis)
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | Next.js 16 (App Router) | SSR, API routes, middleware, route groups |
| **Language** | TypeScript | Type safety across frontend and backend |
| **Styling** | Tailwind CSS | Custom design system with `chamber-*` color tokens |
| **Database** | Supabase PostgreSQL | All user data, trades, journal, knowledge base |
| **Vector Search** | pgvector (Supabase) | Semantic similarity search over ICT transcripts |
| **Auth** | Supabase Auth | JWT sessions, httpOnly cookies, email/password |
| **AI** | Anthropic Claude / Google Gemini | Trade analysis, ICT mentor chat with RAG |
| **Storage** | Supabase Storage | Chart image uploads (public bucket for AI access) |
| **Deployment** | Vercel | CI/CD, edge functions, auto-deploys |
| **Security** | Row Level Security (RLS) | Database-level per-user data isolation |

---

## System Design

### Authentication Flow

```
User signs up (email/password)
    |
    v
Supabase Auth creates JWT session --> stored in httpOnly cookies
    |
    v
Database trigger fires --> creates profile row in `profiles` table
    |
    v
Next.js Proxy (middleware) intercepts every request:
    - No session + protected route? --> redirect to /login
    - Has session + trying /login or /signup? --> redirect to /dashboard
    |
    v
Server Components read session from cookies (zero client-side auth state)
```

- **Session management** handled entirely server-side via Supabase SSR helpers
- **Proxy runs at the edge** on every request, validating JWTs before the page renders
- **No client-side token storage** — cookies are httpOnly, managed by Next.js + Supabase

---

### AI Chat & RAG Flow

```
User sends message to /api/ai-chat
    |
    v
Server decrypts user's API key (AES-256-GCM) from user_api_keys table
    |
    v
RAG enrichment (3 parallel sources):
    |
    +---> search_knowledge_text() RPC on knowledge_chunks
    |         (675+ ICT YouTube transcript excerpts, full-text + ILIKE fallback)
    |
    +---> Query gamma_cards table
    |         (ICT study slides, matched by concept keyword)
    |
    +---> Query discord_references table
    |         (Community ICT discussions, matched by concept)
    |
    v
Combined context injected into system prompt as RAG material
    |
    v
POST to Anthropic Claude API or Google Gemini API
    (Model: claude-sonnet-4 or gemini-2.0-flash, user's choice)
    |
    v
Response + study materials (cards, slides, discord links) returned to client
```

---

### AI Trade Analysis Flow

```
User submits trade for analysis (pair, direction, entry, exit, reasoning, optional chart images)
    |
    v
Server decrypts user's API key from database
    |
    v
Chart images (if any) fetched from Supabase Storage public URLs
    (Base64 encoded for multimodal AI input)
    |
    v
POST to Claude or Gemini with ICT analysis system prompt
    Evaluates across: Market Structure, Liquidity, OB/FVG, Kill Zones,
    Premium/Discount, OTE, AMD Model, Displacement, RR
    |
    v
Returns: Score (0-100), section-by-section feedback, strengths, improvements
    |
    v
Analysis saved to `analyses` table (linked to trade)
```

---

### Route Architecture & Access Control

```
app/
  page.tsx                    # Public home (redirects to dashboard if authed)
  login/page.tsx              # Public
  signup/page.tsx             # Public
  risk-disclaimer/page.tsx    # Public

  (app)/                      # Auth-gated route group
    layout.tsx                # Renders Ticker + Sidebar shell, checks session
    (paid)/                   # Subscription-gated route group
      layout.tsx              # Checks subscription_status === "active"
      dashboard/              # Trading dashboard
      enter-trade/            # Manual trade entry
      trade-history/          # Trade log
      import-trades/          # CSV bulk import
      pre-trade/              # Pre-trade checklist
      journal/                # Daily psychology journal
      performance/            # Analytics & metrics
      ai-chat/                # ICT AI mentor (RAG)
      ai-analysis/            # AI trade scoring
      market-review/          # Market structure bias tool
      sessions/               # Session windows
      learning-hub/           # ICT curriculum (16 topics, 5 levels)
      knowledge-base/         # Knowledge chunk search
      economic-calendar/      # Forex Factory events
      live-news/              # Financial Juice headlines
      watchlist/              # Currency pair tracker
      settings/               # API key management

  api/
    auth/callback/            # OAuth redirect handler
    ai-chat/                  # RAG AI mentor endpoint
    ai-analysis/              # Trade scoring endpoint
    knowledge-search/         # Knowledge chunk full-text search
    yahoo-quote/              # Real-time market quotes
    yahoo-candles/            # OHLCV candle data
    forex-calendar/           # Economic calendar (Forex Factory)
    news/                     # Live news (Financial Juice)
```

**Key design decision:** Next.js route groups `(app)` and `(paid)` enable **nested layout composition** — subscription checks only apply to paid routes while sharing the same sidebar, ticker, and auth layer. Adding free features requires zero changes to existing paywall logic.

---

### Database Schema

```sql
-- Row Level Security enabled on all tables
-- All user data is isolated at the database level

profiles
    id                   UUID (FK → auth.users, PK)
    email                TEXT
    display_name         TEXT
    subscription_status  TEXT ('active' | 'trialing' | 'canceled' | 'none')
    stripe_customer_id   TEXT
    created_at / updated_at  TIMESTAMPTZ

trades
    id          UUID (PK)
    user_id     UUID (FK → auth.users)
    pair        TEXT (e.g. "EUR/USD", "NQ")
    direction   TEXT ('long' | 'short')
    entry_price / exit_price  NUMERIC
    pnl_pips / pnl_dollar     NUMERIC
    trade_date  DATE
    reasoning   TEXT
    chart_url   TEXT

analyses
    id            UUID (PK)
    user_id       UUID
    trade_id      UUID (FK → trades)
    provider      TEXT ('claude' | 'gemini')
    model         TEXT
    analysis_text TEXT
    score         INTEGER (0–100)

journal_entries
    id              UUID (PK)
    user_id         UUID
    journal_date    DATE
    sleep / energy / focus / mood / stress / confidence  INTEGER (1–10)
    readiness_score INTEGER (computed average)
    emotional_states    JSONB
    mistakes            JSONB
    ict_setups_used     JSONB
    market_condition    TEXT
    reflection / lessons_learned / tomorrows_improvements  TEXT
    UNIQUE(user_id, journal_date)

watchlist
    id          UUID (PK)
    user_id     UUID
    pair        TEXT
    bias        TEXT ('bullish' | 'bearish' | 'neutral')
    timeframe   TEXT
    key_levels  TEXT
    notes       TEXT
    setup_type  TEXT
    alert_price NUMERIC
    active      BOOLEAN

user_api_keys
    id            UUID (PK)
    user_id       UUID
    provider      TEXT ('anthropic' | 'gemini')
    encrypted_key TEXT  -- AES-256-GCM encrypted
    UNIQUE(user_id, provider)

-- Knowledge Base (pgvector RAG)
knowledge_chunks
    id            UUID (PK)
    content       TEXT (transcript excerpt)
    embedding     vector(384)  -- sentence-transformers all-MiniLM-L6-v2
    source_video  TEXT
    source_url    TEXT
    tags          TEXT[]
    chunk_index   INTEGER
    -- IVFFlat index (cosine) + GIN full-text index

gamma_cards
    id           UUID (PK)
    title        TEXT
    content      TEXT
    category     TEXT
    slide_number INTEGER
    deck_name    TEXT
    gamma_url    TEXT
    tags         TEXT[]

discord_references
    id           UUID (PK)
    concept      TEXT
    thread_title TEXT
    thread_url   TEXT
    channel_name TEXT
    description  TEXT
    tags         TEXT[]
```

- **Auto-profile creation** via PostgreSQL trigger on `auth.users` insert
- **RLS policies** enforce data isolation at the database level — even if app code has bugs, users cannot access each other's data
- **pgvector IVFFlat index** enables fast cosine similarity search over 675+ transcript embeddings
- **Full-text search fallback** with `ts_rank_cd` scoring + ILIKE for short/partial queries

---

### Security Architecture

| Layer | Implementation |
|-------|---------------|
| **Transport** | HTTPS enforced via Vercel edge network |
| **Authentication** | JWT tokens in httpOnly cookies (not localStorage) |
| **Authorization** | Proxy (middleware) validates session on every request before rendering |
| **Data isolation** | PostgreSQL Row Level Security — `WHERE auth.uid() = user_id` |
| **API key storage** | AES-256-GCM encryption, `AI_KEY_ENCRYPTION_SECRET` server-only env var |
| **API key exposure** | Keys decrypted server-side only, never returned to client |
| **CSRF protection** | Built-in Next.js protections + SameSite cookie attributes |
| **Storage access** | Chart bucket policies restrict uploads to `charts/{user_id}/` prefix |

---

### Responsive Design

- **Desktop:** Fixed 240px sidebar, real-time ticker bar pinned at top, full-width content area
- **Mobile:** Sidebar hidden by default, hamburger menu (☰) below ticker with slide-in animation and backdrop overlay
- **Breakpoint:** Tailwind `md:` (768px) controls sidebar visibility
- **Viewport:** Explicit `width=device-width, initial-scale=1` meta tag ensures Tailwind responsive classes fire correctly on all phones

---

## Key Features

### Trading
- Manual trade entry with automatic pip & dollar P&L calculation
- Bulk CSV trade import
- Full trade history with filtering
- Pre-trade ICT checklist
- Performance analytics: win rate, profit factor, max drawdown, Sharpe ratio, streak tracking

### AI (Bring Your Own API Key)
- **ICT Mentor Chat** — RAG over 675+ ICT YouTube transcripts, Gamma study cards, and Discord references. Answers questions about any ICT concept with citations and study materials
- **Trade Analysis** — Evaluates trades against the full ICT framework and returns a 0–100 score with section-by-section feedback
- **Market Review** — Analyses HTF/LTF chart bias using ICT market structure principles
- Supports both **Anthropic Claude** and **Google Gemini** — user pastes their own key in Settings, stored AES-256-GCM encrypted

### Knowledge Base
- 675+ ICT YouTube lecture transcripts indexed with pgvector
- Semantic similarity search via sentence-transformers embeddings
- Full-text keyword search fallback
- **Learning Hub** — 5-level structured ICT curriculum (Foundation → Advanced → Risk & Psychology), 16 topics with detailed lesson notes

### Market Tools
- Real-time scrolling ticker: NQ, ES, YM, Gold, Silver, BTC, ETH, DXY (Yahoo Finance, 60s refresh)
- Economic calendar with impact levels (Forex Factory)
- Live news feed with auto-categorisation (Financial Juice)
- Currency pair watchlist with bias and key levels

### Reflection
- Daily journal: 6 mental metrics (sleep, energy, focus, mood, stress, confidence)
- Readiness score + trading recommendation label
- Emotional state and mistake tracking
- Monthly calendar heatmap

---

## Development

```bash
npm install
cp .env.local.example .env.local   # Fill in your keys

# Required env vars:
# NEXT_PUBLIC_SUPABASE_URL
# NEXT_PUBLIC_SUPABASE_ANON_KEY
# AI_KEY_ENCRYPTION_SECRET          (min 32 characters)

npm run dev        # http://localhost:3000
```

### Database Setup
```bash
# Apply all migrations to your Supabase project
supabase db push

# Or run manually in Supabase SQL editor:
# supabase/migrations/001_base_schema.sql
# supabase/migrations/002_trades_and_tools.sql
# supabase/migrations/003_storage_bucket.sql
# supabase/migrations/004_pgvector_rag.sql
# supabase/migrations/005_gamma_and_discord.sql
```

---

## Deployment

Deployed on **Vercel** with automatic deploys from the `main` branch.

```bash
npx vercel --prod --yes
```

Environment variables must be set in the Vercel dashboard under Settings → Environment Variables.

---

*THIS IS NOT FINANCIAL ADVICE. All content is for educational purposes based on publicly available ICT methodology.*

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
