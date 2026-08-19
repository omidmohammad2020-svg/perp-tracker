// Runs on a schedule defined in netlify.toml (every 5 minutes), on Netlify's
// own servers — NOT in anyone's browser. This is what makes alerts and the
// signal history actually 24/7, independent of whether the website is open.

const { getStore } = require('@netlify/blobs');

const SYMBOLS = [
  'BTCUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ETHUSDT', 'PUMPUSDT', 'DOGEUSDT',
  'LTCUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'DOTUSDT', 'TRXUSDT', 'POLUSDT',
  'UNIUSDT', 'ATOMUSDT', 'NEARUSDT', 'APTUSDT', 'ARBUSDT', 'OPUSDT', 'SUIUSDT',
  'INJUSDT', 'FILUSDT', 'TIAUSDT', 'BCHUSDT', 'XLMUSDT', 'ETCUSDT', 'TONUSDT',
  'PAXGUSDT', 'EOSUSDT', 'XTZUSDT', 'ALGOUSDT', 'VETUSDT', 'ICPUSDT', 'RUNEUSDT',
  'GRTUSDT', 'SANDUSDT', 'MANAUSDT', 'AAVEUSDT', 'MKRUSDT', 'CRVUSDT', 'LDOUSDT',
  'RENDERUSDT', 'HBARUSDT', 'THETAUSDT', 'KAVAUSDT', 'ZECUSDT', 'DASHUSDT', 'SEIUSDT',
  'WLDUSDT', 'SHIBUSDT', 'PEPEUSDT', 'BONKUSDT', 'FLOKIUSDT', 'WIFUSDT', 'NOTUSDT',
  'ORDIUSDT', 'STXUSDT', 'IMXUSDT', 'GALAUSDT', 'AXSUSDT', 'ENJUSDT', 'CHZUSDT',
  'FLOWUSDT', 'EGLDUSDT', 'NEOUSDT', 'IOTAUSDT', 'QTUMUSDT', 'ZILUSDT', 'ONTUSDT',
  'WAVESUSDT', 'KSMUSDT', 'BATUSDT', 'ENSUSDT', 'COMPUSDT', 'SNXUSDT', 'YFIUSDT',
  'SUSHIUSDT', '1INCHUSDT', 'BALUSDT', 'ZRXUSDT', 'KNCUSDT', 'STORJUSDT', 'ANKRUSDT',
  'CELRUSDT', 'CKBUSDT', 'IOTXUSDT', 'ONEUSDT', 'CFXUSDT', 'KDAUSDT', 'ROSEUSDT',
  'GLMRUSDT', 'ASTRUSDT', 'MINAUSDT', 'CELOUSDT', 'SKLUSDT', 'AUDIOUSDT', 'RSRUSDT',
  'OCEANUSDT', 'FETUSDT', 'RLCUSDT', 'NMRUSDT', 'BANDUSDT', 'API3USDT', 'UMAUSDT',
  'PERPUSDT', 'DYDXUSDT', 'GMXUSDT', 'GNSUSDT', 'JOEUSDT', 'CAKEUSDT', 'RAYUSDT',
  'JUPUSDT', 'PYTHUSDT', 'JTOUSDT', 'STRKUSDT', 'ZKUSDT', 'MANTAUSDT', 'ALTUSDT',
  'DYMUSDT', 'PIXELUSDT', 'PORTALUSDT', 'AEVOUSDT', 'ETHFIUSDT', 'ENAUSDT', 'OMNIUSDT',
  'REZUSDT', 'BBUSDT', 'IOUSDT', 'LISTAUSDT', 'ZROUSDT', 'BLURUSDT', 'MASKUSDT',
  'GMTUSDT', 'APEUSDT', 'LRCUSDT', 'METISUSDT', 'BOMEUSDT', 'TURBOUSDT', 'MEMEUSDT',
  'SFPUSDT', 'TWTUSDT', 'ARKMUSDT', 'WOOUSDT', 'LPTUSDT', 'SUPERUSDT', 'IDUSDT',
  'HOOKUSDT', 'HIGHUSDT', 'POLYXUSDT', 'LUNA2USDT', 'LUNCUSDT', 'USTCUSDT', 'PENDLEUSDT',
  'TAOUSDT', 'MNTUSDT', 'WUSDT', 'STGUSDT', 'ACEUSDT', 'NFPUSDT', 'AIUSDT',
  'XAIUSDT', 'BEAMXUSDT', 'RONUSDT', 'VANRYUSDT', 'TNSRUSDT', 'SAGAUSDT', 'TAIKOUSDT',
  'BANANAUSDT', 'EIGENUSDT', 'SCRUSDT', 'NEIROUSDT', 'CATIUSDT', 'HMSTRUSDT', 'THEUSDT',
  'UXLINKUSDT', 'PNUTUSDT', 'ACTUSDT', 'USUALUSDT', 'MOVEUSDT', 'MEUSDT', 'VIRTUALUSDT',
  'PENGUUSDT', 'COOKIEUSDT', 'AVAUSDT', 'BERAUSDT', 'SUSDT', 'GASUSDT', 'ARUSDT',
  'AGLDUSDT', 'POWRUSDT', 'VOXELUSDT', 'PHBUSDT', 'ACHUSDT', 'REEFUSDT', 'DENTUSDT',
  'WINUSDT', 'HOTUSDT', 'TFUELUSDT', 'VITEUSDT', 'WANUSDT', 'COSUSDT', 'DUSKUSDT',
  'KEYUSDT', 'STMXUSDT', 'FUNUSDT', 'CHRUSDT', 'MTLUSDT', 'DODOUSDT', 'LITUSDT',
  'TROYUSDT', 'OGNUSDT', 'AKROUSDT', 'FISUSDT', 'DGBUSDT', 'SCRTUSDT', 'MBOXUSDT',
  'VIDTUSDT', 'ALPACAUSDT', 'PONDUSDT', 'CTSIUSDT', 'REQUSDT', 'BNTUSDT', 'COTIUSDT',
  'RIFUSDT', 'WRXUSDT', 'TLMUSDT', 'FIROUSDT', 'PHAUSDT', 'LSKUSDT', 'OXTUSDT',
  'UNFIUSDT', 'SXPUSDT', 'NULSUSDT', 'VTHOUSDT', 'XVGUSDT', 'LOOMUSDT', 'DIAUSDT',
  'LTOUSDT', 'PROMUSDT', 'ARDRUSDT', 'NKNUSDT', 'MDTUSDT', 'PROSUSDT', 'SYSUSDT',
  'FIDAUSDT', 'MLNUSDT', 'XVSUSDT', 'ORNUSDT', 'BLZUSDT'
];

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

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

