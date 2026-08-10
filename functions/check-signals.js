// Runs on a schedule defined in netlify.toml (every 5 minutes), on Netlify's
// own servers — NOT in anyone's browser. This is what makes alerts and the
// signal history actually 24/7, independent of whether the website is open.

const { getStore } = require('@netlify/blobs');

const SYMBOLS = [
  'BTCUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ETHUSDT', 'PUMPUSDT', 'DOGEUSDT',
  'LTCUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'DOTUSDT', 'TRXUSDT', 'POLUSDT',
  'UNIUSDT', 'ATOMUSDT', 'NEARUSDT', 'APTUSDT', 'ARBUSDT', 'OPUSDT', 'SUIUSDT',
  'INJUSDT', 'FILUSDT', 'TIAUSDT', 'BCHUSDT', 'XLMUSDT', 'ETCUSDT', 'TONUSDT', 'PAXGUSDT'
];

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const HEARTBEAT_MS = 3 * 60 * 60 * 1000; // send a "still running" check every 3 hours
const HISTORY_CAP = 300;

// Explicit Blobs credentials — Netlify sometimes fails to auto-inject the Blobs
// environment even on properly connected sites (a known platform quirk). Passing
// siteID + token directly works around it reliably. Set NETLIFY_SITE_ID and
// NETLIFY_BLOBS_TOKEN as environment variables (see setup steps).
function getSignalStore() {
  return getStore({
    name: 'signal-tracker',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN
  });
}

// ---------- indicator math (same logic as the live page) ----------

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

function bollinger(closes, period, mult) {
  const slice = closes.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + (b - sma) ** 2, 0) / period;
  const stdev = Math.sqrt(variance);
  const upper = sma + mult * stdev, lower = sma - mult * stdev;
  const last = closes[closes.length - 1];
  return { percentB: (last - lower) / ((upper - lower) || 1) };
}

function swingLevels(candles, lookback) {
  const rel = candles.slice(-(lookback + 1), -1);
  return { swingHigh: Math.max(...rel.map(c => c.high)), swingLow: Math.min(...rel.map(c => c.low)) };
}

