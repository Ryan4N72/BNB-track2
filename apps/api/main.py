import logging
import math
import os
import statistics
from datetime import datetime, timezone
from enum import Enum
from typing import Any

import ccxt
import httpx
import pandas as pd
from ta.momentum import RSIIndicator
from ta.trend import EMAIndicator, MACD
from ta.volatility import AverageTrueRange
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("signalforge")
CMC_API_KEY = os.getenv("CMC_API_KEY", "").strip()
CMC_API_BASE = os.getenv("CMC_API_BASE", "https://pro-api.coinmarketcap.com").rstrip("/")

app = FastAPI(
    title="SignalForge AI API",
    description="BNB Hack Track 2 Strategy Skills backend.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RiskProfile(str, Enum):
    conservative = "conservative"
    balanced = "balanced"
    aggressive = "aggressive"


class Horizon(str, Enum):
    intraday = "intraday"
    swing = "swing"
    trend = "trend"


class GenerateRequest(BaseModel):
    asset: str = Field(default="BNB", min_length=2, max_length=12)
    risk_profile: RiskProfile = RiskProfile.balanced
    horizon: Horizon = Horizon.swing
    lookback_days: int = Field(default=30, ge=7, le=180)


class MarketIndicators(BaseModel):
    asset: str
    data_source: str
    price: float
    change_24h: float
    change_7d: float
    volume: float
    market_cap: float
    rsi: float
    macd: float
    ema: float
    atr: float
    fear_and_greed: float


class StrategyMetrics(BaseModel):
    return_pct: float
    sharpe_ratio: float
    win_rate: float
    max_drawdown: float
    risk_score: float
    position_size: float
    stop_loss: float
    take_profit: float


class StrategySkill(BaseModel):
    id: str
    name: str
    description: str
    entry_rules: list[str]
    exit_rules: list[str]
    metrics: StrategyMetrics
    equity_curve: list[float]
    benchmark_curve: list[float]
    drawdown_curve: list[float]


class RejectedStrategy(BaseModel):
    id: str
    name: str
    reason: str


class AgentVerdict(BaseModel):
    confidence_score: float
    market_regime: str
    bullish_signals: list[str]
    bearish_risks: list[str]
    why_recommended: str
    rejected_strategies: list[RejectedStrategy]


class HistoricalCandle(BaseModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: float


class GenerateResponse(BaseModel):
    asset: str
    risk_profile: RiskProfile
    horizon: Horizon
    lookback_days: int
    generated_at: str
    market_indicators: MarketIndicators
    strategies: list[StrategySkill]
    recommended_strategy: StrategySkill
    agent_verdict: AgentVerdict
    historical_candles: list[HistoricalCandle]
    ai_decision_log: str


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error while processing %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_server_error",
            "message": str(exc),
            "path": request.url.path,
        },
    )


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "name": "SignalForge AI API", "version": "1.0.0"}


@app.post("/api/generate", response_model=GenerateResponse)
def generate_strategy(payload: GenerateRequest) -> GenerateResponse:
    try:
        asset = payload.asset.upper().strip()
        logger.info(
            "Generating strategy skills asset=%s risk_profile=%s horizon=%s lookback_days=%s",
            asset,
            payload.risk_profile.value,
            payload.horizon.value,
            payload.lookback_days,
        )
        quote_profile = fetch_cmc_quote(asset) or demo_asset_profile(asset)
        candles, history_source = get_historical_candles(asset, quote_profile, payload.lookback_days)
        market = build_market_indicators(asset, quote_profile, candles, history_source)
        strategies = [
            build_strategy(asset, "Momentum", payload.risk_profile, payload.horizon, market, candles),
            build_strategy(asset, "Mean Reversion", payload.risk_profile, payload.horizon, market, candles),
            build_strategy(asset, "Breakout", payload.risk_profile, payload.horizon, market, candles),
        ]
        recommended = recommend_strategy(strategies)
        verdict = build_agent_verdict(market, strategies, recommended)
        return GenerateResponse(
            asset=asset,
            risk_profile=payload.risk_profile,
            horizon=payload.horizon,
            lookback_days=payload.lookback_days,
            generated_at=datetime.now(timezone.utc).isoformat(),
            market_indicators=market,
            strategies=strategies,
            recommended_strategy=recommended,
            agent_verdict=verdict,
            historical_candles=serialize_candles(candles),
            ai_decision_log=build_decision_log(asset, market, strategies, recommended, payload.risk_profile),
        )
    except Exception:
        logger.exception("Failed to generate strategy response")
        raise