// UAE calendar date (UTC+4) — used so the daily P/L period actually aligns with
// UAE midnight-to-midnight, not UTC midnight-to-midnight.
function uaeDateStr() {
  return new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Standard UTC opening times for the major trading sessions (no DST
// adjustment, matching the rest of this build's convention). Each fires once
// in the first 5-min run after its mark, same pattern as the other windows.
const SESSIONS = [
  { hour: 22, emoji: '🇦🇺', name: 'Sydney' },
  { hour: 0, emoji: '🇯🇵', name: 'Tokyo / Asia' },
  { hour: 8, emoji: '🇬🇧', name: 'London' },
  { hour: 13, emoji: '🗽', name: 'New York' }
];
function checkSessionWindow() {
  const now = new Date();
  return SESSIONS.find(s => now.getUTCHours() === s.hour && now.getUTCMinutes() < 5) || null;
}
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
    // Enforce a minimum 10% TP distance — the structural/ATR target alone
    // often falls well short of that on calmer coins.
    const minTp = price * 1.10;
    if (tp < minTp) tp = minTp;
  } else {
    let d = Math.min(Math.max((swingHigh + atrNow * 0.25) - price, minD), maxD);
    sl = price + d; tp = price - d * rrTarget;
    const minTp = price * 0.90;
    if (tp > minTp) tp = minTp;
  }
  const actualRr = Math.abs(tp - price) / Math.abs(price - sl);
  return { sl, tp, rr: Math.round(actualRr * 10) / 10 };
}

