// Runs every 10 minutes (see netlify.toml). Uses Yahoo Finance's UNOFFICIAL,
// undocumented chart endpoint — there is no official public Yahoo API. This is
// a commonly-used workaround (same one the popular `yfinance` library relies
// on) but it is NOT a supported, licensed data source: Yahoo could change the
// response format or block it at any time without notice. Every message this
// module sends is explicitly labeled with its source so that's never hidden.

const { getStore } = require('@netlify/blobs');

const INSTRUMENTS = [
  { symbol: 'ES=F', label: 'S&P 500 Futures (ES)' },
  { symbol: 'NQ=F', label: 'Nasdaq Futures (NQ)' },
  { symbol: 'YM=F', label: 'Dow Futures (YM)' },
  { symbol: 'CL=F', label: 'Crude Oil Futures (CL)' },
  { symbol: 'GC=F', label: 'Gold Futures (GC)' }
];

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const HISTORY_CAP = 200;

function isNewCalendarMonth(timestamp) {
  const now = new Date();
  const then = new Date(timestamp);
  return now.getUTCFullYear() !== then.getUTCFullYear() || now.getUTCMonth() !== then.getUTCMonth();
}

function isDailyRecapWindow() {
  const now = new Date();
  return now.getUTCHours() === 20 && now.getUTCMinutes() < 5;
}

function uaeDateStr() {
  return new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function getYahooStore() {
  return getStore({
    name: 'yahoo-tracker',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN
  });
}

// ---------- indicator math (same core logic as the other trackers) ----------

function ema(values, period) {
  const k = 2 / (period + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}

function rsi(values, period) {
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function atr(candles, period) {
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  let v = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) v = (v * (period - 1) + trs[i]) / period;
  return v;
}

function adx(candles, period) {
  const plusDM = [], minusDM = [], tr = [];
  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    tr.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    ));
  }
  function wilder(arr) {
    let s = [arr.slice(0, period).reduce((a, b) => a + b, 0)];
    for (let i = period; i < arr.length; i++) s.push(s[s.length - 1] - s[s.length - 1] / period + arr[i]);
    return s;
  }
  const smTR = wilder(tr), smP = wilder(plusDM), smM = wilder(minusDM);
  const plusDI = smP.map((v, i) => 100 * (v / (smTR[i] || 1)));
  const minusDI = smM.map((v, i) => 100 * (v / (smTR[i] || 1)));
  const dx = plusDI.map((v, i) => 100 * Math.abs(v - minusDI[i]) / ((v + minusDI[i]) || 1));
  return dx.slice(-period).reduce((a, b) => a + b, 0) / Math.min(period, dx.length);
}

function macd(closes) {
  const f = ema(closes, 12), s = ema(closes, 26);
  const line = closes.map((_, i) => f[i] - s[i]);
  const sig = ema(line, 9);
  const last = line.length - 1;
  return { line: line[last], signal: sig[last], hist: line[last] - sig[last] };
}

function swingLevels(candles, lookback) {
  const rel = candles.slice(-(lookback + 1), -1);
  return { swingHigh: Math.max(...rel.map(c => c.high)), swingLow: Math.min(...rel.map(c => c.low)) };
}

function structuralTargets(direction, price, atrNow, swingLow, swingHigh, strength) {
  const rrTarget = 1.5 + (strength / 10) * 2;
  const minD = atrNow * 0.5, maxD = atrNow * 3;
  let sl, tp;
  if (direction === 'LONG') {
    let d = Math.min(Math.max(price - (swingLow - atrNow * 0.25), minD), maxD);
    sl = price - d; tp = price + d * rrTarget;
  } else {
    let d = Math.min(Math.max((swingHigh + atrNow * 0.25) - price, minD), maxD);
    sl = price + d; tp = price - d * rrTarget;
  }
  return { sl, tp, rr: Math.round(rrTarget * 10) / 10 };
}

function setupStrength(distPct, rsiNow, rsiCenter, macdHist, atrNow, adxNow) {
  const trendScore = Math.min(Math.abs(distPct) / 1.5, 1) * 4;
  const rsiScore = Math.max(0, 1 - Math.abs(rsiNow - rsiCenter) / 7.5) * 3;
  const macdScore = Math.min(Math.abs(macdHist) / (atrNow * 0.08 || 1), 1) * 2;
  const adxScore = Math.min(Math.max(adxNow - 20, 0) / 20, 1) * 1;
  return Math.round(Math.min(10, trendScore + rsiScore + macdScore + adxScore));
}

