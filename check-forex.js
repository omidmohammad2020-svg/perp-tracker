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

// Fires true once per day at 20:00 UTC = 00:00 (midnight) UAE time (UTC+4, no DST).
function isDailyRecapWindow() {
  const now = new Date();
  return now.getUTCHours() === 20 && now.getUTCMinutes() < 5;
}

// UAE calendar date (UTC+4) — so the daily period aligns with UAE midnight.
function uaeDateStr() {
  return new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
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
    // 2% minimum for forex — a 10% target (appropriate for crypto) would be an
    // essentially unreachable, multi-month move for a currency pair.
    const minTp = price * 1.02;
    if (tp < minTp) tp = minTp;
  } else {
    let d = Math.min(Math.max((swingHigh + atrNow * 0.25) - price, minD), maxD);
    sl = price + d; tp = price - d * rrTarget;
    const minTp = price * 0.98;
    if (tp > minTp) tp = minTp;
  }
  const actualRr = Math.abs(tp - price) / Math.abs(price - sl);
  return { sl, tp, rr: Math.round(actualRr * 10) / 10 };
}

function suggestedLeverage(strength) {
  return Math.max(2, Math.min(10, Math.round(strength)));
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
  const trending = adxNow > 25; // raised from 20 — stronger trend requirement,
                                  // since there's no more invalidation safety net
  const { swingHigh, swingLow } = swingLevels(candles, 40);

  const rsiLongZone = rsiNow >= 40 && rsiNow <= 55;
  const rsiShortZone = rsiNow >= 45 && rsiNow <= 60;
  const MIN_STRENGTH = 6;

  let signal = 'WAIT', sl = null, tp = null, rr = null, strength = null;
  let watchDirection = null, signalStrength = null;

  if (trendUp && rsiLongZone && macdBullish && trending) {
    const candidateStrength = setupStrength(distPct, rsiNow, 47.5, macdHist, atrNow, adxNow);
    if (candidateStrength >= MIN_STRENGTH) {
      signal = 'LONG';
      strength = candidateStrength;
      ({ sl, tp, rr } = structuralTargets('LONG', price, atrNow, swingLow, swingHigh, strength));
    }
  } else if (!trendUp && rsiShortZone && !macdBullish && trending) {
    const candidateStrength = setupStrength(distPct, rsiNow, 52.5, macdHist, atrNow, adxNow);
    if (candidateStrength >= MIN_STRENGTH) {
      signal = 'SHORT';
      strength = candidateStrength;
      ({ sl, tp, rr } = structuralTargets('SHORT', price, atrNow, swingLow, swingHigh, strength));
    }
  }
  if (signal === 'WAIT') {
    if (trendUp && rsiLongZone && macdBullish) {
      signal = 'WATCH'; watchDirection = 'LONG';
      signalStrength = setupStrength(distPct, rsiNow, 47.5, macdHist, atrNow, adxNow);
    } else if (!trendUp && rsiShortZone && !macdBullish) {
      signal = 'WATCH'; watchDirection = 'SHORT';
      signalStrength = setupStrength(distPct, rsiNow, 52.5, macdHist, atrNow, adxNow);
    }
  }

  return { signal, watchDirection, signalStrength, price, sl, tp, rr, strength, trendUp, atrNow, distPct };
}

function fmt(p) {
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(4);
  return p.toFixed(6);
}

