# ICT Mentor Bot — Master Goal List

## Vision
An AI-powered trading journal and mentor app built specifically for ICT (Inner Circle Trader) methodology. Unlike Tradezella ($29-49/mo) or SuperTrader ($75/yr), this app's AI is trained on ICT's actual YouTube teachings — not generic trading advice.

---

## Phase 1: Core Trade Journal (DONE)
- [x] Manual trade entry (pair, direction, entry, exit, auto P/L calc)
- [x] Chart screenshot upload + storage
- [x] Trade reasoning field (ICT concepts)
- [x] AI analysis via Claude or Gemini with vision
- [x] Trade history with stats (win rate, total pips, avg pips)
- [x] Filter by pair, direction, result
- [x] SQLite persistence
- [x] Dark theme trading aesthetic

## Phase 2: ICT Knowledge Base + RAG
- [ ] Parse + clean 741 ICT transcripts from USB
- [ ] Tag transcripts by ICT concept (OB, FVG, MSS, OTE, etc.)
- [ ] Semantic chunking (500-1000 tokens per chunk)
- [ ] Embed into ChromaDB vector database
- [ ] RAG pipeline — retrieve relevant ICT teachings during analysis
- [ ] AI references specific videos + timestamps in feedback
- [ ] Knowledge base management page (view videos, chunks, concepts)

## Phase 3: Daily Journal (inspired by SuperTrader)
- [ ] Daily journal page (separate from individual trade entries)
- [ ] Date navigation (arrows, "Today" button)
- [ ] Daily P&L summary
- [ ] Mental State assessment (/10 score)
      - Sleep, Energy, Focus, Mood, Stress, Caffeine sliders
      - Trading Readiness recommendation
- [ ] ICT Strategies Used Today — quick-select chips:
      - OB Entry, FVG Fill, Liquidity Sweep, OTE Entry
      - Silver Bullet, Breaker Block, MSS/BOS Trade
      - Power of 3 Play, Macro Entry, Mitigation Block
- [ ] Market & Emotions section
      - Market conditions dropdown (Trending, Ranging, Choppy, News-driven)
      - Emotional state chips (Confident, Calm, Anxious, Frustrated, Neutral, Excited, Fearful, Greedy, Disciplined, Revenge)
- [ ] Daily Reflection — freeform text
- [ ] Mistakes Made — quick-select chips:
      - Broke Rules, FOMO Entry, Revenge Trading, Overtrading
      - Ignored Stop Loss, Moved Stop Loss, Position Too Large
      - Exited Too Early, Exited Too Late, Chased Entry
      - Emotional Decision, Poor Risk/Reward, Wrong Timeframe
      - Traded Outside Kill Zone, Ignored Signals, No Confluence
      - Additional notes field
- [ ] Lessons & Improvements — two fields:
      - "Lessons Learned" (what did you learn today?)
      - "Tomorrow's Improvements" (specific, actionable goals)
- [ ] Chart Screenshots & Attachments for the day
- [ ] Save Entry button + View in Calendar link

## Phase 4: Performance Calendar & Analytics
- [ ] Calendar view — monthly grid, color-coded daily P&L (green/red/gray)
- [ ] Week / Month / Year / All Time toggles
- [ ] Summary bar (Monthly P&L, Total Trades, Trading Days, Win/Losing Days, Win Rate)
- [ ] Equity curve chart
- [ ] Performance breakdown by:
      - Pair / instrument
      - Kill zone / session (London, NY, Asia, London Close)
      - ICT setup type (OB, FVG, MSS, OTE, etc.)
      - Day of week
      - Time of day
- [ ] Win/loss streak tracking
- [ ] Drawdown tracking + max drawdown
- [ ] Risk-reward analysis (avg R:R on winners vs losers)
- [ ] Profit factor
- [ ] Mental state correlation (do you trade better rested? calm?)
- [ ] Best/worst setup identification

## Phase 5: Dashboard & Gamification (inspired by SuperTrader)
- [ ] Dashboard home page with widgets:
      - Total P&L, Win Rate, Profit Factor, Max Drawdown
      - Equity curve mini-chart
      - Recent trades list
      - Activity streaks
- [ ] Streaks tracking:
      - Rules followed streak
      - Profitable day streak
      - Journal entry streak
      - Mental state logged streak
- [ ] Achievement badges:
      - First Trade Logged
      - 7-Day Journal Streak
      - First Profitable Week
      - 10 Trades Analyzed by AI
      - ICT Concept Master (used all setup types)
      - Risk Warrior (maintained R:R > 2 for a week)
      - Kill Zone Discipline (only traded during kill zones for a week)
- [ ] Daily ICT tip / concept of the day (pulled from knowledge base)
- [ ] AI Insights tab (patterns the AI notices across your trades)

## Phase 6: Shareable / Multi-User
- [ ] User authentication (login/signup)
- [ ] Cloud database (Supabase or similar, replace SQLite)
- [ ] Shareable trade reviews (public links)
- [ ] Mentor mode — let others view your journal (read-only)
- [ ] Deploy to web (Streamlit Cloud, Railway, or custom hosting)
- [ ] User settings / preferences

## Phase 7: Power Features (stretch goals)
- [ ] Broker auto-import (MT4/MT5 CSV, OANDA API)
- [ ] Playbook system — define ICT setup rules, track compliance per trade
- [ ] Pre-trade checklist (customizable)
- [ ] Watchlist page
- [ ] Economic events calendar
- [ ] TradingView chart integration
- [ ] Backtesting with 1-min data (NAS100, SPX, NQ CSVs from USB)
- [ ] Trade replay
- [ ] AI pattern recognition across trade history
- [ ] Learning Hub — structured ICT curriculum from knowledge base

---

## Tech Stack
- **Frontend**: Streamlit (Phase 1-5), possibly Next.js later for multi-user
- **Backend**: Python
- **Database**: SQLite (local) → Supabase (cloud, Phase 6)
- **AI**: Claude API + Gemini API (switchable)
- **Knowledge Base**: ChromaDB + sentence-transformers embeddings
- **Transcript Source**: 741 ICT YouTube transcripts (USB drive)
- **Compute Split**: MacBook Air (app + UI) / Mac Mini with Codex (heavy processing)

## Competitive Edge
Neither Tradezella nor SuperTrader has:
1. AI trained on ICT's actual teachings (741 videos worth)
2. ICT-specific setup tagging and analysis
3. Kill zone awareness in analytics
4. RAG-powered mentoring that references specific ICT lessons