async function fetchYahooSeries(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1h&range=10d`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  if (!res.ok) throw new Error(`Yahoo fetch failed for ${symbol}: ${res.status}`);
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo returned no data for ${symbol}: ${JSON.stringify(data).slice(0, 200)}`);
  const quote = result.indicators.quote[0];
  const candles = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    if (quote.high[i] == null || quote.low[i] == null || quote.close[i] == null) continue;
    candles.push({ high: quote.high[i], low: quote.low[i], close: quote.close[i] });
  }
  return candles; // Yahoo returns chronological order already (oldest first)
}

function computeSignal(candles) {
  const closes = candles.map(c => c.close);
  const emaSeries = ema(closes, 50);
  const emaNow = emaSeries[emaSeries.length - 1];
  const price = closes[closes.length - 1];
  const trendUp = price > emaNow;
  const distPct = ((price - emaNow) / emaNow) * 100;

  const rsiNow = rsi(closes, 14);
  const atrNow = atr(candles, 14);
  const { line: macdLine, signal: macdSignalLine, hist: macdHist } = macd(closes);
  const macdBullish = macdLine > macdSignalLine;
  const adxNow = adx(candles, 14);
  const trending = adxNow > 20;
  const { swingHigh, swingLow } = swingLevels(candles, 40);

  const rsiLongZone = rsiNow >= 40 && rsiNow <= 55;
  const rsiShortZone = rsiNow >= 45 && rsiNow <= 60;

  let signal = 'WAIT', sl = null, tp = null, rr = null, strength = null;

  if (trendUp && rsiLongZone && macdBullish && trending) {
    signal = 'LONG';
    strength = setupStrength(distPct, rsiNow, 47.5, macdHist, atrNow, adxNow);
    ({ sl, tp, rr } = structuralTargets('LONG', price, atrNow, swingLow, swingHigh, strength));
  } else if (!trendUp && rsiShortZone && !macdBullish && trending) {
    signal = 'SHORT';
    strength = setupStrength(distPct, rsiNow, 52.5, macdHist, atrNow, adxNow);
    ({ sl, tp, rr } = structuralTargets('SHORT', price, atrNow, swingLow, swingHigh, strength));
  }

  return { signal, price, sl, tp, rr, strength, trendUp, atrNow, distPct };
}

function fmt(p) {
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(6);
}

async function sendTelegram(text) {
  // Every message from this tracker is explicitly tagged as Yahoo-sourced,
  // unofficial data — never presented as if it were an equally-reliable
  // licensed feed like the crypto (Binance) or forex (Twelve Data) trackers.
  const tagged = `📺 <b>YAHOO TRACKER</b> <i>(unofficial source — Yahoo Finance)</i>\n${text}`;
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log('sendTelegram skipped — TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set');
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: tagged, parse_mode: 'HTML' })
    });
    if (!res.ok) console.log(`Telegram send failed (${res.status}): ${await res.text()}`);
  } catch (e) {
    console.log('Telegram send threw an error: ' + e.message);
  }
}

