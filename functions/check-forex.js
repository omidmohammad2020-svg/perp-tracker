// Runs every 15 minutes (see netlify.toml) — a separate, slower cadence than the
// crypto function because Twelve Data's free tier only allows 8 calls/min and
// 800/day. 5 instruments x 1 call each = 5 calls per run, well within budget at
// this interval. Uses a leaner single-timeframe (1h) 4-factor engine (trend, RSI
// zone, MACD confirm, ADX>20) instead of the crypto module's 6-factor/3-timeframe
// version, since that would need 3x the API calls this budget can't support.

const { getStore } = require('@netlify/blobs');

const INSTRUMENTS = [
  { symbol: 'EUR/USD', label: 'EUR/USD' },
  { symbol: 'GBP/USD', label: 'GBP/USD' }
];

const TD_API_KEY = process.env.TWELVE_DATA_API_KEY;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const HISTORY_CAP = 200;

function isNewCalendarMonth(timestamp) {
  const now = new Date();
  const then = new Date(timestamp);
  return now.getUTCFullYear() !== then.getUTCFullYear() || now.getUTCMonth() !== then.getUTCMonth();
}

// Identical logic to the crypto tracker's heartbeat check — same 3-hour UTC
// windows, so both fire together since they now share the same 5-min schedule.
function isHeartbeatWindow() {
  const now = new Date();
  return now.getUTCHours() % 3 === 0 && now.getUTCMinutes() < 5;
}

function getForexStore() {
  return getStore({
    name: 'forex-tracker',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN
  });
}

// ---------- indicator math (same core logic as the crypto module) ----------

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
  const trendScore = Math.min(Math.abs(distPct) / 1.5, 1) * 4; // FX moves are smaller %, tighter cap
  const rsiScore = Math.max(0, 1 - Math.abs(rsiNow - rsiCenter) / 7.5) * 3;
  const macdScore = Math.min(Math.abs(macdHist) / (atrNow * 0.08 || 1), 1) * 2;
  const adxScore = Math.min(Math.max(adxNow - 20, 0) / 20, 1) * 1;
  return Math.round(Math.min(10, trendScore + rsiScore + macdScore + adxScore));
}

async function fetchSeries(symbol) {
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1h&outputsize=100&apikey=${TD_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status === 'error' || !data.values) {
    throw new Error(`Twelve Data error for ${symbol}: ${data.message || JSON.stringify(data)}`);
  }
  // Twelve Data returns most-recent-first — reverse to chronological order
  return data.values.map(v => ({
    high: parseFloat(v.high), low: parseFloat(v.low), close: parseFloat(v.close)
  })).reverse();
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
  let watchDirection = null, signalStrength = null;

  if (trendUp && rsiLongZone && macdBullish && trending) {
    signal = 'LONG';
    strength = setupStrength(distPct, rsiNow, 47.5, macdHist, atrNow, adxNow);
    ({ sl, tp, rr } = structuralTargets('LONG', price, atrNow, swingLow, swingHigh, strength));
  } else if (!trendUp && rsiShortZone && !macdBullish && trending) {
    signal = 'SHORT';
    strength = setupStrength(distPct, rsiNow, 52.5, macdHist, atrNow, adxNow);
    ({ sl, tp, rr } = structuralTargets('SHORT', price, atrNow, swingLow, swingHigh, strength));
  } else if (trendUp && rsiLongZone && macdBullish) {
    signal = 'WATCH'; watchDirection = 'LONG';
    signalStrength = setupStrength(distPct, rsiNow, 47.5, macdHist, atrNow, adxNow);
  } else if (!trendUp && rsiShortZone && !macdBullish) {
    signal = 'WATCH'; watchDirection = 'SHORT';
    signalStrength = setupStrength(distPct, rsiNow, 52.5, macdHist, atrNow, adxNow);
  }

  return { signal, watchDirection, signalStrength, price, sl, tp, rr, strength, trendUp, atrNow };
}

function fmt(p) {
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(4);
  return p.toFixed(6);
}

