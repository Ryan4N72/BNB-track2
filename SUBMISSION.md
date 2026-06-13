# SignalForge AI Submission

## Build Image

![SignalForge AI build hero](./assets/signalforge-build-hero.png)

## Problem This Project Solves

Every day, traders face hundreds of indicators, market signals, charts, and opinions. The problem is not finding information. The problem is deciding which strategy to trust.

Most AI trading tools stop at generic commentary such as "this asset looks bullish" or "market momentum is improving." That is not enough for BNB Hack Track 2. Judges need a strategy skill that can be inspected, compared, backtested, and exported.

SignalForge AI solves this by transforming CoinMarketCap market signals and historical OHLCV data into transparent, backtestable Strategy Skills for BNB ecosystem assets.

## What SignalForge AI Builds

SignalForge AI generates three strategy candidates in one run:

- Momentum
- Mean Reversion
- Breakout

It then runs deterministic Python backtests, compares return, Sharpe Ratio, win rate, max drawdown, and risk score, and recommends the best risk-adjusted strategy.

## Why It Matters

The final output is not a trading opinion. It is an exportable Strategy Skill JSON containing the asset, indicators, entry rules, exit rules, stop loss, take profit, position sizing, risk limits, backtest metrics, confidence score, market regime, and AI reasoning summary.

This makes the strategy transparent, auditable, and suitable for BNB Hack Track 2 without requiring wallet connection, custody, or live trading.