// Suggested leverage based on setup confidence (the strength score), not the
// SL-distance safety formula — a stronger setup gets a higher suggestion,
// capped at 10x as a sane ceiling regardless of how strong the signal is.
function suggestedLeverage(strength) {
  return Math.max(2, Math.min(10, Math.round(strength)));
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
  const trending = adxNow > 25; // raised from 20 — stronger trend requirement,
                                  // since there's no more invalidation safety net

  const ema15 = ema(closes15m, 20);
  const trendUp15m = closes15m[closes15m.length - 1] > ema15[ema15.length - 1];

  const bb = bollinger(closes1h, 20, 2);
  const { swingHigh, swingLow } = swingLevels(candles1h, 40);

  const rsiLongZone = rsiNow >= 40 && rsiNow <= 55;
  const rsiShortZone = rsiNow >= 45 && rsiNow <= 60;
  const MIN_STRENGTH = 6; // quality floor on top of the boolean gates — a setup
                           // has to clear all six factors AND score at least
                           // 6/10 to actually fire

  let signal = 'WAIT', sl = null, tp = null, rr = null, strength = null;
  let watchDirection = null, signalStrength = null;

  if (trendUp && rsiLongZone && macdBullish && volumeConfirmed && trending && trendUp15m) {
    const candidateStrength = setupStrength(distPct, rsiNow, 47.5, macdHist, atrNow, volRatio, adxNow, bb.percentB, true);
    if (candidateStrength >= MIN_STRENGTH) {
      signal = 'LONG';
      strength = candidateStrength;
      ({ sl, tp, rr } = structuralTargets('LONG', price, atrNow, swingLow, swingHigh, strength));
    }
  } else if (!trendUp && rsiShortZone && !macdBullish && volumeConfirmed && trending && !trendUp15m) {
    const candidateStrength = setupStrength(distPct, rsiNow, 52.5, macdHist, atrNow, volRatio, adxNow, bb.percentB, false);
    if (candidateStrength >= MIN_STRENGTH) {
      signal = 'SHORT';
      strength = candidateStrength;
      ({ sl, tp, rr } = structuralTargets('SHORT', price, atrNow, swingLow, swingHigh, strength));
    }
  }
  if (signal === 'WAIT') {
    if (trendUp && rsiLongZone && macdBullish) {
      signal = 'WATCH'; watchDirection = 'LONG';
      signalStrength = setupStrength(distPct, rsiNow, 47.5, macdHist, atrNow, volRatio, adxNow, bb.percentB, true);
    } else if (!trendUp && rsiShortZone && !macdBullish) {
      signal = 'WATCH'; watchDirection = 'SHORT';
      signalStrength = setupStrength(distPct, rsiNow, 52.5, macdHist, atrNow, volRatio, adxNow, bb.percentB, false);
    }
  }

  return { signal, watchDirection, signalStrength, price, sl, tp, rr, strength, trendUp, atrNow, distPct };
}

async function sendTelegram(text) {
  const tagged = `🪙 <b>CRYPTO TRACKER</b>\n${text}`;
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
    if (!res.ok) {
      const errBody = await res.text();
      console.log(`Telegram send failed (${res.status}): ${errBody}`);
    }
  } catch (e) {
    console.log('Telegram send threw an error: ' + e.message);
  }
}

// Untagged sender for general market-session announcements — these aren't
// specific to crypto, so they don't carry the "CRYPTO TRACKER" label.
async function sendRawTelegram(text) {
  if (!BOT_TOKEN || !CHAT_ID) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' })
    });
    if (!res.ok) console.log(`Session announcement send failed (${res.status}): ${await res.text()}`);
  } catch (e) {
    console.log('Session announcement send threw an error: ' + e.message);
  }
}

function fmt(p) {
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(3);
  if (p >= 0.01) return p.toFixed(4);
  return p.toFixed(6);
}

// P/L as a dollar figure on a hypothetical $100 stake, applied at the trade's
// max-safe-leverage (see calcSafeLeverage) — not flat 1x, since this is a
// leverage tracker and a 1-3% SL/TP distance at 1x looks trivially small even
// though the underlying setup and risk are identical either way.
function fmtDollarPnl(pnlPct, leverage) {
  const dollar = pnlPct * (leverage || 1);
  const sign = dollar >= 0 ? '+' : '-';
  return `${sign}$${Math.abs(dollar).toFixed(2)}`;
}

// Max leverage that keeps the stop-loss distance inside ~80% of the
// liquidation buffer — same formula the risk-analysis card always used,
// now also driving the dollar P/L figures. Capped at 20x.
function calcSafeLeverage(entry, sl) {
  const slDistPct = (Math.abs(entry - sl) / entry) * 100;
  if (slDistPct <= 0) return 1;
  return Math.max(1, Math.min(20, Math.floor(80 / slDistPct)));
}

// Bump this whenever a strategy change should wipe all tracking data and
// start fresh. The next deploy's first run detects the version mismatch and
// resets everything automatically — this is how a full reset happens without
// direct access to the live Netlify Blobs store.
const STATE_VERSION = 2;

