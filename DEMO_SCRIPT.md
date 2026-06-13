# 90-Second Hackathon Demo Script

Audience: BNB Hack Track 2 judges

## Script

Hi judges, this is SignalForge AI.

Every day, traders face hundreds of indicators, signals, and opinions.

The problem is not finding information. The problem is deciding which strategy to trust.

SignalForge AI solves this by transforming CoinMarketCap market signals into transparent, backtestable Strategy Skills for BNB ecosystem assets.

Here is the workflow. First, I select BNB, choose a risk profile, horizon, and lookback window, then click Generate Strategy.

The app pulls live CoinMarketCap quote data, loads public Binance OHLCV candles through CCXT, and calculates technical indicators including RSI, MACD, EMA, and ATR.

Next, SignalForge AI generates three strategy candidates: Momentum, Mean Reversion, and Breakout.

In the comparison table, judges can see Return, Sharpe Ratio, Win Rate, Max Drawdown, and Risk Score for each strategy. Instead of recommending the highest raw return, the system recommends the best risk-adjusted strategy.

Here, the AI Final Verdict shows the recommended strategy, confidence score, market regime, and why the other strategies were rejected.

Then we verify the strategy with a deterministic Python backtest. The charts show the real BNB price candles, the simulated portfolio equity curve, the benchmark curve, and drawdown behavior.

Finally, I can copy or download the Strategy JSON. This JSON includes the asset, risk profile, indicators used, entry rules, exit rules, stop loss, take profit, position sizing, risk limits, backtest metrics, and AI reasoning summary.

SignalForge AI is not a live trading bot. It is a Track 2 strategy skill generator: transparent, backtestable, exportable, and built around CoinMarketCap signals for the BNB ecosystem.
