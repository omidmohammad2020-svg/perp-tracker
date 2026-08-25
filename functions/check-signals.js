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
function findPivots(candles, leftBars, rightBars) {
  const pivots = [];
  for (let i = leftBars; i < candles.length - rightBars; i++) {
    const c = candles[i];
    let isHigh = true, isLow = true;
    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (j === i) continue;
      if (candles[j].high >= c.high) isHigh = false;
      if (candles[j].low <= c.low) isLow = false;
    }
    if (isHigh) pivots.push({ index: i, type: 'high', price: c.high, candle: c });
    if (isLow) pivots.push({ index: i, type: 'low', price: c.low, candle: c });
  }
  return pivots;
}

// ---------- crypto-only strategy: wedge/apex breakout + retest ----------
// No indicators — just two trendlines (resistance drawn through the last two
// swing highs, support through the last two swing lows) projected forward to
// the current candle. A breakout is only tradeable after price comes back and
// retests the broken line and holds — never traded on the breakout itself.

function projectTrendline(pivotA, pivotB, targetIndex) {
  const slope = (pivotB.price - pivotA.price) / (pivotB.index - pivotA.index);
  return pivotB.price + slope * (targetIndex - pivotB.index);
}

function computeWedge(candles) {
  const pivots = findPivots(candles, 3, 3);
  const highs = pivots.filter(p => p.type === 'high');
  const lows = pivots.filter(p => p.type === 'low');
  if (highs.length < 2 || lows.length < 2) return null;
  const h1 = highs[highs.length - 2], h2 = highs[highs.length - 1];
  const l1 = lows[lows.length - 2], l2 = lows[lows.length - 1];
  const currentIndex = candles.length - 1;
  const resistance = projectTrendline(h1, h2, currentIndex);
  const support = projectTrendline(l1, l2, currentIndex);
  if (!(resistance > support)) return null; // lines crossed/invalid — skip
  return { resistance, support, atrNow: atr(candles, 14) };
}

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

const PENDING_EXPIRY_MS = 24 * 60 * 60 * 1000; // discard a breakout if no retest within 24h

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
const STATE_VERSION = 4;
const MAX_TRADES_PER_HOUR = 3;

function getHourBucket() {
  return new Date().toISOString().slice(0, 13); // e.g. "2026-08-25T09"
}

