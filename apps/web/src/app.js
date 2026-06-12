const apiCandidates = window.SIGNALFORGE_API_BASE
  ? [window.SIGNALFORGE_API_BASE]
  : ["http://127.0.0.1:8011", "http://127.0.0.1:8000"];

const els = {
  symbol: document.querySelector("#symbol"),
  riskProfile: document.querySelector("#riskProfile"),
  horizon: document.querySelector("#horizon"),
  lookbackDays: document.querySelector("#lookbackDays"),
  button: document.querySelector("#generateButton"),
  error: document.querySelector("#error"),
  results: document.querySelector("#results"),
};

const riskProfiles = {
  conservative: {
    label: "Conservative",
    position_size: 10,
    stop_loss: 4,
    take_profit: 8,
    returnMultiplier: 0.64,
    drawdownMultiplier: 0.68,
  },
  balanced: {
    label: "Balanced",
    position_size: 20,
    stop_loss: 6,
    take_profit: 13,
    returnMultiplier: 1,
    drawdownMultiplier: 1,
  },
  aggressive: {
    label: "Aggressive",
    position_size: 32,
    stop_loss: 9,
    take_profit: 21,
    returnMultiplier: 1.38,
    drawdownMultiplier: 1.46,
  },
};

let currentData = null;
let activeRiskProfile = els.riskProfile.value || "balanced";
let typewriterTimer = null;

els.button.addEventListener("click", generate);
renderEmpty();

async function generate() {
  els.button.disabled = true;
  els.button.innerHTML = `<span class="spin" aria-hidden="true">o</span> CrewAI team is plotting strategy...`;
  els.error.textContent = "";

  try {
    currentData = normalizeResponse(await requestStrategy());
    activeRiskProfile = currentData.risk_profile || els.riskProfile.value || "balanced";
    renderResults(currentData);
  } catch (error) {
    els.error.textContent = error instanceof Error ? error.message : "Could not generate strategy";
  } finally {
    els.button.disabled = false;
    els.button.textContent = "Generate Strategy";
  }
}