async function sendTelegram(text) {
  const tagged = `💱 <b>FOREX TRACKER</b>\n${text}`;
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
  if (!TD_API_KEY) {
    console.log('TWELVE_DATA_API_KEY not set — skipping forex/commodities check entirely.');
    return { statusCode: 200, body: 'no api key configured' };
  }

  const store = getForexStore();
  let state = (await store.get('state', { type: 'json' })) || { trades: {}, watchAlerts: {}, latest: {} };
  if (!state.latest) state.latest = {};
  let weekly = (await store.get('weekly', { type: 'json' })) || { signals: 0, tp: 0, sl: 0, invalidated: 0, weekStart: Date.now() };
  let history = (await store.get('history', { type: 'json' })) || [];

  if (isNewCalendarMonth(weekly.weekStart)) {
    weekly = { signals: 0, tp: 0, sl: 0, invalidated: 0, weekStart: Date.now() };
  }

  if (isHeartbeatWindow()) {
    await sendTelegram(
      `✅ <b>Tracker heartbeat</b> — still running.\n` +
      `This month so far: ${weekly.signals} signals, ${weekly.tp} TP, ${weekly.sl} SL, ${weekly.invalidated} invalidated.`
    );
  }

  function log(entry) {
    history.unshift({ ...entry, time: Date.now() });
    if (history.length > HISTORY_CAP) history = history.slice(0, HISTORY_CAP);
  }

  for (const { symbol, label } of INSTRUMENTS) {
    try {
      const candles = await fetchSeries(symbol);
      const result = computeSignal(candles);
      state.latest[symbol] = {
        label, price: result.price, signal: result.signal,
        watchDirection: result.watchDirection, signalStrength: result.signalStrength,
        trendUp: result.trendUp, updatedAt: Date.now()
      };
      if (result.signal !== 'WAIT') {
        console.log(`${label}: ${result.signal}${result.watchDirection ? ' ' + result.watchDirection : ''} — strength ${result.signal === 'WATCH' ? result.signalStrength : result.strength}/10`);
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
          await sendTelegram(`${hit === 'WON' ? '✅' : '❌'} <b>${label} ${ts.direction} ${hit === 'WON' ? 'TP HIT' : 'SL HIT'}</b>\nEntry ${fmt(ts.entry)} → Close ${fmt(price)}`);
          log({ sym: label, type: hit === 'WON' ? 'TP' : 'SL', direction: ts.direction, price });
        } else {
          // 4 consecutive runs (~1 hour at 15-min cadence) before declaring invalid —
          // forex/commodities are slower-moving than crypto, so this window is wider
          // ~1 hour confirmation window at the 5-minute cadence (12 x 5min = 60min)
          const CONFIRM_STRIKES = 12;
          let flipped = false;
          if (ts.direction === 'LONG' && ts.trendUpAtOpen && !result.trendUp) flipped = true;
          if (ts.direction === 'SHORT' && !ts.trendUpAtOpen && result.trendUp) flipped = true;
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
            await sendTelegram(`🚨 <b>${label} ${ts.direction} INVALIDATED</b>\n${reason}. Close manually now.`);
            log({ sym: label, type: 'INVALIDATED', direction: ts.direction, price });
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
          state.watchAlerts[symbol] = null;
          await sendTelegram(
            `📡 <b>${label} ${result.signal}</b> (${result.strength}/10)\n` +
            `Entry: ${fmt(result.price)}\nSL: ${fmt(result.sl)}\nTP: ${fmt(result.tp)}\nR:R 1:${result.rr}`
          );
          log({ sym: label, type: 'SIGNAL', direction: result.signal, strength: result.strength, entry: result.price, sl: result.sl, tp: result.tp });
        } else if (result.signal === 'WATCH' && result.signalStrength >= 5) {
          const w = state.watchAlerts[symbol];
          const isNewEpisode = !w || w.direction !== result.watchDirection;
          const isNewPeak = !isNewEpisode && result.signalStrength > w.peak;
          if (isNewEpisode || isNewPeak) {
            const prevPeak = isNewEpisode ? null : w.peak;
            state.watchAlerts[symbol] = { direction: result.watchDirection, peak: result.signalStrength };
            const upgradeNote = prevPeak !== null ? ` — up from ${prevPeak}/10` : '';
            await sendTelegram(`👀 <b>${label} WATCH ${result.watchDirection}</b> (${result.signalStrength}/10 partial)${upgradeNote}`);
            log({ sym: label, type: 'WATCH', direction: result.watchDirection, strength: result.signalStrength });
          }
        } else if (result.signal !== 'WATCH') {
          state.watchAlerts[symbol] = null;
        }
      }
    } catch (e) {
      console.log(`${label} failed: ${e.message}`);
    }
  }

  await store.setJSON('state', state);
  await store.setJSON('weekly', weekly);
  await store.setJSON('history', history);

  return { statusCode: 200, body: 'ok' };
};