exports.handler = async function () {
  const store = getSignalStore();
  let state = (await store.get('state', { type: 'json' })) || { trades: {}, watchAlerts: {} };
  let weekly = (await store.get('weekly', { type: 'json' })) || { signals: 0, tp: 0, sl: 0, invalidated: 0, weekStart: Date.now() };
  let history = (await store.get('history', { type: 'json' })) || [];
  let daily = (await store.get('daily', { type: 'json' })) || { date: uaeDateStr(), totalPnlPct: 0, count: 0 };

  if (state.version !== STATE_VERSION) {
    console.log(`Resetting all tracking data — new strategy version (${STATE_VERSION}).`);
    state = { trades: {}, watchAlerts: {}, version: STATE_VERSION };
    weekly = { signals: 0, tp: 0, sl: 0, invalidated: 0, weekStart: Date.now() };
    history = [];
    daily = { date: uaeDateStr(), totalPnlPct: 0, count: 0 };
    await store.setJSON('dailyLog', []);
    await sendTelegram('🔄 <b>Tracker reset</b> — new stricter strategy live (no more invalidation, 10%+ TP targets, confidence-based leverage). Starting fresh from now.');
  }

  if (isNewCalendarMonth(weekly.weekStart)) {
    weekly = { signals: 0, tp: 0, sl: 0, invalidated: 0, weekStart: Date.now() };
  }

  function log(entry) {
    history.unshift({ ...entry, time: Date.now() });
    if (history.length > HISTORY_CAP) history = history.slice(0, HISTORY_CAP);
  }

  await Promise.all(SYMBOLS.map(async (sym) => {
    try {
      const [k4h, k1h, k15m] = await Promise.all([
        fetchKlines(sym, '4h', 60),
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
          const pnlPct = ts.direction === 'LONG'
            ? ((price - ts.entry) / ts.entry) * 100
            : ((ts.entry - price) / ts.entry) * 100;
          const leveragedDollar = pnlPct * (ts.leverage || 1);
          daily.totalPnlPct += leveragedDollar;
          daily.count++;
          await sendTelegram(`${hit === 'WON' ? '✅' : '❌'} <b>${sym} ${ts.direction} ${hit === 'WON' ? 'TP HIT' : 'SL HIT'}</b>\nEntry $${fmt(ts.entry)} → Close $${fmt(price)}\nP/L on $100 @ ${ts.leverage}x: ${fmtDollarPnl(pnlPct, ts.leverage)}`);
          log({ sym, type: hit === 'WON' ? 'TP' : 'SL', direction: ts.direction, price, pnlPct });
        }
        // No invalidation path anymore — an active trade only ever resolves
        // via TP or SL, nothing else. Removed in favor of a higher entry bar
        // (stricter ADX + strength floor) so trustworthy entries don't need
        // a mid-trade safety net.
      } else {
        if (result.signal === 'LONG' || result.signal === 'SHORT') {
          const leverage = suggestedLeverage(result.strength);
          state.trades[sym] = {
            status: 'active', direction: result.signal, entry: result.price,
            sl: result.sl, tp: result.tp, rr: result.rr, strength: result.strength,
            leverage, openedAt: Date.now()
          };
          weekly.signals++;
          state.watchAlerts[sym] = null; // clear watch tracking — this coin has a real trade now
          await sendTelegram(
            `📡 <b>${sym} ${result.signal}</b> (${result.strength}/10)\n` +
            `Entry: $${fmt(result.price)}\nSL: $${fmt(result.sl)}\nTP: $${fmt(result.tp)}\nR:R 1:${result.rr}\n` +
            `Suggested leverage: ${leverage}x (based on setup confidence)`
          );
          log({ sym, type: 'SIGNAL', direction: result.signal, strength: result.strength, entry: result.price, sl: result.sl, tp: result.tp });
        }
        // WATCH tier no longer alerts — only confirmed signals, TP/SL, and the
        // daily P/L recap send Telegram messages now. Invalidation is gone —
        // trades only ever resolve via TP or SL.
      }
    } catch (e) {
      // one symbol failing shouldn't stop the rest, but log it so failures are visible
      console.log(`${sym} failed: ${e.message}`);
    }
  }));

  await store.setJSON('state', state);
  await store.setJSON('weekly', weekly);
  await store.setJSON('history', history);

  // Daily P/L recap — 20:00 UTC = 00:00 (midnight) UAE time. Fires once in the
  // first 5-min run after that mark, summarizing the UAE day that just ended.
  if (isDailyRecapWindow()) {
    const pnlEmoji = daily.totalPnlPct >= 0 ? '🟢' : '🔴';
    await sendTelegram(
      `📊 <b>Daily P/L Recap</b> (${daily.date})\n` +
      `Trades closed today: ${daily.count}\n` +
      `Net P/L (on $100/trade): ${pnlEmoji} ${fmtDollarPnl(daily.totalPnlPct)}`
    );

    // Log this day into a rolling history so the weekly report can break
    // down each individual day, not just one combined total.
    let dailyLog = (await store.get('dailyLog', { type: 'json' })) || [];
    dailyLog.unshift({ date: daily.date, totalPnlPct: daily.totalPnlPct, count: daily.count });
    dailyLog = dailyLog.slice(0, 35); // keep ~5 weeks of buffer
    await store.setJSON('dailyLog', dailyLog);

    // Weekly report — every Sunday (UTC), right after logging that day's
    // entry, breaking down each of the last 7 days individually.
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

  const session = checkSessionWindow();
  if (session) {
    await sendRawTelegram(`${session.emoji} <b>${session.name} session opening</b>`);
  }

  return { statusCode: 200, body: 'ok' };
};