exports.handler = async function () {
  const store = getSignalStore();
  let state = (await store.get('state', { type: 'json' })) || { trades: {}, pendingBreakouts: {} };
  if (!state.pendingBreakouts) state.pendingBreakouts = {};
  if (!state.hourlyCount || state.hourlyCount.hour !== getHourBucket()) {
    state.hourlyCount = { hour: getHourBucket(), count: 0 };
  }
  let weekly = (await store.get('weekly', { type: 'json' })) || { signals: 0, tp: 0, sl: 0, invalidated: 0, weekStart: Date.now() };
  let history = (await store.get('history', { type: 'json' })) || [];
  let daily = (await store.get('daily', { type: 'json' })) || { date: uaeDateStr(), totalPnlPct: 0, count: 0 };

  if (state.version !== STATE_VERSION) {
    console.log(`Resetting all tracking data — new strategy version (${STATE_VERSION}).`);
    state = { trades: {}, pendingBreakouts: {}, hourlyCount: { hour: getHourBucket(), count: 0 }, version: STATE_VERSION };
    weekly = { signals: 0, tp: 0, sl: 0, invalidated: 0, weekStart: Date.now() };
    history = [];
    daily = { date: uaeDateStr(), totalPnlPct: 0, count: 0 };
    await store.setJSON('dailyLog', []);
    await sendTelegram('🔄 <b>Tracker reset</b> — new crypto-only strategy live: wedge/apex breakout + retest. Converging support/resistance trendlines from swing highs/lows, trade only fires after a confirmed retest of the broken line, target = measured move (wedge height projected from the breakout point). No indicators. Max 3 trades per hour — the strategy applies at full strictness to those 3, extra qualifying setups are discarded, not queued. Starting fresh from now.');
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
      const lastCandle = candles[candles.length - 1];

      const ts = state.trades[sym];

      if (ts && ts.status === 'active') {

        // Breakeven stop: once price moves 1x the trade's initial risk in
        // its favor, move the stop to entry.
        if (!ts.breakevenMoved && ts.initialRisk) {
          const favorableMove = ts.direction === 'LONG' ? price - ts.entry : ts.entry - price;
          if (favorableMove >= ts.initialRisk) {
            ts.sl = ts.entry;
            ts.breakevenMoved = true;
            await sendTelegram(`🛡️ <b>${sym} ${ts.direction} moved to breakeven</b>\nStop-loss now at entry ($${fmt(ts.entry)}) — this trade can no longer close as a loss.`);
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
          await sendTelegram(`${hit === 'WON' ? '✅' : '❌'} <b>${sym} ${ts.direction} ${hit === 'WON' ? 'TP HIT' : 'SL HIT'}</b>\nEntry $${fmt(ts.entry)} → Close $${fmt(price)}\nP/L on $100 @ ${ts.leverage}x: ${fmtDollarPnl(pnlPct, ts.leverage)}`);
          log({ sym, type: hit === 'WON' ? 'TP' : 'SL', direction: ts.direction, price, pnlPct });
        }
        // No invalidation path — an active trade only ever resolves via TP or SL.

      } else {
        // Wedge/apex breakout strategy: a breakout alone never triggers a
        // trade — it's remembered as "pending" and only fires once price
        // comes back and retests the broken trendline and holds. A pending
        // breakout that never gets retested within 24h is discarded.
        let pending = state.pendingBreakouts[sym] || null;
        if (pending && Date.now() - pending.brokenAt > PENDING_EXPIRY_MS) {
          pending = null;
        }

        const wedge = computeWedge(candles);

        if (!pending) {
          if (wedge) {
            if (lastCandle.close > wedge.resistance) {
              pending = { direction: 'LONG', level: wedge.resistance, wedgeHeight: wedge.resistance - wedge.support, brokenAt: Date.now() };
            } else if (lastCandle.close < wedge.support) {
              pending = { direction: 'SHORT', level: wedge.support, wedgeHeight: wedge.resistance - wedge.support, brokenAt: Date.now() };
            }
          }
        } else {
          const buffer = wedge ? wedge.atrNow * 0.1 : price * 0.001;
          let retested = false, entry = null, sl = null, tp = null;

          if (pending.direction === 'LONG') {
            retested = lastCandle.low <= pending.level + buffer && lastCandle.close > pending.level;
            if (retested) {
              entry = price;
              sl = pending.level - buffer * 2;
              tp = pending.level + pending.wedgeHeight; // measured-move target
            }
          } else {
            retested = lastCandle.high >= pending.level - buffer && lastCandle.close < pending.level;
            if (retested) {
              entry = price;
              sl = pending.level + buffer * 2;
              tp = pending.level - pending.wedgeHeight;
            }
          }

          if (retested) {
            const risk = pending.direction === 'LONG' ? entry - sl : sl - entry;
            const reward = pending.direction === 'LONG' ? tp - entry : entry - tp;
            if (risk > 0 && reward > 0 && state.hourlyCount.count < MAX_TRADES_PER_HOUR) {
              const ratio = reward / risk;
              const rr = Math.round(ratio * 10) / 10;
              const strength = Math.max(1, Math.min(10, Math.round(ratio * 2)));
              const leverage = suggestedLeverage(strength);
              const initialRisk = Math.abs(entry - sl);
              state.trades[sym] = {
                status: 'active', direction: pending.direction, entry, sl, tp, rr, strength,
                leverage, initialRisk, breakevenMoved: false, openedAt: Date.now()
              };
              state.hourlyCount.count++;
              weekly.signals++;
              console.log(`${sym}: ${pending.direction} confirmed retest — strength ${strength}/10, R:R 1:${rr} (${state.hourlyCount.count}/${MAX_TRADES_PER_HOUR} this hour)`);
              await sendTelegram(
                `📡 <b>${sym} ${pending.direction}</b> (${strength}/10)\n` +
                `Wedge breakout confirmed — broken ${pending.direction === 'LONG' ? 'resistance retested as support' : 'support retested as resistance'} and held\n` +
                `Entry: $${fmt(entry)}\nSL: $${fmt(sl)}\nTP: $${fmt(tp)} (measured move)\nR:R 1:${rr}\n` +
                `Suggested leverage: ${leverage}x (based on setup confidence)\n` +
                `Trade ${state.hourlyCount.count}/${MAX_TRADES_PER_HOUR} this hour`
              );
              log({ sym, type: 'SIGNAL', direction: pending.direction, strength, entry, sl, tp });
              pending = null;
            } else if (risk > 0 && reward > 0) {
              console.log(`${sym}: valid retest but hourly cap (${MAX_TRADES_PER_HOUR}) already reached — skipped, not queued.`);
              pending = null; // don't queue it — the strategy still applied fully to it, just capped
            } else {
              pending = null; // bad risk/reward geometry — discard, don't force a trade
            }
          }
        }

        state.pendingBreakouts[sym] = pending;
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