async function requestStrategy() {
  const body = JSON.stringify({
    asset: els.symbol.value.trim().toUpperCase(),
    risk_profile: els.riskProfile.value,
    horizon: els.horizon.value,
    lookback_days: Number(els.lookbackDays.value),
  });
  const errors = [];

  for (const baseUrl of apiCandidates) {
    try {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(`${baseUrl} returned ${response.status}: ${message}`);
      }

      const payload = await response.json();
      if (!payload.market_indicators || !Array.isArray(payload.strategies)) {
        throw new Error(`${baseUrl} did not return Stage 1 Strategy Skill data`);
      }
      return payload;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(`Could not reach a compatible SignalForge API. ${errors.join(" | ")}`);
}

function renderEmpty() {
  els.results.innerHTML = `
    <section class="empty terminal-empty compact-empty">
      <div>
        <div class="powered-ribbon">
          <span>Powered by CoinMarketCap Data & Signal</span>
          <strong><i></i>Ready for Track 2 Strategy Skills</strong>
        </div>
        <h2>SignalForge AI turns CoinMarketCap market signals into executable, backtestable trading strategy skills for BNB ecosystem assets.</h2>
        <p>Click Generate to see live data, strategy comparison, deterministic backtest, and exportable JSON in one compact workbench.</p>
      </div>
    </section>
  `;
}

function renderResults(data) {
  const normalized = normalizeResponse(data);
  const recommended = normalized.recommended_strategy;
  const verdict = normalized.agent_verdict;
  const scenario = buildRiskScenario(recommended, activeRiskProfile);
  const isLive = normalized.market_indicators.data_source.toLowerCase().includes("live");

  els.results.innerHTML = `
    <section class="top-summary">
      <span class="${isLive ? "live-pill" : "demo-pill"}"><i></i>${isLive ? "Live CMC Data" : "Demo Fallback"}</span>
      <span class="summary-pill">Backtest only</span>
      <span class="summary-pill">Exportable JSON</span>
      <span class="summary-pill">${escapeHtml(normalized.market_indicators.data_source)}</span>
    </section>

    ${agentWorkflow()}

    <section class="market-strip">
      ${ticker("Price", money(normalized.market_indicators.price))}
      ${ticker("24h", pct(normalized.market_indicators.change_24h), toneFor(normalized.market_indicators.change_24h))}
      ${ticker("7d", pct(normalized.market_indicators.change_7d), toneFor(normalized.market_indicators.change_7d))}
      ${ticker("Vol", compact(normalized.market_indicators.volume))}
      ${ticker("MCap", compact(normalized.market_indicators.market_cap))}
      ${ticker("RSI", fixed(normalized.market_indicators.rsi, 1), "gold")}
      ${ticker("MACD", fixed(normalized.market_indicators.macd, 2), toneFor(normalized.market_indicators.macd))}
      ${ticker("EMA", money(normalized.market_indicators.ema))}
      ${ticker("ATR", fixed(normalized.market_indicators.atr, 2))}
    </section>

    <section class="verdict-grid">
      <article class="panel final-verdict-card">
        <div>
          <p class="eyebrow">AI Final Verdict</p>
          <h2>${escapeHtml(strategyName(recommended))}</h2>
          <p>${escapeHtml(verdict.why_recommended)}</p>
        </div>
        <div class="verdict-score-stack">
          ${score("Confidence", `${fixed(verdict.confidence_score, 0)}%`, "profit")}
          ${score("Market Regime", displayMarketRegime(verdict.market_regime), "gold")}
          ${score("Risk Level", riskLabel(recommended.metrics.risk_score), riskTone(recommended.metrics.risk_score))}
        </div>
      </article>
      <article class="panel confidence-card">
        <p class="eyebrow">Confidence Breakdown</p>
        <div class="confidence-list">
          ${confidenceBreakdown(normalized, recommended).map((item) => `
            <div class="confidence-item">
              <span>${escapeHtml(item.label)}</span>
              <strong>${item.value}%</strong>
              <i style="--fill:${item.value}%"></i>
            </div>
          `).join("")}
        </div>
      </article>
      <article class="panel rejected-card">
        <p class="eyebrow">Why not the others</p>
        <div class="rejected-list">
          ${verdict.rejected_strategies.map((item) => `
            <div class="rejected-item">
              <strong>${escapeHtml(strategyName(item))}</strong>
              <span>${escapeHtml(item.reason)}</span>
            </div>
          `).join("")}
        </div>
      </article>
    </section>

    <section class="panel recommended-panel compact-recommended">
      <div class="recommendation-copy">
        <p class="eyebrow">AI Recommended</p>
        <h2>${escapeHtml(recommended.name)}</h2>
        <p>${escapeHtml(recommended.description)}</p>
      </div>
      <div class="compact-score-grid">
        ${score("Return", pct(scenario.metrics.return_pct), "profit")}
        ${score("Sharpe", fixed(recommended.metrics.sharpe_ratio, 2), "gold")}
        ${score("Win", `${fixed(recommended.metrics.win_rate, 1)}%`, "profit")}
        ${score("DD", pct(-scenario.metrics.max_drawdown), "danger")}
        ${score("Risk", `${fixed(recommended.metrics.risk_score, 0)}/100`, riskTone(recommended.metrics.risk_score))}
        ${score("Size", `${fixed(scenario.metrics.position_size, 0)}%`, "gold")}
      </div>
    </section>

    <section class="explain-grid">
      ${recommendationExplanation(normalized, recommended)}
      <article class="panel explain-card">
        <p class="eyebrow">Backtest meaning</p>
        <h2>Portfolio value starts at $10,000</h2>
        <p>The equity curve is simulated account value, not ${escapeHtml(normalized.asset)} price. Price is shown in the real K-line chart; backtest value shows how a $10,000 portfolio would have moved under the selected Strategy Skill.</p>
      </article>
    </section>

    <section class="panel compact-panel">
      <div class="compact-heading"><p class="eyebrow">Strategy comparison</p><h2>3 Strategy Skills</h2></div>
      <p class="section-note">All three strategies run on the same historical OHLCV window. The AI recommends the best risk-adjusted candidate, not the loudest raw return.</p>
      ${comparisonTable(normalized.strategies, recommended.id)}
    </section>

    <section class="triple-chart-grid compact-workspace">
      <article class="panel">
        <div class="compact-heading"><p class="eyebrow">Price chart</p><h2>${escapeHtml(normalized.asset)}/USDT OHLCV</h2></div>
        <div class="chart-legend">
          <span><i class="legend-equity"></i>Close up</span>
          <span><i class="legend-drawdown"></i>Close down</span>
        </div>
        <div class="chart-box candle-box">${candlestickChart(normalized.historical_candles)}</div>
      </article>
      <article class="panel">
        <div class="compact-heading"><p class="eyebrow">Backtest chart</p><h2>Portfolio Value ($10,000 initial)</h2></div>
        <div class="chart-legend">
          <span><i class="legend-equity"></i>Strategy portfolio value</span>
          <span><i class="legend-benchmark"></i>Buy-and-hold benchmark</span>
        </div>
        <div class="chart-box">${dualLineChart(scenario.equity_curve, scenario.benchmark_curve, normalized.historical_candles)}</div>
      </article>
      <article class="panel">
        <div class="compact-heading"><p class="eyebrow">Drawdown</p><h2>Risk Trace</h2></div>
        <div class="chart-legend">
          <span><i class="legend-drawdown"></i>Drawdown</span>
        </div>
        <div class="chart-box">${singleLineChart(scenario.drawdown_curve, "drawdown", normalized.historical_candles)}</div>
      </article>
    </section>

    <section class="workspace-grid compact-workspace">
      <article class="panel">
        <div class="compact-heading"><p class="eyebrow">What-if risk simulator</p><h2>${escapeHtml(riskProfiles[activeRiskProfile].label)} mode</h2></div>
        <div class="risk-toggle">
          ${Object.entries(riskProfiles).map(([key, value]) => `<button class="risk-button ${key === activeRiskProfile ? "active" : ""}" data-risk="${key}" type="button">${escapeHtml(value.label)}</button>`).join("")}
        </div>
        <div class="simulator-row">
          ${score("Position", `${fixed(scenario.metrics.position_size, 0)}%`)}
          ${score("Stop", `${fixed(scenario.metrics.stop_loss, 0)}%`)}
          ${score("Take", `${fixed(scenario.metrics.take_profit, 0)}%`)}
          ${score("Return", pct(scenario.metrics.return_pct), "profit")}
          ${score("Drawdown", pct(-scenario.metrics.max_drawdown), "danger")}
        </div>
      </article>

      <article class="panel">
        <div class="compact-heading"><p class="eyebrow">AI Decision Log</p><h2>Agent reasoning</h2></div>
        <details class="decision-details">
          <summary>Expand full Data Analyst / Quant Strategist / Risk Manager log</summary>
          <pre id="decisionLog" class="decision-log" aria-live="polite"></pre>
        </details>
      </article>
    </section>

    <section class="workspace-grid compact-workspace">
      <article class="panel">
        <div class="compact-heading"><p class="eyebrow">Executable strategy spec</p><h2>Backtestable rules</h2></div>
        <div class="callout"><strong>Entry rules</strong>${stringList(recommended.entry_rules)}</div>
        <div class="callout"><strong>Exit rules</strong>${stringList(recommended.exit_rules)}</div>
      </article>
      <article class="panel json-panel">
        <div class="compact-heading"><p class="eyebrow">Export Strategy JSON</p><h2>Submission payload</h2></div>
        <div class="export-actions">
          <button id="copyJsonButton" type="button">Copy Strategy JSON</button>
          <button id="downloadJsonButton" type="button">Download Strategy JSON</button>
        </div>
        <pre>${escapeHtml(JSON.stringify(buildExportJson(normalized, recommended, scenario), null, 2))}</pre>
      </article>
    </section>

    <section class="compact-brief-grid footer-brief-grid">
      ${compactCompliancePanel(isLive)}
      ${compactSourcePanel(normalized, isLive)}
      ${compactFlowPanel()}
    </section>
  `;

  bindDynamicControls(normalized);
  typeDecisionLog(normalized.ai_decision_log);
}

function normalizeResponse(raw) {
  const data = structuredClone(raw || {});
  const fallbackMarket = data.market_indicators || {};
  data.asset = data.asset || fallbackMarket.asset || els.symbol.value.trim().toUpperCase() || "BNB";
  data.risk_profile = data.risk_profile || els.riskProfile.value || "balanced";
  data.horizon = data.horizon || els.horizon.value || "swing";
  data.lookback_days = safeNumber(data.lookback_days, Number(els.lookbackDays.value) || 30);
  data.market_indicators = {
    asset: data.asset,
    data_source: fallbackMarket.data_source || "CoinMarketCap-style Demo Fallback",
    price: safeNumber(fallbackMarket.price, 0),
    change_24h: safeNumber(fallbackMarket.change_24h, 0),
    change_7d: safeNumber(fallbackMarket.change_7d, 0),
    volume: safeNumber(fallbackMarket.volume, 0),
    market_cap: safeNumber(fallbackMarket.market_cap, 0),
    rsi: safeNumber(fallbackMarket.rsi, 50),
    macd: safeNumber(fallbackMarket.macd, 0),
    ema: safeNumber(fallbackMarket.ema, fallbackMarket.price || 0),
    atr: safeNumber(fallbackMarket.atr, 0),
    fear_and_greed: safeNumber(fallbackMarket.fear_and_greed, 50),
  };
  data.historical_candles = Array.isArray(data.historical_candles)
    ? data.historical_candles.map(normalizeCandle).filter(Boolean)
    : [];
  data.strategies = Array.isArray(data.strategies) ? data.strategies.map((strategy) => normalizeStrategy(strategy, data)) : [];
  if (!data.strategies.length) {
    data.strategies = [normalizeStrategy({}, data)];
  }
  const recommendedId = data.recommended_strategy?.id;
  data.recommended_strategy = normalizeStrategy(
    data.strategies.find((strategy) => strategy.id === recommendedId) || data.recommended_strategy || data.strategies[0],
    data,
  );
  data.agent_verdict = normalizeVerdict(data.agent_verdict, data, data.recommended_strategy);
  data.ai_decision_log = data.ai_decision_log || "## AI Decision Log\n\nNo reasoning log was returned by the backend.";
  return data;
}

function normalizeVerdict(verdict, data, recommended) {
  const rawRejected = Array.isArray(verdict?.rejected_strategies) ? verdict.rejected_strategies : [];
  const fallbackRejected = data.strategies
    .filter((strategy) => strategy.id !== recommended.id)
    .map((strategy) => ({
      id: strategy.id,
      name: strategy.name,
      reason: strategy.metrics.sharpe_ratio < 0
        ? "negative Sharpe means poor risk-adjusted behavior in this window"
        : "composite score was weaker after return, Sharpe, drawdown, and risk were balanced",
    }));

  return {
    confidence_score: safeNumber(verdict?.confidence_score, deriveConfidence(recommended, data.market_indicators)),
    market_regime: verdict?.market_regime || deriveMarketRegime(data.market_indicators),
    bullish_signals: Array.isArray(verdict?.bullish_signals) ? verdict.bullish_signals : [],
    bearish_risks: Array.isArray(verdict?.bearish_risks) ? verdict.bearish_risks : [],
    why_recommended: verdict?.why_recommended || `${strategyName(recommended)} has the best risk-adjusted score across the tested Strategy Skills.`,
    rejected_strategies: (rawRejected.length ? rawRejected : fallbackRejected).map((item) => ({
      id: item.id || "strategy",
      name: item.name || titleCase(item.id || "strategy"),
      reason: item.reason || "weaker composite score in the deterministic backtest",
    })),
  };
}

function normalizeCandle(candle) {
  if (!candle) return null;
  return {
    date: String(candle.date || ""),
    open: safeNumber(candle.open, 0),
    high: safeNumber(candle.high, 0),
    low: safeNumber(candle.low, 0),
    close: safeNumber(candle.close, 0),
    volume: safeNumber(candle.volume, 0),
  };
}

function normalizeStrategy(strategy, data) {
  const metrics = strategy.metrics || {};
  const id = strategy.id || "momentum";
  const curve = Array.isArray(strategy.equity_curve) && strategy.equity_curve.length ? strategy.equity_curve : [10000, 10000];
  const benchmark = Array.isArray(strategy.benchmark_curve) && strategy.benchmark_curve.length ? strategy.benchmark_curve : curve;
  const drawdown = Array.isArray(strategy.drawdown_curve) && strategy.drawdown_curve.length ? strategy.drawdown_curve : [0, 0];

  return {
    id,
    name: strategy.name || `${data.asset} ${titleCase(id)} Strategy Skill`,
    description: strategy.description || "Backtestable strategy generated from market indicators.",
    entry_rules: Array.isArray(strategy.entry_rules) ? strategy.entry_rules : [],
    exit_rules: Array.isArray(strategy.exit_rules) ? strategy.exit_rules : [],
    metrics: {
      return_pct: safeNumber(metrics.return_pct, 0),
      sharpe_ratio: safeNumber(metrics.sharpe_ratio, 0),
      win_rate: safeNumber(metrics.win_rate, 0),
      max_drawdown: safeNumber(metrics.max_drawdown, 0),
      risk_score: safeNumber(metrics.risk_score, 50),
      position_size: safeNumber(metrics.position_size, riskProfiles[data.risk_profile]?.position_size || 20),
      stop_loss: safeNumber(metrics.stop_loss, riskProfiles[data.risk_profile]?.stop_loss || 6),
      take_profit: safeNumber(metrics.take_profit, riskProfiles[data.risk_profile]?.take_profit || 13),
    },
    equity_curve: curve.map((item) => safeNumber(item, 10000)),
    benchmark_curve: benchmark.map((item) => safeNumber(item, 10000)),
    drawdown_curve: drawdown.map((item) => safeNumber(item, 0)),
  };
}

function buildRiskScenario(strategy, profileName) {
  const profile = riskProfiles[profileName] || riskProfiles.balanced;
  const base = strategy.metrics;
  const scale = profile.returnMultiplier;
  const drawdownScale = profile.drawdownMultiplier;

  return {
    metrics: {
      ...base,
      position_size: profile.position_size,
      stop_loss: profile.stop_loss,
      take_profit: profile.take_profit,
      return_pct: round(base.return_pct * scale, 2),
      max_drawdown: round(base.max_drawdown * drawdownScale, 2),
    },
    equity_curve: scaleCurve(strategy.equity_curve, scale),
    benchmark_curve: strategy.benchmark_curve,
    drawdown_curve: strategy.drawdown_curve.map((value) => round(value * drawdownScale, 2)),
  };
}

function scaleCurve(curve, multiplier) {
  const start = curve[0] || 10000;
  return curve.map((value) => round(start + (value - start) * multiplier, 2));
}

function comparisonTable(strategies, recommendedId) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Strategy</th>
            <th>Return</th>
            <th>Sharpe Ratio</th>
            <th>Win Rate</th>
            <th>Max Drawdown</th>
            <th>Risk Score</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${strategies.map((strategy) => `
            <tr class="${strategy.id === recommendedId ? "recommended-row" : ""}">
              <td><strong>${strategyName(strategy)}</strong></td>
              <td>${pct(strategy.metrics.return_pct)}</td>
              <td>${fixed(strategy.metrics.sharpe_ratio, 2)}</td>
              <td>${fixed(strategy.metrics.win_rate, 2)}%</td>
              <td>${pct(-strategy.metrics.max_drawdown)}</td>
              <td><span class="risk-chip ${riskTone(strategy.metrics.risk_score)}">${fixed(strategy.metrics.risk_score, 0)}/100 ${riskLabel(strategy.metrics.risk_score)}</span></td>
              <td>${strategy.id === recommendedId ? `<span class="gold-badge">AI Recommended</span>` : `<span class="table-pill">Candidate</span>`}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function agentWorkflow() {
  const steps = [
    ["Market Data", "CMC + OHLCV"],
    ["AI Strategy", "3 skills"],
    ["Backtest", "deterministic"],
    ["Export", "JSON spec"],
  ];
  return `
    <section class="agent-workflow" aria-label="Agent workflow">
      ${steps.map(([label, value], index) => `
        <article>
          <span>${index + 1}</span>
          <strong>${escapeHtml(label)}</strong>
          <em>${escapeHtml(value)}</em>
        </article>
      `).join("")}
    </section>
  `;
}

function recommendationExplanation(data, recommended) {
  const competitors = data.strategies.filter((strategy) => strategy.id !== recommended.id);
  const bestCompetitor = competitors.sort((a, b) => b.metrics.sharpe_ratio - a.metrics.sharpe_ratio)[0];
  const reasons = [
    `${strategyName(recommended)} delivered ${pct(recommended.metrics.return_pct)} return with ${pct(-recommended.metrics.max_drawdown)} max drawdown.`,
    `Risk-adjusted Sharpe is ${fixed(recommended.metrics.sharpe_ratio, 2)}, which beats the weaker candidates in this window.`,
    `${bestCompetitor ? `${strategyName(bestCompetitor)} was tested too, but had ${pct(bestCompetitor.metrics.return_pct)} return and ${fixed(bestCompetitor.metrics.sharpe_ratio, 2)} Sharpe.` : "The other candidates were tested on the same OHLCV window."}`,
  ];
  return `
    <article class="panel explain-card">
      <p class="eyebrow">Why AI recommended this</p>
      <h2>${escapeHtml(strategyName(recommended))} fit the current market</h2>
      <ul class="explain-list">
        ${reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
      </ul>
    </article>
  `;
}

function dualLineChart(equityCurve, benchmarkCurve, candles = []) {
  return chartSvg([
    { name: "Portfolio", values: equityCurve, color: "#22c55e", width: 4, format: money },
    { name: "Benchmark", values: benchmarkCurve, color: "#f0b90b", width: 3, format: money },
  ], "equity and benchmark curves", candles, money);
}

function singleLineChart(values, mode, candles = []) {
  const formatter = (value) => `${fixed(value, 2)}%`;
  return chartSvg([{ name: "Drawdown", values, color: mode === "drawdown" ? "#f87171" : "#22c55e", width: 4, format: formatter }], `${mode} curve`, candles, formatter);
}

function candlestickChart(candles) {
  if (!candles.length) return `<div class="chart-empty">No candle data</div>`;
  const width = 760;
  const height = 260;
  const padding = { top: 16, right: 54, bottom: 34, left: 12 };
  const values = candles.flatMap((candle) => [candle.high, candle.low]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const step = innerWidth / Math.max(candles.length, 1);
  const bodyWidth = Math.max(3, Math.min(12, step * 0.58));
  const y = (value) => padding.top + (max - value) / range * innerHeight;
  const x = (index) => padding.left + index * step + step / 2;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const gy = padding.top + ratio * innerHeight;
    const price = max - ratio * range;
    return `<line x1="${padding.left}" y1="${gy}" x2="${width - padding.right}" y2="${gy}" class="chart-grid-line" /><text x="${width - padding.right + 8}" y="${gy + 4}" class="axis-label">${money(price)}</text>`;
  }).join("");
  const marks = candles.map((candle, index) => {
    const cx = x(index);
    const openY = y(candle.open);
    const closeY = y(candle.close);
    const highY = y(candle.high);
    const lowY = y(candle.low);
    const up = candle.close >= candle.open;
    const color = up ? "#22c55e" : "#f87171";
    const top = Math.min(openY, closeY);
    const bodyHeight = Math.max(2, Math.abs(closeY - openY));
    return `<g><line x1="${cx}" y1="${highY}" x2="${cx}" y2="${lowY}" stroke="${color}" stroke-width="1.4" /><rect x="${cx - bodyWidth / 2}" y="${top}" width="${bodyWidth}" height="${bodyHeight}" fill="${color}" rx="1"><title>${escapeHtml(candle.date)} O:${candle.open} H:${candle.high} L:${candle.low} C:${candle.close}</title></rect></g>`;
  }).join("");
  const first = candles[0];
  const mid = candles[Math.floor(candles.length / 2)];
  const last = candles[candles.length - 1];
  const labels = [
    [first.date, x(0)],
    [mid.date, x(Math.floor(candles.length / 2))],
    [last.date, x(candles.length - 1)],
  ].map(([date, lx]) => `<text x="${lx}" y="${height - 10}" text-anchor="middle" class="axis-label">${escapeHtml(String(date).slice(5))}</text>`).join("");
  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="real historical candlestick chart with time and price">
      <rect x="0" y="0" width="${width}" height="${height}" rx="16" class="chart-bg"></rect>
      ${grid}
      ${marks}
      ${labels}
    </svg>
  `;
}

function chartSvg(series, label, candles = [], axisFormatter = (value) => String(value)) {
  const width = 760;
  const height = 280;
  const padding = { top: 16, right: 58, bottom: 34, left: 14 };
  const allValues = series.flatMap((item) => item.values);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const yScale = (value) => height - padding.bottom - ((value - min) / range) * innerHeight;
  const xScale = (index, total) => padding.left + (index / Math.max(total - 1, 1)) * innerWidth;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const y = padding.top + ratio * innerHeight;
    const value = max - ratio * range;
    return `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" class="chart-grid-line" /><text x="${width - padding.right + 8}" y="${y + 4}" class="axis-label">${escapeHtml(axisFormatter(value))}</text>`;
  }).join("");

  const polylines = series.map((item) => {
    const points = item.values.map((value, index) => {
      const x = xScale(index, item.values.length);
      const y = yScale(value);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const hoverPoints = item.values.map((value, index) => {
      const date = candles[index]?.date || `Day ${index + 1}`;
      const x = xScale(index, item.values.length);
      const y = yScale(value);
      const valueText = item.format ? item.format(value) : String(value);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="transparent" stroke="transparent"><title>${escapeHtml(item.name)} ${escapeHtml(date)}: ${escapeHtml(valueText)}</title></circle>`;
    }).join("");
    return `<g><polyline points="${points}" fill="none" stroke="${item.color}" stroke-width="${item.width}" stroke-linecap="round" stroke-linejoin="round" />${hoverPoints}</g>`;
  }).join("");
  const dateLabels = buildDateLabels(candles, series[0]?.values.length || 0, xScale, height);

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(label)}">
      <rect x="0" y="0" width="${width}" height="${height}" rx="16" class="chart-bg"></rect>
      ${grid}
      ${polylines}
      ${dateLabels}
    </svg>
  `;
}

function buildDateLabels(candles, count, xScale, height) {
  if (!count) return "";
  const indexes = Array.from(new Set([0, Math.floor((count - 1) / 2), count - 1]));
  return indexes.map((index) => {
    const date = candles[index]?.date || `D${index + 1}`;
    return `<text x="${xScale(index, count)}" y="${height - 10}" text-anchor="middle" class="axis-label">${escapeHtml(String(date).slice(5))}</text>`;
  }).join("");
}

function bindDynamicControls(data) {
  document.querySelectorAll("[data-risk]").forEach((button) => {
    button.addEventListener("click", () => {
      activeRiskProfile = button.dataset.risk;
      renderResults(data);
    });
  });

  const exportJson = buildExportJson(data, data.recommended_strategy, buildRiskScenario(data.recommended_strategy, activeRiskProfile));
  document.querySelector("#copyJsonButton")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(JSON.stringify(exportJson, null, 2));
  });
  document.querySelector("#downloadJsonButton")?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(exportJson, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${data.asset.toLowerCase()}-${data.recommended_strategy.id}-strategy.json`;
    link.click();
    URL.revokeObjectURL(url);
  });
}

function typeDecisionLog(text) {
  clearInterval(typewriterTimer);
  const target = document.querySelector("#decisionLog");
  if (!target) return;

  target.textContent = "";
  let index = 0;
  typewriterTimer = setInterval(() => {
    index += 6;
    target.textContent = text.slice(0, index);
    if (index >= text.length) {
      clearInterval(typewriterTimer);
    }
  }, 18);
}

function buildExportJson(data, strategy, scenario) {
  return {
    schema_version: "signalforge.strategy_skill.v1",
    track: "BNB Hack Track 2 - Strategy Skills",
    project: "SignalForge AI",
    asset: data.asset,
    risk_profile: activeRiskProfile,
    horizon: data.horizon,
    initial_capital: 10000,
    execution_type: "backtest_only",
    no_wallet_required: true,
    no_real_trading: true,
    data_sources: {
      live_market_data: data.market_indicators.data_source.includes("Live CoinMarketCap Data") ? "CoinMarketCap API" : "CoinMarketCap-style demo fallback",
      historical_ohlcv: data.market_indicators.data_source.includes("Binance Public OHLCV") ? "Binance public OHLCV via CCXT" : "deterministic historical fallback",
      indicator_engine: "Python ta",
      backtest_engine: "deterministic Python long-only backtest",
    },
    indicators_used: ["RSI", "MACD", "MACD Signal", "EMA", "ATR", "Fear & Greed", "Volume SMA", "Breakout High"],
    strategy_type: strategy.id,
    strategy_name: strategy.name,
    entry_rules: strategy.entry_rules,
    exit_rules: strategy.exit_rules,
    stop_loss: scenario.metrics.stop_loss,
    take_profit: scenario.metrics.take_profit,
    position_size: scenario.metrics.position_size,
    risk_limits: {
      max_position_size: scenario.metrics.position_size,
      max_drawdown: scenario.metrics.max_drawdown,
      no_wallet_execution: true,
      strategy_skill_only: true,
    },
    backtest_metrics: {
      return: scenario.metrics.return_pct,
      sharpe_ratio: strategy.metrics.sharpe_ratio,
      win_rate: strategy.metrics.win_rate,
      max_drawdown: scenario.metrics.max_drawdown,
      risk_score: strategy.metrics.risk_score,
      risk_level: riskLabel(strategy.metrics.risk_score),
    },
    agent_verdict: {
      confidence_score: data.agent_verdict.confidence_score,
      market_regime: data.agent_verdict.market_regime,
      market_regime_display: displayMarketRegime(data.agent_verdict.market_regime),
      why_recommended: data.agent_verdict.why_recommended,
      rejected_strategies: data.agent_verdict.rejected_strategies,
      confidence_components: confidenceBreakdown(data, strategy),
    },
    reasoning_summary: data.ai_decision_log,
  };
}

function trackCompliancePanel(isLive) {
  const items = [
    ["Uses CoinMarketCap live market data", isLive],
    ["Generates backtestable Strategy Skill spec", true],
    ["Runs deterministic Python backtest", true],
    ["Exports executable Strategy JSON", true],
    ["No wallet connection", true],
    ["No real trading execution", true],
    ["BNB ecosystem assets supported", true],
  ];
  return `
    <article class="panel judge-panel compliance-panel">
      <p class="eyebrow">Track 2 Compliance</p>
      <h2>Strategy Skills</h2>
      <ul class="check-list">
        ${items.map(([label, ok]) => `<li class="${ok ? "ok" : "warn"}"><span>${ok ? "OK" : "!"}</span>${escapeHtml(label)}</li>`).join("")}
      </ul>
    </article>
  `;
}

function compactCompliancePanel(isLive) {
  const items = [
    ["CMC", isLive],
    ["Skill JSON", true],
    ["Backtest", true],
    ["No Wallet", true],
    ["No Trading", true],
    ["BNB Assets", true],
  ];
  return `
    <article class="mini-brief">
      <span>Track 2</span>
      <strong>Strategy Skills</strong>
      <div class="mini-checks">
        ${items.map(([label, ok]) => `<b class="${ok ? "ok" : "warn"}">${escapeHtml(label)}</b>`).join("")}
      </div>
    </article>
  `;
}

function dataSourcePanel(data, isLive) {
  const market = data.market_indicators;
  return `
    <article class="panel judge-panel source-panel">
      <p class="eyebrow">Data Source Transparency</p>
      <h2>What powers this run</h2>
      <div class="source-list">
        ${sourceItem("Live Quote", isLive ? "CoinMarketCap API" : "Demo fallback", isLive ? "live" : "fallback")}
        ${sourceItem("Historical OHLCV", market.data_source.includes("Binance Public OHLCV") ? "Binance via CCXT" : "Deterministic fallback", market.data_source.includes("Binance Public OHLCV") ? "live" : "fallback")}
        ${sourceItem("Indicators", "Python ta: RSI, MACD, EMA, ATR", "engine")}
        ${sourceItem("Backtest", "Deterministic Python engine", "engine")}
        ${sourceItem("AI Role", "Reasoning + strategy selection", "engine")}
        ${sourceItem("Execution", "Strategy Skill JSON only", "engine")}
      </div>
    </article>
  `;
}

function compactSourcePanel(data, isLive) {
  const source = data.market_indicators.data_source;
  const historical = source.includes("Binance Public OHLCV") ? "Binance OHLCV" : "Historical fallback";
  return `
    <article class="mini-brief">
      <span>Data Stack</span>
      <strong>${isLive ? "CMC Live + " : "Fallback + "}${escapeHtml(historical)}</strong>
      <div class="mini-checks">
        <b class="${isLive ? "ok" : "warn"}">Quote</b>
        <b class="${source.includes("Binance Public OHLCV") ? "ok" : "warn"}">OHLCV</b>
        <b class="ok">ta</b>
        <b class="ok">Python</b>
      </div>
    </article>
  `;
}

function judgeFlowPanel() {
  const steps = [
    "Select BNB / CAKE / TWT",
    "Pull live CMC market context",
    "Load Binance historical OHLCV",
    "Compute RSI / MACD / EMA / ATR",
    "Generate 3 Strategy Skills",
    "Run deterministic backtest",
    "Export Strategy JSON",
  ];
  return `
    <article class="panel judge-panel flow-panel">
      <p class="eyebrow">Judge Demo Flow</p>
      <h2>2-minute path</h2>
      <ol class="demo-flow-list">
        ${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
      </ol>
    </article>
  `;
}

function compactFlowPanel() {
  return `
    <article class="mini-brief">
      <span>Judge Flow</span>
      <strong>Select -> Generate -> Compare -> Export</strong>
      <div class="mini-flow">
        <em>CMC</em><em>OHLCV</em><em>AI</em><em>Backtest</em><em>JSON</em>
      </div>
    </article>
  `;
}

function sourceItem(label, value, tone) {
  return `
    <div class="source-item ${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function metric(label, value, tone = "") {
  return `<article class="metric ${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
}

function ticker(label, value, tone = "") {
  return `<article class="ticker ${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
}

function score(label, value, tone = "") {
  return `<article class="score ${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
}

function rule(label, value, highlight = false) {
  return `<div class="${highlight ? "rule highlight" : "rule"}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function stringList(items) {
  return `<ul class="condition-list">${items.map((item) => `<li><code>${escapeHtml(item)}</code></li>`).join("")}</ul>`;
}

function strategyName(strategy) {
  if (strategy.id === "mean_reversion") return "Mean Reversion";
  return titleCase(strategy.id);
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value > 1000 ? 0 : 4 }).format(value);
}

function compact(value) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

function fixed(value, digits) {
  return safeNumber(value, 0).toFixed(digits);
}

function pct(value) {
  return `${safeNumber(value, 0) >= 0 ? "+" : ""}${fixed(value, 2)}%`;
}

function toneFor(value) {
  return safeNumber(value, 0) >= 0 ? "profit" : "danger";
}

function riskTone(value) {
  const score = safeNumber(value, 0);
  if (score >= 72) return "danger";
  if (score >= 50) return "gold";
  return "profit";
}

function riskLabel(value) {
  const score = safeNumber(value, 0);
  if (score >= 72) return "High";
  if (score >= 50) return "Medium";
  return "Low";
}

function displayMarketRegime(value) {
  const regime = String(value || "").toLowerCase();
  if (regime.includes("mean reversion") || regime.includes("sideways")) return "Mean Reversion Regime";
  if (regime.includes("high volatility")) return "High Volatility";
  if (regime.includes("bull")) return "Bull Market";
  if (regime.includes("bear")) return "Bear Market";
  return "Sideways Market";
}

function confidenceBreakdown(data, strategy) {
  const market = data.market_indicators || {};
  const rsi = safeNumber(market.rsi, 50);
  const macd = safeNumber(market.macd, 0);
  const change7d = Math.abs(safeNumber(market.change_7d, 0));
  const volume = safeNumber(market.volume, 0);
  const riskScore = safeNumber(strategy.metrics.risk_score, 50);
  const sharpe = safeNumber(strategy.metrics.sharpe_ratio, 0);

  return [
    { label: "RSI Alignment", value: Math.round(Math.max(12, 30 - Math.abs(rsi - 50) * 0.45)) },
    { label: "MACD Alignment", value: Math.round(Math.max(8, Math.min(25, 14 + Math.max(macd, 0) * 2 + Math.max(sharpe, 0) * 3))) },
    { label: "Volume Confirmation", value: volume > 1_000_000_000 ? 20 : volume > 100_000_000 ? 16 : 10 },
    { label: "Trend Stability", value: Math.round(Math.max(8, 20 - change7d * 0.7)) },
    { label: "Risk Score", value: Math.round(Math.max(4, 15 - riskScore * 0.14)) },
  ];
}

function deriveMarketRegime(market) {
  const volatilityRatio = safeNumber(market.atr, 0) / Math.max(safeNumber(market.price, 1), 1);
  if (volatilityRatio > 0.06 || safeNumber(market.fear_and_greed, 50) >= 78) return "High Volatility";
  if (safeNumber(market.change_7d, 0) > 3 && safeNumber(market.rsi, 50) >= 52 && safeNumber(market.macd, 0) > 0) return "Bull Market";
  if (safeNumber(market.change_7d, 0) < -3 && safeNumber(market.rsi, 50) <= 48) return "Bear Market";
  return "Sideways / Mean Reversion";
}

function deriveConfidence(strategy, market) {
  let score = 55;
  score += Math.min(Math.max(strategy.metrics.sharpe_ratio, -1), 3) * 7;
  score += Math.min(strategy.metrics.win_rate, 100) * 0.12;
  score += Math.max(strategy.metrics.return_pct, -10) * 0.8;
  score -= strategy.metrics.max_drawdown * 1.5;
  score -= Math.max(strategy.metrics.risk_score - 55, 0) * 0.25;
  if (market.data_source.includes("Live CoinMarketCap Data")) score += 5;
  if (market.data_source.includes("Binance Public OHLCV")) score += 7;
  return Math.min(Math.max(round(score, 1), 1), 95);
}

function titleCase(value) {
  return String(value).replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function round(value, digits) {
  const multiplier = 10 ** digits;
  return Math.round(safeNumber(value, 0) * multiplier) / multiplier;
}

function safeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