function fmtDollarPnl(pnlPct, leverage) {
  const dollar = pnlPct * (leverage || 1);
  const sign = dollar >= 0 ? '+' : '-';
  return `${sign}$${Math.abs(dollar).toFixed(2)}`;
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

const STATE_VERSION = 2;

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
  let daily = (await store.get('daily', { type: 'json' })) || { date: uaeDateStr(), totalPnlPct: 0, count: 0 };

  if (state.version !== STATE_VERSION) {
    console.log(`Resetting all forex tracking data — new strategy version (${STATE_VERSION}).`);
    state = { trades: {}, watchAlerts: {}, latest: {}, version: STATE_VERSION };
    weekly = { signals: 0, tp: 0, sl: 0, invalidated: 0, weekStart: Date.now() };
    history = [];
    daily = { date: uaeDateStr(), totalPnlPct: 0, count: 0 };
    await store.setJSON('dailyLog', []);
    await sendTelegram('🔄 <b>Tracker reset</b> — new stricter strategy live (no more invalidation, confidence-based leverage). Starting fresh from now.');
  }

  if (isNewCalendarMonth(weekly.weekStart)) {
    weekly = { signals: 0, tp: 0, sl: 0, invalidated: 0, weekStart: Date.now() };
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

        if (!ts.breakevenMoved && ts.initialRisk) {
          const favorableMove = ts.direction === 'LONG' ? price - ts.entry : ts.entry - price;
          if (favorableMove >= ts.initialRisk) {
            ts.sl = ts.entry;
            ts.breakevenMoved = true;
            await sendTelegram(`🛡️ <b>${label} ${ts.direction} moved to breakeven</b>\nStop-loss now at entry (${fmt(ts.entry)}) — this trade can no longer close as a loss.`);
          }
        }

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
          const leveragedDollar = pnlPct * (ts.leverage || 1);
          daily.totalPnlPct += leveragedDollar;
          daily.count++;
          await sendTelegram(`${hit === 'WON' ? '✅' : '❌'} <b>${label} ${ts.direction} ${hit === 'WON' ? 'TP HIT' : 'SL HIT'}</b>\nEntry ${fmt(ts.entry)} → Close ${fmt(price)}\nP/L on $100 @ ${ts.leverage}x: ${fmtDollarPnl(pnlPct, ts.leverage)}`);
          log({ sym: label, type: hit === 'WON' ? 'TP' : 'SL', direction: ts.direction, price, pnlPct });
        }
        // No invalidation path anymore — resolves only via TP or SL.
      } else {
        if (result.signal === 'LONG' || result.signal === 'SHORT') {
          const leverage = suggestedLeverage(result.strength);
          const initialRisk = Math.abs(result.price - result.sl);
          state.trades[symbol] = {
            status: 'active', direction: result.signal, entry: result.price,
            sl: result.sl, tp: result.tp, rr: result.rr, strength: result.strength,
            leverage, initialRisk, breakevenMoved: false, openedAt: Date.now()
          };
          weekly.signals++;
          await sendTelegram(
            `📡 <b>${label} ${result.signal}</b> (${result.strength}/10)\n` +
            `Entry: ${fmt(result.price)}\nSL: ${fmt(result.sl)}\nTP: ${fmt(result.tp)}\nR:R 1:${result.rr}\n` +
            `Suggested leverage: ${leverage}x (based on setup confidence)`
          );
          log({ sym: label, type: 'SIGNAL', direction: result.signal, strength: result.strength, entry: result.price, sl: result.sl, tp: result.tp });
        }
        // WATCH tier no longer alerts.
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
      `Net P/L (on $100/trade): ${pnlEmoji} ${fmtDollarPnl(daily.totalPnlPct)}`
    );

    let dailyLog = (await store.get('dailyLog', { type: 'json' })) || [];
    dailyLog.unshift({ date: daily.date, totalPnlPct: daily.totalPnlPct, count: daily.count });
    dailyLog = dailyLog.slice(0, 35);
    await store.setJSON('dailyLog', dailyLog);

    if (new Date().getUTCDay() === 0) {
      const last7 = dailyLog.slice(0, 7);
      const weekTotal = last7.reduce((sum, d) => sum + d.totalPnlPct, 0);
      const dayLines = last7
        .slice()
        .reverse()
        .map(d => `${d.date}: ${d.totalPnlPct >= 0 ? '🟢' : '🔴'} ${fmtDollarPnl(d.totalPnlPct)} (${d.count} trade${d.count === 1 ? '' : 's'})`)
        .join('\n');
      await sendTelegram(
        `📅 <b>Weekly P/L Report</b> (last ${last7.length} days)\n` +
        `${dayLines}\n\n` +
        `Week total (on $100/trade): ${weekTotal >= 0 ? '🟢' : '🔴'} ${fmtDollarPnl(weekTotal)}`
      );
    }

    daily = { date: uaeDateStr(), totalPnlPct: 0, count: 0 };
  }
  await store.setJSON('daily', daily);

  return { statusCode: 200, body: 'ok' };
};
