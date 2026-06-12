# SignalForge AI

SignalForge AI turns CoinMarketCap market signals into executable, backtestable trading strategy skills for BNB ecosystem assets.

It is built for **BNB Hack Track 2: Strategy Skills**. The project does not execute trades and does not connect to a wallet. Its goal is to generate a transparent strategy specification that can be compared, backtested, explained, and exported as JSON.

## Project Overview

Most AI trading demos only generate market commentary. SignalForge AI goes one step further:

```text
Market Data -> AI Strategy Skills -> Deterministic Backtest -> Exportable JSON
```

For each run, the app:

- Pulls live CoinMarketCap quote data when a CMC API key is available.
- Loads historical OHLCV candles from Binance public market data through CCXT.
- Computes technical indicators with Python.
- Generates three strategy candidates: Momentum, Mean Reversion, and Breakout.
- Runs a deterministic Python backtest for each strategy.
- Recommends the best risk-adjusted strategy.
- Exports a complete Strategy Skill JSON payload.

## Track 2 Fit

Track 2 focuses on Strategy Skills rather than real trade execution. SignalForge AI is intentionally scoped for that requirement:

- No login
- No database
- No wallet connection
- No custody
- No live order execution
- No financial advice

The deliverable is an inspectable strategy spec with deterministic metrics, not a black-box trading bot.

## Demo Features

- CoinMarketCap live data status
- Binance public OHLCV historical candles
- RSI, MACD, EMA, ATR indicator engine
- Three-strategy comparison table
- AI Final Verdict
- Confidence Score
- Market Regime
- Confidence Breakdown
- Rejected Strategy explanations
- Deterministic Python backtest
- Portfolio equity curve
- Benchmark curve
- Drawdown curve
- What-if risk simulator
- Copy and download Strategy JSON

## Data Sources

### CoinMarketCap

The backend calls CoinMarketCap when `CMC_API_KEY` is configured:

- Price
- 24h change
- 7d change
- Volume
- Market cap
- Fear and Greed value, used internally for reasoning and JSON context

If the CMC request fails or no API key is provided, the app falls back to deterministic demo market data and clearly marks the run as fallback data.

### Binance Public OHLCV

Historical candles are loaded from Binance public daily klines through CCXT. This provides real OHLCV history for supported assets such as:

- BNB
- CAKE
- TWT
- BTC
- ETH

If Binance data is unavailable, the backend uses deterministic fallback candles so the demo still runs.

## Strategy Generation

Each run generates three fixed strategy skill types:

1. Momentum
2. Mean Reversion
3. Breakout

Each strategy includes:

- Entry rules
- Exit rules
- Stop loss
- Take profit
- Position size
- Risk limits
- Backtest metrics
- Equity curve
- Benchmark curve
- Drawdown curve

The AI layer is presented as structured reasoning and strategy selection. The executable behavior remains deterministic and auditable in Python.

## Backtest Method

The FastAPI backend runs a deterministic long-only backtest over the selected OHLCV window.

Metrics include:

- Return
- Sharpe Ratio
- Win Rate
- Max Drawdown
- Risk Score

Risk Score is designed so higher values mean higher risk exposure. The recommendation uses a composite score that balances return, Sharpe Ratio, win rate, drawdown, and risk.

## Strategy JSON Export

The exported JSON includes:

- Asset
- Risk profile
- Horizon
- Indicators used
- Entry rules
- Exit rules
- Stop loss
- Take profit
- Position size
- Risk limits
- Backtest metrics
- Agent verdict
- Reasoning summary

This is the core Strategy Skill artifact for Track 2.

## Tech Stack

Frontend:

- Static HTML
- CSS
- Vanilla JavaScript
- No Vite runtime required

Backend:

- FastAPI
- Pydantic
- HTTPX
- CCXT
- pandas
- ta
- python-dotenv

## Local Setup

### 1. Configure environment

Create `.env` in the project root:

```text
CMC_API_KEY=your_coinmarketcap_key
```

The app still works without a key, but it will use fallback quote data.

### 2. Start backend

```powershell
cd apps/api
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8011 --log-level info
```

Backend docs:

```text
http://127.0.0.1:8011/docs
```

### 3. Start frontend

```powershell
cd apps/web
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5173
```

## Demo Flow

1. Open the frontend.
2. Select `BNB`.
3. Choose risk profile, horizon, and lookback days.
4. Click `Generate Strategy`.
5. Show the data source badge.
6. Show the agent workflow.
7. Show market indicators.
8. Show AI Final Verdict, Confidence Score, Market Regime, and Confidence Breakdown.
9. Show why the other strategies were rejected.
10. Show the three-strategy comparison table.
11. Show price candles, portfolio equity curve, benchmark curve, and drawdown curve.
12. Copy or download the Strategy JSON.

## Demo Script

See [DEMO_SCRIPT.md](./DEMO_SCRIPT.md) for a 90-second judge-facing demo script.

## Future Roadmap

- Wrap CMC access as an MCP tool server.
- Add BNB Chain-native signals such as gas, active addresses, PancakeSwap liquidity, TVL, and token launch activity.
- Add more strategy skill templates.
- Add a paper-trading-only simulation mode.
- Add strategy import/export compatibility with future BNB AI agent tooling.

## Safety

SignalForge AI is for hackathon demonstration, education, and research. It does not provide financial advice and does not execute trades.