def build_market_indicators(
    asset: str,
    profile: dict[str, float | str | None],
    candles: list[dict[str, Any]],
    history_source: str,
) -> MarketIndicators:
    latest = candles[-1]
    ema_value = float(latest["ema"])
    rsi_value = float(latest["rsi"])
    macd_value = float(latest["macd"])
    atr_value = float(latest["atr"])
    fear_and_greed = profile.get("fear_and_greed")
    if fear_and_greed is None:
        fear_and_greed = clamp(50 + (rsi_value - 50) * 0.45 + profile["change_7d"] * 1.4, 0, 100)
    return MarketIndicators(
        asset=asset,
        data_source=f"{profile['data_source']} + {history_source}",
        price=round(profile["price"], 4),
        change_24h=round(profile["change_24h"], 2),
        change_7d=round(profile["change_7d"], 2),
        volume=round(profile["volume"], 2),
        market_cap=round(profile["market_cap"], 2),
        rsi=round(rsi_value, 2),
        macd=round(macd_value, 4),
        ema=round(ema_value, 4),
        atr=round(atr_value, 4),
        fear_and_greed=round(fear_and_greed, 2),
    )


def serialize_candles(candles: list[dict[str, Any]]) -> list[HistoricalCandle]:
    return [
        HistoricalCandle(
            date=str(candle["date"]),
            open=round(float(candle["open"]), 6),
            high=round(float(candle["high"]), 6),
            low=round(float(candle["low"]), 6),
            close=round(float(candle["close"]), 6),
            volume=round(float(candle["volume"]), 6),
        )
        for candle in candles
    ]


def build_strategy(
    asset: str,
    strategy_name: str,
    risk_profile: RiskProfile,
    horizon: Horizon,
    market: MarketIndicators,
    candles: list[dict[str, Any]],
) -> StrategySkill:
    stop_loss, take_profit, position_size = risk_parameters(risk_profile)
    equity_curve, benchmark_curve, drawdown_curve, trade_returns = run_backtest(
        strategy_name=strategy_name,
        candles=candles,
        position_size=position_size,
        stop_loss=stop_loss,
        take_profit=take_profit,
    )
    metrics = calculate_metrics(
        equity_curve=equity_curve,
        drawdown_curve=drawdown_curve,
        position_size=position_size,
        stop_loss=stop_loss,
        take_profit=take_profit,
        trade_returns=trade_returns,
    )
    entry, exit_rules, description = strategy_rules(strategy_name, market, horizon)
    return StrategySkill(
        id=strategy_name.lower().replace(" ", "_"),
        name=f"{asset} {strategy_name} Strategy Skill",
        description=description,
        entry_rules=entry,
        exit_rules=exit_rules,
        metrics=metrics,
        equity_curve=equity_curve,
        benchmark_curve=benchmark_curve,
        drawdown_curve=drawdown_curve,
    )


def demo_asset_profile(asset: str) -> dict[str, float]:
    profiles = {
        "BNB": {"price": 692.4, "change_24h": 1.8, "change_7d": 6.2, "volume": 1_980_000_000, "market_cap": 102_000_000_000},
        "CAKE": {"price": 3.12, "change_24h": 3.6, "change_7d": 12.4, "volume": 128_000_000, "market_cap": 950_000_000},
        "TWT": {"price": 1.18, "change_24h": 1.2, "change_7d": 5.8, "volume": 42_000_000, "market_cap": 493_000_000},
        "BTC": {"price": 108_250, "change_24h": -0.6, "change_7d": 2.3, "volume": 42_000_000_000, "market_cap": 2_130_000_000_000},
        "ETH": {"price": 3_920, "change_24h": 0.9, "change_7d": 4.1, "volume": 25_000_000_000, "market_cap": 471_000_000_000},
    }
    profile = profiles.get(asset, {"price": 128.0, "change_24h": 1.1, "change_7d": 3.2, "volume": 420_000_000, "market_cap": 8_400_000_000})
    return {**profile, "data_source": "CoinMarketCap-style Demo Fallback", "fear_and_greed": None}


