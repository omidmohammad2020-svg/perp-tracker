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

// ---------- pure price-action strategy: market structure + supply/demand ----------
// No indicators, no patterns — just swing highs/lows, the zone that preceded
// the most recent impulsive move, and a hard 2.5:1 minimum reward:risk filter.

// A pivot high/low is confirmed when it's the highest/lowest point within a
// window of candles on both sides — the standard definition of a swing point.
// ---------- crypto-only strategy: trend-following with liquidation-aware sizing ----------
// No indicators beyond a simple trend filter and volume — trades in the
// direction the market is already moving (continuation, not top/bottom
// calling): price above/below a 50-period average, breaking the recent
// range with rising volume. The real discipline this strategy is built
// around: leverage is chosen FROM the trade's own structural stop distance,
// so liquidation always sits a real, calculated buffer beyond the stop —
// never picked arbitrarily and checked after the fact.

function sma(closes, period) {
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// Simplified isolated-margin liquidation distance ≈ (1/leverage) × 100% away
// from entry (ignoring fees/maintenance margin, same approximation used in
// the source material's own worked example). Solves for the highest leverage
// that still keeps liquidation at least 2x further away than the stop-loss —
// a real safety buffer, not just "the stop triggers first by luck."
function calcLeverageFromStop(entry, sl) {
  const slDistPct = (Math.abs(entry - sl) / entry) * 100;
  if (slDistPct <= 0) return { leverage: 1, strength: 1 };
  const LIQUIDATION_BUFFER = 2; // liquidation must sit >= 2x the stop distance away
  const leverage = Math.max(1, Math.min(20, Math.floor(100 / (slDistPct * LIQUIDATION_BUFFER))));
  // Confidence score: a tighter, cleaner structural stop = higher score.
  const strength = Math.max(1, Math.min(10, Math.round(10 - slDistPct)));
  return { leverage, strength };
}

function computeTrendSignal(candles) {
  const TREND_PERIOD = 50, BREAKOUT_LOOKBACK = 20;
  if (candles.length < TREND_PERIOD + BREAKOUT_LOOKBACK) return { signal: 'WAIT' };

  const closes = candles.map(c => c.close);
  const price = closes[closes.length - 1];
  const lastCandle = candles[candles.length - 1];
  const trendAvg = sma(closes, TREND_PERIOD);

  // Recent range and volume, excluding the still-forming current candle.
  const recent = candles.slice(-(BREAKOUT_LOOKBACK + 1), -1);
  const recentHigh = Math.max(...recent.map(c => c.high));
  const recentLow = Math.min(...recent.map(c => c.low));
  const avgVolume = recent.reduce((a, c) => a + c.volume, 0) / recent.length;
  const risingVolume = lastCandle.volume > avgVolume;

  let signal = 'WAIT', sl = null, tp = null, rr = null, strength = null, leverage = null;

  // Skip choppy/consolidating markets — a market not clearly above or below
  // its own average isn't "trending," per the strategy's own stated scope.
  if (price > trendAvg && lastCandle.close > recentHigh && risingVolume) {
    signal = 'LONG';
    sl = recentLow; // real support below the breakout zone, not an arbitrary %
    const risk = price - sl;
    tp = price + risk * 2; // 2:1 reward:risk continuation target
    rr = 2;
    ({ leverage, strength } = calcLeverageFromStop(price, sl));
  } else if (price < trendAvg && lastCandle.close < recentLow && risingVolume) {
    signal = 'SHORT';
    sl = recentHigh;
    const risk = sl - price;
    tp = price - risk * 2;
    rr = 2;
    ({ leverage, strength } = calcLeverageFromStop(price, sl));
  }

  return { signal, price, sl, tp, rr, strength, leverage };
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

async function sendTelegram(text, replyToId) {
  const tagged = `🪙 <b>CRYPTO TRACKER</b>\n${text}`;
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log('sendTelegram skipped — TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set');
    return null;
  }
  try {
    const body = { chat_id: CHAT_ID, text: tagged, parse_mode: 'HTML' };
    if (replyToId) body.reply_to_message_id = replyToId;
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.log(`Telegram send failed (${res.status}): ${errBody}`);
      return null;
    }
    const data = await res.json();
    return data.result?.message_id || null;
  } catch (e) {
    console.log('Telegram send threw an error: ' + e.message);
    return null;
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
// actual assigned leverage (from calcLeverageFromStop) — not flat 1x.
function fmtDollarPnl(pnlPct, leverage) {
  const dollar = pnlPct * (leverage || 1);
  const sign = dollar >= 0 ? '+' : '-';
  return `${sign}$${Math.abs(dollar).toFixed(2)}`;
}


// Bump this whenever a strategy change should wipe all tracking data and
// start fresh. The next deploy's first run detects the version mismatch and
// resets everything automatically — this is how a full reset happens without
// direct access to the live Netlify Blobs store.
const STATE_VERSION = 6;
const MAX_TRADES_PER_HOUR = 3;
const MAX_CONCURRENT_TRADES = 3;

function countActiveTrades(trades) {
  return Object.values(trades).filter(t => t && t.status === 'active').length;
}

function getHourBucket() {
  return new Date().toISOString().slice(0, 13); // e.g. "2026-08-25T09"
}

exports.handler = async function () {
  const store = getSignalStore();
  let state = (await store.get('state', { type: 'json' })) || { trades: {} };
  if (!state.hourlyCount || state.hourlyCount.hour !== getHourBucket()) {
    state.hourlyCount = { hour: getHourBucket(), count: 0 };
  }
  let weekly = (await store.get('weekly', { type: 'json' })) || { signals: 0, tp: 0, sl: 0, invalidated: 0, weekStart: Date.now() };
  let history = (await store.get('history', { type: 'json' })) || [];
  let daily = (await store.get('daily', { type: 'json' })) || { date: uaeDateStr(), totalPnlPct: 0, count: 0 };

  if (state.version !== STATE_VERSION) {
    console.log(`Resetting all tracking data — new strategy version (${STATE_VERSION}).`);
    state = { trades: {}, hourlyCount: { hour: getHourBucket(), count: 0 }, version: STATE_VERSION };
    weekly = { signals: 0, tp: 0, sl: 0, invalidated: 0, weekStart: Date.now() };
    history = [];
    daily = { date: uaeDateStr(), totalPnlPct: 0, count: 0 };
    await store.setJSON('dailyLog', []);
    await sendTelegram(
      `🔄 <b>Tracker reset</b> — new crypto-only strategy live: trend-following continuation. Trades in the ` +
      `direction price is already moving — above/below a 50-period average, breaking the recent 20-period ` +
      `range with rising volume. No top/bottom calling. Stop-loss is the real swing level behind the breakout; ` +
      `take-profit targets 2:1 reward:risk. Leverage is calculated directly from each trade's own stop distance ` +
      `so liquidation always sits at least 2x further away than the stop — never picked arbitrarily. ` +
      `Max ${MAX_TRADES_PER_HOUR} trades per hour combined. Starting fresh from now.`
    );
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
      const candles = await fetchKlines(sym, '1h', 100);
      const price = candles[candles.length - 1].close;

      const ts = state.trades[sym];

      if (ts && ts.status === 'active') {

        // Breakeven stop: once price moves 1x the trade's initial risk in
        // its favor, move the stop to entry.
        if (!ts.breakevenMoved && ts.initialRisk) {
          const favorableMove = ts.direction === 'LONG' ? price - ts.entry : ts.entry - price;
          if (favorableMove >= ts.initialRisk) {
            ts.sl = ts.entry;
            ts.breakevenMoved = true;
            await sendTelegram(`🛡️ <b>${sym}</b> moved to breakeven`, ts.signalMessageId);
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
          await sendTelegram(
            `${hit === 'WON' ? '✅ TP HIT' : '❌ SL HIT'} <b>${sym}</b>\n${fmtDollarPnl(pnlPct, ts.leverage)}`,
            ts.signalMessageId
          );
          log({ sym, type: hit === 'WON' ? 'TP' : 'SL', direction: ts.direction, price, pnlPct });
        }
        // No invalidation path — an active trade only ever resolves via TP or SL.

      } else {
        const result = computeTrendSignal(candles);
        const activeCount = countActiveTrades(state.trades);

        if ((result.signal === 'LONG' || result.signal === 'SHORT') && state.hourlyCount.count < MAX_TRADES_PER_HOUR && activeCount < MAX_CONCURRENT_TRADES) {
          const initialRisk = Math.abs(result.price - result.sl);
          state.hourlyCount.count++;
          weekly.signals++;
          console.log(`${sym}: ${result.signal} trend continuation — strength ${result.strength}/10, ${result.leverage}x (${state.hourlyCount.count}/${MAX_TRADES_PER_HOUR} this hour, ${activeCount + 1}/${MAX_CONCURRENT_TRADES} concurrent)`);
          const messageId = await sendTelegram(
            `📡 <b>${sym} ${result.signal}</b> (${result.strength}/10)\n` +
            `Entry $${fmt(result.price)} · SL $${fmt(result.sl)} · TP $${fmt(result.tp)}\n` +
            `${result.leverage}x leverage`
          );
          state.trades[sym] = {
            status: 'active', direction: result.signal, entry: result.price,
            sl: result.sl, tp: result.tp, rr: result.rr, strength: result.strength,
            leverage: result.leverage, initialRisk, breakevenMoved: false, openedAt: Date.now(),
            signalMessageId: messageId
          };
          log({ sym, type: 'SIGNAL', direction: result.signal, strength: result.strength, entry: result.price, sl: result.sl, tp: result.tp });
        } else if (result.signal === 'LONG' || result.signal === 'SHORT') {
          const reason = activeCount >= MAX_CONCURRENT_TRADES ? `concurrent cap (${MAX_CONCURRENT_TRADES} open)` : `hourly cap (${MAX_TRADES_PER_HOUR})`;
          console.log(`${sym}: valid ${result.signal} but ${reason} already reached — skipped, not queued.`);
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
