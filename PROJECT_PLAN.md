# SignalForge AI Upgraded Project Plan

## 1. Track Fit

SignalForge AI targets BNB HACK: AI Trading Agents, Track 2 Strategy Skills.

The project is no longer positioned as a generic AI text generator. It is an executable strategy-skill builder:

- CMC market data provides normalized market context.
- Python computes a fixed indicator pool: EMA, MACD, RSI, volume ratio, and BNB catalyst score.
- AI can only compose strategies from whitelisted indicator fields.
- The backend parses the returned JSON and runs the backtest deterministically.
- BNB ecosystem catalyst signals make the project specific to the BNB Chain sponsor context.

## 2. Core Judge Concern And Fix

Concern: AI may only generate marketing copy.

Fix: AI receives structured market data and indicator values, then returns a strict JSON object with `entry_conditions` and `exit_conditions`. Each condition must use supported fields such as `ema_fast`, `ema_slow`, `rsi`, `macd`, `macd_signal`, `volume_ratio`, and `bnb_catalyst_score`.

Concern: Dynamic AI rules are hard to backtest.

Fix: The backend does not execute free-form AI text. It executes a constrained condition schema:

```json
{
  "left": "ema_fast",
  "operator": ">",
  "right": "ema_slow",
  "description": "Fast EMA confirms trend."
}
```

This lets Python evaluate each condition safely and consistently.

Concern: The product is not BNB-native enough.

Fix: The strategy context includes BNB ecosystem catalyst scoring. The MVP currently uses a transparent heuristic based on CMC asset identity, volume, and momentum. The next production extension can replace this with live BNB Chain feeds such as TVL, active addresses, gas, PancakeSwap liquidity, or new-token activity.

## 3. Upgraded Data Flow

1. Frontend sends asset, risk profile, horizon, and lookback window.
2. Backend fetches CMC quote data or uses demo fallback data.
3. Backend builds historical price context.
4. Backend computes executable indicators: EMA, MACD, RSI, volume ratio.
5. Backend computes BNB ecosystem catalyst signals.
6. Backend sends market context, indicators, catalysts, and JSON schema to AI.
7. AI returns constrained strategy JSON.
8. Backend validates the JSON with Pydantic.
9. Backend runs deterministic Python backtest against the indicator conditions.
10. Frontend displays strategy, indicators, BNB catalyst score, backtest, and JSON payload.

## 4. MCP Direction

The API includes an MCP-ready manifest endpoint:

```text
GET /api/mcp/tools
```

This exposes the intended tool boundary:

- `cmc_market_context`
- `indicator_rule_backtest`

In the next iteration, these can be wrapped as real MCP tools so the AI agent can call CMC context natively instead of receiving a plain backend prompt.

## 5. Current MVP Scope

- React UI.
- FastAPI backend.
- CMC quote integration with fallback.
- Indicator engine without TA-Lib dependency.
- BNB ecosystem catalyst heuristic.
- Strict AI strategy schema.
- Deterministic backtest engine.
- Strategy JSON display.
- No wallet connection.
- No live trading.
- No financial advice.

## 6. Next Upgrade Candidates

- Replace generated history with real historical candles.
- Add CMC MCP server/tool wrapper.
- Add BNB Chain live signals: TVL, gas price, PancakeSwap liquidity, active addresses.
- Add Backtrader or vectorbt for richer backtesting.
- Add strategy export compatible with a future Trust Wallet or BNB AI Agent SDK execution layer.