function setupStrength(distPct, rsiNow, rsiCenter, macdHist, atrNow, volRatio, adxNow, bbPercentB, isLong) {
  const trendScore = Math.min(Math.abs(distPct) / 3, 1) * 2;
  const rsiScore = Math.max(0, 1 - Math.abs(rsiNow - rsiCenter) / 7.5) * 2;
  const macdScore = Math.min(Math.abs(macdHist) / (atrNow * 0.08 || 1), 1) * 2;
  const volScore = Math.min(Math.max(volRatio - 1, 0) / 1, 1) * 2;
  const adxScore = Math.min(Math.max(adxNow - 20, 0) / 20, 1) * 1.5;
  const bbEdge = isLong ? bbPercentB : 1 - bbPercentB;
  const bbScore = Math.max(0, 1 - Math.max(bbEdge - 0.85, 0) / 0.15) * 0.5;
  return Math.round(Math.min(10, trendScore + rsiScore + macdScore + volScore + adxScore + bbScore));
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

async function fetchKlines(symbol, interval, limit) {
  const res = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Binance fetch failed for ${symbol} ${interval}: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.map(c => ({ high: +c[2], low: +c[3], close: +c[4], volume: +c[5], time: c[0] }));
}

function computeSignal(closes4h, closes1h, candles1h, volumes1h, closes15m) {
  const emaSeries = ema(closes4h, 50);
  const emaNow = emaSeries[emaSeries.length - 1];
  const price = closes4h[closes4h.length - 1];
  const trendUp = price > emaNow;
  const distPct = ((price - emaNow) / emaNow) * 100;

  const rsiNow = rsi(closes1h, 14);
  const atrNow = atr(candles1h, 14);
  const { line: macdLine, signal: macdSignalLine, hist: macdHist } = macd(closes1h);
  const macdBullish = macdLine > macdSignalLine;

  const avgVolume = volumes1h.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
  const lastVolume = volumes1h[volumes1h.length - 1];
  const volRatio = avgVolume > 0 ? lastVolume / avgVolume : 1;
  const volumeConfirmed = lastVolume > avgVolume;

  const adxNow = adx(candles1h, 14);
  const trending = adxNow > 20;

  const ema15 = ema(closes15m, 20);
  const trendUp15m = closes15m[closes15m.length - 1] > ema15[ema15.length - 1];

  const bb = bollinger(closes1h, 20, 2);
  const { swingHigh, swingLow } = swingLevels(candles1h, 40);

  const rsiLongZone = rsiNow >= 40 && rsiNow <= 55;
  const rsiShortZone = rsiNow >= 45 && rsiNow <= 60;

  let signal = 'WAIT', sl = null, tp = null, rr = null, strength = null;
  let watchDirection = null, signalStrength = null;

  if (trendUp && rsiLongZone && macdBullish && volumeConfirmed && trending && trendUp15m) {
    signal = 'LONG';
    strength = setupStrength(distPct, rsiNow, 47.5, macdHist, atrNow, volRatio, adxNow, bb.percentB, true);
    ({ sl, tp, rr } = structuralTargets('LONG', price, atrNow, swingLow, swingHigh, strength));
  } else if (!trendUp && rsiShortZone && !macdBullish && volumeConfirmed && trending && !trendUp15m) {
    signal = 'SHORT';
    strength = setupStrength(distPct, rsiNow, 52.5, macdHist, atrNow, volRatio, adxNow, bb.percentB, false);
    ({ sl, tp, rr } = structuralTargets('SHORT', price, atrNow, swingLow, swingHigh, strength));
  } else if (trendUp && rsiLongZone && macdBullish) {
    signal = 'WATCH'; watchDirection = 'LONG';
    signalStrength = setupStrength(distPct, rsiNow, 47.5, macdHist, atrNow, volRatio, adxNow, bb.percentB, true);
  } else if (!trendUp && rsiShortZone && !macdBullish) {
    signal = 'WATCH'; watchDirection = 'SHORT';
    signalStrength = setupStrength(distPct, rsiNow, 52.5, macdHist, atrNow, volRatio, adxNow, bb.percentB, false);
  }

  return { signal, watchDirection, signalStrength, price, sl, tp, rr, strength, trendUp, atrNow };
}

async function sendTelegram(text) {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log('sendTelegram skipped — TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set');
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' })
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.log(`Telegram send failed (${res.status}): ${errBody}`);
    }
  } catch (e) {
    console.log('Telegram send threw an error: ' + e.message);
  }
}

function fmt(p) {
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(3);
  if (p >= 0.01) return p.toFixed(4);
  return p.toFixed(6);
}