def get_historical_candles(
    asset: str,
    profile: dict[str, float | str | None],
    lookback_days: int,
) -> tuple[list[dict[str, Any]], str]:
    try:
        candles = fetch_binance_ohlcv(asset, lookback_days)
        if candles:
            return add_technical_indicators(candles)[-lookback_days:], "Binance Public OHLCV via CCXT"
    except Exception as exc:
        logger.exception("Binance OHLCV failed for %s; using deterministic fallback candles: %s", asset, exc)
    return add_technical_indicators(build_demo_candles(profile, lookback_days))[-lookback_days:], "Deterministic Historical Fallback"


def fetch_binance_ohlcv(asset: str, lookback_days: int) -> list[dict[str, Any]]:
    market_symbol = binance_symbol(asset)
    request_symbol = market_symbol.replace("/", "")
    limit = min(max(lookback_days + 60, 90), 500)
    exchange = ccxt.binance({
        "enableRateLimit": True,
        "timeout": 8_000,
        "options": {"defaultType": "spot"},
    })
    rows = exchange.public_get_klines({"symbol": request_symbol, "interval": "1d", "limit": limit})
    candles = []
    for row in rows:
        timestamp = int(row[0])
        open_price, high, low, close, volume = row[1:6]
        candles.append(
            {
                "timestamp": timestamp,
                "date": datetime.fromtimestamp(timestamp / 1000, tz=timezone.utc).date().isoformat(),
                "open": float(open_price),
                "high": float(high),
                "low": float(low),
                "close": float(close),
                "volume": float(volume),
            }
        )
    if len(candles) < max(lookback_days, 14):
        raise ValueError(f"Binance returned only {len(candles)} candles for {market_symbol}")
    logger.info("Loaded %s Binance OHLCV candles for %s", len(candles), market_symbol)
    return candles


def binance_symbol(asset: str) -> str:
    symbol_map = {
        "BNB": "BNB/USDT",
        "CAKE": "CAKE/USDT",
        "TWT": "TWT/USDT",
        "BTC": "BTC/USDT",
        "ETH": "ETH/USDT",
    }
    return symbol_map.get(asset.upper(), f"{asset.upper()}/USDT")


def build_demo_candles(profile: dict[str, float | str | None], days: int) -> list[dict[str, Any]]:
    prices = generate_price_series(float(profile["price"]), float(profile["change_7d"]), max(days + 60, 90))
    candles = []
    start_index = len(prices)
    for index, close in enumerate(prices):
        wave = abs(math.sin(index / 3.0)) * 0.012 + 0.006
        open_price = prices[index - 1] if index else close * 0.997
        high = max(open_price, close) * (1 + wave)
        low = min(open_price, close) * (1 - wave)
        timestamp = int((datetime.now(timezone.utc).timestamp() - (start_index - index) * 86400) * 1000)
        candles.append(
            {
                "timestamp": timestamp,
                "date": datetime.fromtimestamp(timestamp / 1000, tz=timezone.utc).date().isoformat(),
                "open": round(open_price, 6),
                "high": round(high, 6),
                "low": round(low, 6),
                "close": round(close, 6),
                "volume": float(profile["volume"]) * (0.86 + abs(math.cos(index / 5.0)) * 0.28),
            }
        )
    return candles