exports.handler = async function () {
  const store = getYahooStore();
  let state = (await store.get('state', { type: 'json' })) || { trades: {} };
  let weekly = (await store.get('weekly', { type: 'json' })) || { signals: 0, tp: 0, sl: 0, invalidated: 0, weekStart: Date.now() };
  let history = (await store.get('history', { type: 'json' })) || [];
  let daily = (await store.get('daily', { type: 'json' })) || { date: uaeDateStr(), totalPnlPct: 0, count: 0 };

  if (isNewCalendarMonth(weekly.weekStart)) {
    weekly = { signals: 0, tp: 0, sl: 0, invalidated: 0, weekStart: Date.now() };
  }

  function log(entry) {
    history.unshift({ ...entry, time: Date.now() });
    if (history.length > HISTORY_CAP) history = history.slice(0, HISTORY_CAP);
  }

  for (const { symbol, label } of INSTRUMENTS) {
    try {
      const candles = await fetchYahooSeries(symbol);
      const result = computeSignal(candles);
      if (result.signal !== 'WAIT') {
        console.log(`${label}: ${result.signal} — strength ${result.strength}/10`);
      }

      const ts = state.trades[symbol];

      if (ts && ts.status === 'active') {
        const price = result.price;
        let hit = null;
        if (ts.direction === 'LONG') {
          if (price >= ts.tp) hit = 'WON'; else if (price <= ts.sl) hit = 'LOST';
        } else {
          if (price <= ts.tp) hit = 'WON'; else if (price >= ts.sl) hit = 'LOST';
        }
        if (hit) {
          ts.status = 'closed'; ts.outcome = hit; ts.closePrice = price; ts.closedAt = Date.now();
          if (hit === 'WON') weekly.tp++; else weekly.sl++;
          const pnlPct = ts.direction === 'LONG'
            ? ((price - ts.entry) / ts.entry) * 100
            : ((ts.entry - price) / ts.entry) * 100;
          daily.totalPnlPct += pnlPct;
          daily.count++;
          await sendTelegram(`${hit === 'WON' ? '✅' : '❌'} <b>${label} ${ts.direction} ${hit === 'WON' ? 'TP HIT' : 'SL HIT'}</b>\nEntry ${fmt(ts.entry)} → Close ${fmt(price)}\nP/L: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`);
          log({ sym: label, type: hit === 'WON' ? 'TP' : 'SL', direction: ts.direction, price, pnlPct });
        } else {
          const CONFIRM_STRIKES = 12; // ~1 hour at the 5-min cadence
          const TREND_FLIP_BUFFER = 0.15;
          let flipped = false;
          if (ts.direction === 'LONG' && ts.trendUpAtOpen && !result.trendUp && Math.abs(result.distPct) > TREND_FLIP_BUFFER) flipped = true;
          if (ts.direction === 'SHORT' && !ts.trendUpAtOpen && result.trendUp && Math.abs(result.distPct) > TREND_FLIP_BUFFER) flipped = true;
          const volSpike = result.atrNow > ts.atrAtOpen * 3;
          ts.flipStrikes = flipped ? (ts.flipStrikes || 0) + 1 : 0;
          ts.volStrikes = volSpike ? (ts.volStrikes || 0) + 1 : 0;
          if (ts.flipStrikes >= CONFIRM_STRIKES || ts.volStrikes >= CONFIRM_STRIKES) {
            ts.status = 'emergency';
            const reason = ts.flipStrikes >= CONFIRM_STRIKES ? 'trend reversed and held' : 'volatility spike (ATR tripled) and held';
            ts.emergencyReason = reason;
            ts.emergencyPrice = price;
            ts.emergencyAt = Date.now();
            weekly.invalidated++;
            const pnlPct = ts.direction === 'LONG'
              ? ((price - ts.entry) / ts.entry) * 100
              : ((ts.entry - price) / ts.entry) * 100;
            ts.emergencyPnlPct = pnlPct;
            daily.totalPnlPct += pnlPct;
            daily.count++;
            const pnlText = `${pnlPct >= 0 ? '🟢' : '🔴'} ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`;
            await sendTelegram(`🚨 <b>${label} ${ts.direction} INVALIDATED</b>\n${reason}. Close manually now.\nP/L at this point: ${pnlText}`);
            log({ sym: label, type: 'INVALIDATED', direction: ts.direction, price, pnlPct });
          }
        }
      } else {
        if (result.signal === 'LONG' || result.signal === 'SHORT') {
          state.trades[symbol] = {
            status: 'active', direction: result.signal, entry: result.price,
            sl: result.sl, tp: result.tp, rr: result.rr, strength: result.strength,
            atrAtOpen: result.atrNow, trendUpAtOpen: result.trendUp, openedAt: Date.now()
          };
          weekly.signals++;
          await sendTelegram(
            `📡 <b>${label} ${result.signal}</b> (${result.strength}/10)\n` +
            `Entry: ${fmt(result.price)}\nSL: ${fmt(result.sl)}\nTP: ${fmt(result.tp)}\nR:R 1:${result.rr}`
          );
          log({ sym: label, type: 'SIGNAL', direction: result.signal, strength: result.strength, entry: result.price, sl: result.sl, tp: result.tp });
        }
      }
    } catch (e) {
      console.log(`${label} failed: ${e.message}`);
    }
  }

  await store.setJSON('state', state);
  await store.setJSON('weekly', weekly);
  await store.setJSON('history', history);

  if (isDailyRecapWindow()) {
    const pnlEmoji = daily.totalPnlPct >= 0 ? '🟢' : '🔴';
    await sendTelegram(
      `📊 <b>Daily P/L Recap</b> (${daily.date})\n` +
      `Trades closed today: ${daily.count}\n` +
      `Net P/L: ${pnlEmoji} ${daily.totalPnlPct >= 0 ? '+' : ''}${daily.totalPnlPct.toFixed(2)}%`
    );
    daily = { date: uaeDateStr(), totalPnlPct: 0, count: 0 };
  }
  await store.setJSON('daily', daily);

  return { statusCode: 200, body: 'ok' };
};