exports.handler = async function () {
  const store = getSignalStore();
  let state = (await store.get('state', { type: 'json' })) || { trades: {}, watchAlerts: {} };
  let weekly = (await store.get('weekly', { type: 'json' })) || { signals: 0, tp: 0, sl: 0, invalidated: 0, weekStart: Date.now() };
  let history = (await store.get('history', { type: 'json' })) || [];

  if (Date.now() - weekly.weekStart >= WEEK_MS) {
    weekly = { signals: 0, tp: 0, sl: 0, invalidated: 0, weekStart: Date.now() };
  }

  // Heartbeat: confirms the whole pipeline (schedule → Blobs → Telegram) is
  // genuinely alive, independent of whether any actual trading signal has fired.
  if (!state.lastHeartbeat || Date.now() - state.lastHeartbeat >= HEARTBEAT_MS) {
    state.lastHeartbeat = Date.now();
    await sendTelegram(
      `✅ <b>Tracker heartbeat</b> — still running.\n` +
      `This week so far: ${weekly.signals} signals, ${weekly.tp} TP, ${weekly.sl} SL, ${weekly.invalidated} invalidated.`
    );
  }

  function log(entry) {
    history.unshift({ ...entry, time: Date.now() });
    if (history.length > HISTORY_CAP) history = history.slice(0, HISTORY_CAP);
  }

  await Promise.all(SYMBOLS.map(async (sym) => {
    try {
      const [k4h, k1h, k15m] = await Promise.all([
        fetchKlines(sym, '4h', 120),
        fetchKlines(sym, '1h', 60),
        fetchKlines(sym, '15m', 30)
      ]);
      const closes4h = k4h.map(c => c.close);
      const closes1h = k1h.map(c => c.close);
      const volumes1h = k1h.map(c => c.volume);
      const closes15m = k15m.map(c => c.close);
      const result = computeSignal(closes4h, closes1h, k1h, volumes1h, closes15m);
      if (result.signal !== 'WAIT') {
        console.log(`${sym}: ${result.signal}${result.watchDirection ? ' ' + result.watchDirection : ''} — strength ${result.signal === 'WATCH' ? result.signalStrength : result.strength}/10`);
      }

      const ts = state.trades[sym];

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
          await sendTelegram(`${hit === 'WON' ? '✅' : '❌'} <b>${sym} ${ts.direction} ${hit === 'WON' ? 'TP HIT' : 'SL HIT'}</b>\nEntry $${fmt(ts.entry)} → Close $${fmt(price)}`);
          log({ sym, type: hit === 'WON' ? 'TP' : 'SL', direction: ts.direction, price });
        } else {
          // emergency invalidation, debounced over 2 consecutive runs (~10 min at
          // the 5-minute check interval)
          const CONFIRM_STRIKES = 2;
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
            await sendTelegram(`🚨 <b>${sym} ${ts.direction} INVALIDATED</b>\n${reason}. Close manually now.`);
            log({ sym, type: 'INVALIDATED', direction: ts.direction, price });
          }
        }
      } else {
        if (result.signal === 'LONG' || result.signal === 'SHORT') {
          state.trades[sym] = {
            status: 'active', direction: result.signal, entry: result.price,
            sl: result.sl, tp: result.tp, rr: result.rr, strength: result.strength,
            atrAtOpen: result.atrNow, trendUpAtOpen: result.trendUp, openedAt: Date.now()
          };
          weekly.signals++;
          state.watchAlerts[sym] = null; // clear watch tracking — this coin has a real trade now
          await sendTelegram(
            `📡 <b>${sym} ${result.signal}</b> (${result.strength}/10)\n` +
            `Entry: $${fmt(result.price)}\nSL: $${fmt(result.sl)}\nTP: $${fmt(result.tp)}\nR:R 1:${result.rr}`
          );
          log({ sym, type: 'SIGNAL', direction: result.signal, strength: result.strength, entry: result.price, sl: result.sl, tp: result.tp });
        } else if (result.signal === 'WATCH' && result.signalStrength >= 5) {
          // Alert on first crossing 5+, and again every time it climbs to a NEW
          // peak within the same episode (5→6→7→8→9→10) — not on every check,
          // and not on dips back down, only on genuine new highs.
          const w = state.watchAlerts[sym];
          const isNewEpisode = !w || w.direction !== result.watchDirection;
          const isNewPeak = !isNewEpisode && result.signalStrength > w.peak;
          if (isNewEpisode || isNewPeak) {
            const prevPeak = isNewEpisode ? null : w.peak;
            state.watchAlerts[sym] = { direction: result.watchDirection, peak: result.signalStrength };
            const upgradeNote = prevPeak !== null ? ` — up from ${prevPeak}/10` : '';
            await sendTelegram(`👀 <b>${sym} WATCH ${result.watchDirection}</b> (${result.signalStrength}/10 partial)${upgradeNote}`);
            log({ sym, type: 'WATCH', direction: result.watchDirection, strength: result.signalStrength });
          }
        } else if (result.signal !== 'WATCH') {
          state.watchAlerts[sym] = null;
        }
      }
    } catch (e) {
      // one symbol failing shouldn't stop the rest, but log it so failures are visible
      console.log(`${sym} failed: ${e.message}`);
    }
  }));

  await store.setJSON('state', state);
  await store.setJSON('weekly', weekly);
  await store.setJSON('history', history);

  return { statusCode: 200, body: 'ok' };
};