def add_technical_indicators(candles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    frame = pd.DataFrame(candles)
    close = frame["close"]
    high = frame["high"]
    low = frame["low"]
    frame["rsi"] = RSIIndicator(close=close, window=14).rsi()
    macd_indicator = MACD(close=close, window_slow=26, window_fast=12, window_sign=9)
    frame["macd"] = macd_indicator.macd()
    frame["macd_signal"] = macd_indicator.macd_signal()
    frame["ema"] = EMAIndicator(close=close, window=20).ema_indicator()
    frame["atr"] = AverageTrueRange(high=high, low=low, close=close, window=14).average_true_range()
    frame["volume_sma"] = frame["volume"].rolling(window=10, min_periods=1).mean()
    frame["breakout_high"] = frame["high"].shift(1).rolling(window=5, min_periods=1).max()
    frame["previous_high"] = frame["high"].shift(1)
    frame = frame.bfill().ffill()
    return frame.to_dict(orient="records")


def fetch_cmc_quote(asset: str) -> dict[str, float | str | None] | None:
    if not CMC_API_KEY:
        logger.info("CMC_API_KEY is not set; using demo fallback data")
        return None

    try:
        url = f"{CMC_API_BASE}/v2/cryptocurrency/quotes/latest"
        headers = {
            "Accepts": "application/json",
            "X-CMC_PRO_API_KEY": CMC_API_KEY,
        }
        params = {"symbol": asset, "convert": "USD"}
        with httpx.Client(timeout=8.0) as client:
            response = client.get(url, headers=headers, params=params)
            response.raise_for_status()
            payload = response.json()
            quote = extract_cmc_usd_quote(payload, asset)
            fear_and_greed = fetch_cmc_fear_and_greed(client, headers)
        logger.info("Loaded live CoinMarketCap quote for %s", asset)
        return {
            "price": float(quote.get("price") or 0),
            "change_24h": float(quote.get("percent_change_24h") or 0),
            "change_7d": float(quote.get("percent_change_7d") or 0),
            "volume": float(quote.get("volume_24h") or 0),
            "market_cap": float(quote.get("market_cap") or 0),
            "data_source": "Live CoinMarketCap Data",
            "fear_and_greed": fear_and_greed,
        }
    except Exception as exc:
        logger.exception("CoinMarketCap live data failed for %s; using demo fallback: %s", asset, exc)
        return None


def extract_cmc_usd_quote(payload: dict[str, Any], asset: str) -> dict[str, Any]:
    data = payload.get("data") or {}
    asset_data = data.get(asset)
    if isinstance(asset_data, list) and asset_data:
        item = asset_data[0]
    elif isinstance(asset_data, dict):
        item = asset_data
    else:
        raise ValueError(f"CoinMarketCap response did not include symbol {asset}")
    quote = (item.get("quote") or {}).get("USD") or {}
    if not quote:
        raise ValueError(f"CoinMarketCap response for {asset} did not include USD quote")
    return quote


def fetch_cmc_fear_and_greed(client: httpx.Client, headers: dict[str, str]) -> float | None:
    try:
        response = client.get(f"{CMC_API_BASE}/v3/fear-and-greed/latest", headers=headers)
        response.raise_for_status()
        data = response.json().get("data") or {}
        value = data.get("value")
        return float(value) if value is not None else None
    except Exception as exc:
        logger.warning("CoinMarketCap Fear & Greed unavailable; using derived score: %s", exc)
        return None


def generate_price_series(price: float, change_7d: float, days: int) -> list[float]:
    series = []
    trend = change_7d / 100 / max(days, 1)
    for i in range(days):
        wave = math.sin(i / 2.8) * 0.018
        pulse = math.cos(i / 5.2) * 0.011
        drift = (i - days + 1) * trend
        series.append(round(max(price * (1 + drift + wave + pulse), price * 0.25), 6))
    return series


def simulate_equity_curve(days: int, position_size: float, trend_bias: float, volatility: float, phase: float) -> list[float]:
    equity = 10_000.0
    curve = []
    exposure = position_size / 100
    for i in range(days):
        daily_trend = trend_bias / max(days, 1)
        oscillation = math.sin(i / 2.6 + phase) * volatility
        shock = math.cos(i / 6.1 + phase) * volatility * 0.45
        daily_return = (daily_trend + oscillation + shock) * exposure
        equity = max(equity * (1 + daily_return), 1)
        curve.append(round(equity, 2))
    return curve


def run_backtest(
    strategy_name: str,
    candles: list[dict[str, Any]],
    position_size: float,
    stop_loss: float,
    take_profit: float,
) -> tuple[list[float], list[float], list[float], list[float]]:
    cash = 10_000.0
    units = 0.0
    entry_price = 0.0
    equity_curve = []
    trade_returns = []
    first_close = float(candles[0]["close"])

    for candle in candles:
        close = float(candle["close"])
        high = float(candle["high"])
        low = float(candle["low"])
        exit_price = None

        if units > 0:
            stop_price = entry_price * (1 - stop_loss / 100)
            target_price = entry_price * (1 + take_profit / 100)
            if low <= stop_price:
                exit_price = stop_price
            elif high >= target_price:
                exit_price = target_price
            elif should_exit(strategy_name, candle):
                exit_price = close

            if exit_price is not None:
                cash += units * exit_price
                trade_returns.append((exit_price / entry_price) - 1)
                units = 0.0
                entry_price = 0.0

        if units == 0 and should_enter(strategy_name, candle):
            allocation = cash * (position_size / 100)
            if allocation > 0 and close > 0:
                units = allocation / close
                cash -= allocation
                entry_price = close

        equity_curve.append(round(cash + units * close, 2))

    if units > 0:
        final_close = float(candles[-1]["close"])
        cash += units * final_close
        trade_returns.append((final_close / entry_price) - 1)
        equity_curve[-1] = round(cash, 2)

    benchmark_curve = [round(10_000 * (float(candle["close"]) / first_close), 2) for candle in candles]
    drawdown_curve = calculate_drawdown_curve(equity_curve)
    return equity_curve, benchmark_curve, drawdown_curve, trade_returns


def should_enter(strategy_name: str, candle: dict[str, Any]) -> bool:
    close = float(candle["close"])
    ema_value = float(candle["ema"])
    rsi_value = float(candle["rsi"])
    macd_value = float(candle["macd"])
    macd_signal = float(candle["macd_signal"])
    volume = float(candle["volume"])
    volume_sma = float(candle["volume_sma"])
    breakout_high = float(candle["breakout_high"])
    previous_high = float(candle["previous_high"])

    if strategy_name == "Momentum":
        return close > ema_value * 0.985 and macd_value > macd_signal and 35 <= rsi_value <= 78
    if strategy_name == "Mean Reversion":
        return close < ema_value and rsi_value <= 45
    return close > min(breakout_high * 0.995, previous_high * 1.002) and volume > volume_sma * 0.88 and macd_value > macd_signal


def should_exit(strategy_name: str, candle: dict[str, Any]) -> bool:
    close = float(candle["close"])
    ema_value = float(candle["ema"])
    rsi_value = float(candle["rsi"])
    macd_value = float(candle["macd"])
    macd_signal = float(candle["macd_signal"])

    if strategy_name == "Momentum":
        return close < ema_value or macd_value < macd_signal or rsi_value > 78
    if strategy_name == "Mean Reversion":
        return close >= ema_value or rsi_value >= 58
    return close < ema_value or macd_value < macd_signal


def calculate_metrics(
    equity_curve: list[float],
    drawdown_curve: list[float],
    position_size: float,
    stop_loss: float,
    take_profit: float,
    trade_returns: list[float] | None = None,
) -> StrategyMetrics:
    returns = daily_returns(equity_curve)
    total_return = ((equity_curve[-1] / equity_curve[0]) - 1) * 100 if equity_curve else 0
    max_drawdown = abs(min(drawdown_curve)) if drawdown_curve else 0
    sharpe = 0.0
    if len(returns) > 1 and statistics.stdev(returns) != 0:
        sharpe = statistics.mean(returns) / statistics.stdev(returns) * math.sqrt(365)
    if trade_returns:
        win_rate = sum(1 for item in trade_returns if item > 0) / len(trade_returns) * 100
    else:
        win_rate = (sum(1 for item in returns if item > 0) / len(returns) * 100) if returns else 0
    downside_penalty = abs(min(total_return, 0)) * 1.4
    sharpe_credit = max(sharpe, 0) * 2.0
    win_credit = win_rate * 0.08
    risk_score = clamp(
        30 + max_drawdown * 5.0 + position_size * 1.1 + stop_loss * 1.7 + downside_penalty - sharpe_credit - win_credit,
        1,
        100,
    )
    return StrategyMetrics(
        return_pct=round(total_return, 2),
        sharpe_ratio=round(sharpe, 2),
        win_rate=round(win_rate, 2),
        max_drawdown=round(max_drawdown, 2),
        risk_score=round(risk_score, 2),
        position_size=round(position_size, 2),
        stop_loss=round(stop_loss, 2),
        take_profit=round(take_profit, 2),
    )


def strategy_rules(strategy_name: str, market: MarketIndicators, horizon: Horizon) -> tuple[list[str], list[str], str]:
    if strategy_name == "Momentum":
        return (
            [
                "close > ema * 0.985",
                "macd > macd_signal",
                "35 <= rsi <= 78",
            ],
            [
                "close < ema",
                "macd < macd_signal",
                "rsi > 78",
                "portfolio stop_loss reached",
            ],
            f"Momentum follows confirmed trend continuation for {horizon.value} setups.",
        )
    if strategy_name == "Mean Reversion":
        return (
            [
                "close < ema",
                "rsi <= 45",
                "atr confirms controlled volatility",
            ],
            [
                "rsi >= 58",
                "close >= ema",
                "portfolio stop_loss reached",
            ],
            f"Mean Reversion looks for controlled pullbacks before recovery.",
        )
    return (
        [
            "close > recent breakout threshold",
            "volume > volume_sma * 0.88",
            "macd > macd_signal",
        ],
        [
            "close < ema",
            "macd < macd_signal",
            "portfolio stop_loss reached",
        ],
        f"Breakout captures expansion when price, trend, and volume align.",
    )


def recommend_strategy(strategies: list[StrategySkill]) -> StrategySkill:
    return max(
        strategies,
        key=lambda item: strategy_selection_score(item),
    )


def build_agent_verdict(
    market: MarketIndicators,
    strategies: list[StrategySkill],
    recommended: StrategySkill,
) -> AgentVerdict:
    return AgentVerdict(
        confidence_score=confidence_score(recommended, market),
        market_regime=market_regime(market),
        bullish_signals=build_bullish_signals(market, recommended)[:3],
        bearish_risks=build_bearish_risks(market, recommended)[:3],
        why_recommended=recommendation_summary(recommended, strategies),
        rejected_strategies=rejected_strategy_reasons(strategies, recommended),
    )


def build_decision_log(
    asset: str,
    market: MarketIndicators,
    strategies: list[StrategySkill],
    recommended: StrategySkill,
    risk_profile: RiskProfile,
) -> str:
    bullish_signals = build_bullish_signals(market, recommended)
    bearish_risks = build_bearish_risks(market, recommended)
    confidence = confidence_score(recommended, market)
    regime = market_regime(market)
    rejected = rejected_strategy_reasons(strategies, recommended)
    strategy_scores = sorted(
        ((item, strategy_selection_score(item)) for item in strategies),
        key=lambda pair: pair[1],
        reverse=True,
    )
    comparison = "\n".join(
        f"- {item.name}: score `{score}`, return `{item.metrics.return_pct}%`, Sharpe `{item.metrics.sharpe_ratio}`, win rate `{item.metrics.win_rate}%`, max drawdown `{item.metrics.max_drawdown}%`, risk score `{item.metrics.risk_score}/100`"
        for item, score in strategy_scores
    )
    bullish = "\n".join(f"- {signal}" for signal in bullish_signals)
    bearish = "\n".join(f"- {risk}" for risk in bearish_risks)
    sizing_note = position_sizing_logic(risk_profile, recommended)
    risk_note = risk_explanation(recommended)
    recommendation_reason = recommendation_summary(recommended, strategies)
    return f"""## AI Decision Log

### Data Analyst Agent
- Asset: `{asset}`
- Data sources: `{market.data_source}`.
- Live quote: `${market.price}` with `{market.change_24h}%` 24h change and `{market.change_7d}%` 7d change.
- Liquidity context: `${round(market.volume / 1_000_000, 2)}M` daily volume and `${round(market.market_cap / 1_000_000_000, 2)}B` market cap.
- Technical state: RSI `{market.rsi}`, MACD `{market.macd}`, EMA `{market.ema}`, ATR `{market.atr}`.
- Sentiment state: Fear & Greed `{market.fear_and_greed}/100`.
- Market regime: `{regime}`.

Bullish signals:
{bullish}

Bearish risks:
{bearish}

### Quant Strategist Agent
Compared three executable Strategy Skill specs using deterministic Python backtests:
{comparison}

Selected strategy: **{recommended.name}**.
Why selected: {recommendation_reason}
Rejected strategies:
{format_rejected_list(rejected)}
Executable entry rules:
{format_rule_list(recommended.entry_rules)}
Executable exit rules:
{format_rule_list(recommended.exit_rules)}

### Risk Manager Agent
- Risk profile: `{risk_profile.value}`.
- Position size: `{recommended.metrics.position_size}%`.
- Stop loss: `{recommended.metrics.stop_loss}%`.
- Take profit: `{recommended.metrics.take_profit}%`.
- Risk score: `{recommended.metrics.risk_score}/100`.
- Max drawdown in the deterministic backtest: `{recommended.metrics.max_drawdown}%`.
- Position sizing logic: {sizing_note}
- Risk explanation: {risk_note}

### Final Agent Decision
- Confidence score: `{confidence}/100`.
- The AI role is constrained to market interpretation, strategy comparison, and risk explanation.
- The executable behavior remains the fixed Strategy Skill JSON and deterministic Python backtest.
- No wallet connection or live trading is performed.
"""


def strategy_selection_score(strategy: StrategySkill) -> float:
    metrics = strategy.metrics
    score = (
        metrics.return_pct
        + metrics.sharpe_ratio * 1.8
        + metrics.win_rate * 0.02
        - metrics.max_drawdown * 0.75
        - metrics.risk_score * 0.06
    )
    return round(score, 2)


def market_regime(market: MarketIndicators) -> str:
    volatility_ratio = market.atr / max(market.price, 1)
    if volatility_ratio > 0.06 or market.fear_and_greed >= 78:
        return "High Volatility"
    if market.change_7d > 3 and market.rsi >= 52 and market.macd > 0:
        return "Bull Market"
    if market.change_7d < -3 and market.rsi <= 48:
        return "Bear Market"
    return "Sideways / Mean Reversion"


def rejected_strategy_reasons(strategies: list[StrategySkill], recommended: StrategySkill) -> list[RejectedStrategy]:
    rejected = []
    for strategy in strategies:
        if strategy.id == recommended.id:
            continue
        metrics = strategy.metrics
        if metrics.sharpe_ratio < 0:
            reason = "negative Sharpe means poor risk-adjusted behavior in this window"
        elif metrics.return_pct < recommended.metrics.return_pct and metrics.max_drawdown >= recommended.metrics.max_drawdown:
            reason = "lower return with equal or higher drawdown"
        elif metrics.risk_score > recommended.metrics.risk_score + 8:
            reason = "higher risk exposure for weaker reward"
        elif metrics.win_rate < 45:
            reason = "weak win rate under deterministic backtest rules"
        else:
            reason = "composite score was weaker after return, Sharpe, drawdown, and risk were balanced"
        rejected.append(RejectedStrategy(id=strategy.id, name=strategy.name, reason=reason))
    return rejected


def build_bullish_signals(market: MarketIndicators, recommended: StrategySkill) -> list[str]:
    signals = []
    quote_label = "CMC live quote" if "Live CoinMarketCap Data" in market.data_source else "market quote context"
    if market.change_24h > 0:
        signals.append(f"{quote_label} shows positive 24h momentum at `{market.change_24h}%`.")
    if market.change_7d > 0:
        signals.append(f"7d market trend remains positive at `{market.change_7d}%`, supporting active strategy selection.")
    if market.volume > 100_000_000:
        signals.append("Liquidity is deep enough for a Strategy Skill demo; volume is above `$100M`.")
    if recommended.metrics.sharpe_ratio > 1:
        signals.append(f"The selected backtest has a positive risk-adjusted profile with Sharpe `{recommended.metrics.sharpe_ratio}`.")
    if recommended.metrics.win_rate >= 50:
        signals.append(f"The selected strategy wins more often than it loses in the deterministic run: `{recommended.metrics.win_rate}%` win rate.")
    return signals or ["No strong bullish signal dominates; the agent prioritizes risk control over trend chasing."]


def build_bearish_risks(market: MarketIndicators, recommended: StrategySkill) -> list[str]:
    risks = []
    if market.rsi < 45:
        risks.append(f"RSI `{market.rsi}` is weak, so trend-following entries need confirmation.")
    if market.macd < 0:
        risks.append(f"MACD `{market.macd}` is below zero, indicating bearish momentum pressure.")
    if market.fear_and_greed < 30:
        risks.append(f"Fear & Greed `{market.fear_and_greed}/100` shows defensive sentiment.")
    if recommended.metrics.max_drawdown > 5:
        risks.append(f"Backtest drawdown `{recommended.metrics.max_drawdown}%` is material for the selected risk profile.")
    if recommended.metrics.risk_score > 50:
        risks.append(f"Risk score `{recommended.metrics.risk_score}/100` requires conservative sizing.")
    return risks or ["No major bearish risk dominates, but the agent still enforces stop loss and position limits."]


def confidence_score(strategy: StrategySkill, market: MarketIndicators) -> float:
    score = 55.0
    score += min(max(strategy.metrics.sharpe_ratio, -1), 3) * 7
    score += min(strategy.metrics.win_rate, 100) * 0.12
    score += max(strategy.metrics.return_pct, -10) * 0.8
    score -= strategy.metrics.max_drawdown * 1.5
    score -= max(strategy.metrics.risk_score - 55, 0) * 0.25
    if "Live CoinMarketCap Data" in market.data_source:
        score += 5
    if "Binance Public OHLCV" in market.data_source:
        score += 7
    return round(clamp(score, 1, 95), 1)


def position_sizing_logic(risk_profile: RiskProfile, strategy: StrategySkill) -> str:
    return (
        f"`{risk_profile.value}` mode maps to `{strategy.metrics.position_size}%` capital exposure, "
        f"with stop loss `{strategy.metrics.stop_loss}%` and take profit `{strategy.metrics.take_profit}%`. "
        "The strategy does not size from AI prose; it uses fixed risk parameters passed into the deterministic engine."
    )


def risk_explanation(strategy: StrategySkill) -> str:
    if strategy.metrics.max_drawdown <= 2:
        return "Drawdown is controlled in the tested window, so the agent favors keeping the strategy eligible for recommendation."
    if strategy.metrics.max_drawdown <= 6:
        return "Drawdown is acceptable but not trivial; the strategy remains usable only with fixed stop loss and capped exposure."
    return "Drawdown is elevated; the agent treats this as a high-risk Strategy Skill and avoids oversized allocation."


def recommendation_summary(recommended: StrategySkill, strategies: list[StrategySkill]) -> str:
    best_score = strategy_selection_score(recommended)
    next_best = sorted(
        [item for item in strategies if item.id != recommended.id],
        key=strategy_selection_score,
        reverse=True,
    )
    if not next_best:
        return f"It produced the highest composite score `{best_score}` among available candidates."
    runner_up = next_best[0]
    runner_score = strategy_selection_score(runner_up)
    return (
        f"It produced the highest composite score `{best_score}`, ahead of `{runner_up.name}` at `{runner_score}`. "
        "The score balances return, Sharpe Ratio, win rate, drawdown, and risk score instead of chasing raw return only."
    )


def format_rule_list(rules: list[str]) -> str:
    return "\n".join(f"- `{rule}`" for rule in rules)


def format_rejected_list(rejected: list[RejectedStrategy]) -> str:
    return "\n".join(f"- `{item.name}` rejected because {item.reason}." for item in rejected)


def risk_parameters(profile: RiskProfile) -> tuple[float, float, float]:
    return {
        RiskProfile.conservative: (4.0, 8.0, 10.0),
        RiskProfile.balanced: (6.0, 13.0, 20.0),
        RiskProfile.aggressive: (9.0, 21.0, 32.0),
    }[profile]


def ema(values: list[float], period: int) -> list[float]:
    if not values:
        return []
    alpha = 2 / (period + 1)
    result = [values[0]]
    for value in values[1:]:
        result.append(value * alpha + result[-1] * (1 - alpha))
    return result


def rsi(values: list[float], period: int) -> list[float]:
    result = [50.0]
    gains: list[float] = []
    losses: list[float] = []
    for previous, current in zip(values, values[1:]):
        delta = current - previous
        gains.append(max(delta, 0))
        losses.append(abs(min(delta, 0)))
        avg_gain = statistics.mean(gains[-period:]) if gains else 0
        avg_loss = statistics.mean(losses[-period:]) if losses else 0
        if avg_loss == 0:
            result.append(100.0)
        else:
            result.append(100 - (100 / (1 + avg_gain / avg_loss)))
    return result


def macd(values: list[float]) -> float:
    if not values:
        return 0.0
    return ema(values, 12)[-1] - ema(values, 26)[-1]


def atr(values: list[float], period: int) -> list[float]:
    ranges = [0.0]
    for previous, current in zip(values, values[1:]):
        ranges.append(abs(current - previous))
    return [statistics.mean(ranges[max(0, i - period + 1) : i + 1]) for i in range(len(ranges))]


def daily_returns(equity_curve: list[float]) -> list[float]:
    return [(current / previous) - 1 for previous, current in zip(equity_curve, equity_curve[1:]) if previous]


def calculate_drawdown_curve(equity_curve: list[float]) -> list[float]:
    peak = 0.0
    curve = []
    for value in equity_curve:
        peak = max(peak, value)
        curve.append(round(((value - peak) / peak * 100) if peak else 0, 2))
    return curve


def clamp(value: float, lower: float, upper: float) -> float:
    return min(max(value, lower), upper)
