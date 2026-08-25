// Runs every 5 minutes (see netlify.toml). Combines what used to be two
// separate trackers — forex (via Twelve Data) and futures/indices/stocks
// (via Yahoo Finance's unofficial endpoint) — into one function, one shared
// store, and one Telegram tag. Same market-structure/supply-demand strategy
// as before, applied identically to every instrument regardless of source.
// Max 3 new trades per hour, combined across all instruments here — extra
// qualifying setups beyond that are discarded, not queued, so the strategy
// stays applied at full strictness to the 3 that do fire.

const { getStore } = require('@netlify/blobs');

const TD_API_KEY = process.env.TWELVE_DATA_API_KEY;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const HISTORY_CAP = 200;
const MAX_TRADES_PER_HOUR = 3;

// source: 'twelvedata' (licensed, official) or 'yahoo' (unofficial — see
// fetchYahooSeries for the standing caveat on that source).
const INSTRUMENTS = [
  { symbol: 'EUR/USD', label: 'EUR/USD', source: 'twelvedata' },
  { symbol: 'GBP/USD', label: 'GBP/USD', source: 'twelvedata' },

  { symbol: 'ES=F', label: 'S&P 500 Futures (ES)', source: 'yahoo' },
  { symbol: 'NQ=F', label: 'Nasdaq Futures (NQ)', source: 'yahoo' },
  { symbol: 'YM=F', label: 'Dow Futures (YM)', source: 'yahoo' },
  { symbol: 'CL=F', label: 'Crude Oil Futures (CL)', source: 'yahoo' },
  { symbol: 'GC=F', label: 'Gold Futures (GC)', source: 'yahoo' },
  { symbol: 'SI=F', label: 'Silver Futures (SI)', source: 'yahoo' },
  { symbol: 'NG=F', label: 'Natural Gas Futures (NG)', source: 'yahoo' },
  { symbol: 'RTY=F', label: 'Russell 2000 Futures (RTY)', source: 'yahoo' },
  { symbol: 'HG=F', label: 'Copper Futures (HG)', source: 'yahoo' },
  { symbol: 'PL=F', label: 'Platinum Futures (PL)', source: 'yahoo' },
  { symbol: '6E=F', label: 'Euro FX Futures (6E)', source: 'yahoo' },
  { symbol: '6B=F', label: 'British Pound Futures (6B)', source: 'yahoo' },
  { symbol: 'ZN=F', label: '10-Year T-Note Futures (ZN)', source: 'yahoo' },
  { symbol: 'ZC=F', label: 'Corn Futures', source: 'yahoo' },
  { symbol: 'ZW=F', label: 'Wheat Futures', source: 'yahoo' },
  { symbol: 'ZS=F', label: 'Soybean Futures', source: 'yahoo' },
  { symbol: 'ZM=F', label: 'Soybean Meal Futures', source: 'yahoo' },
  { symbol: 'ZL=F', label: 'Soybean Oil Futures', source: 'yahoo' },
  { symbol: 'KC=F', label: 'Coffee Futures', source: 'yahoo' },
  { symbol: 'CC=F', label: 'Cocoa Futures', source: 'yahoo' },
  { symbol: 'CT=F', label: 'Cotton Futures', source: 'yahoo' },
  { symbol: 'SB=F', label: 'Sugar Futures', source: 'yahoo' },
  { symbol: 'LE=F', label: 'Live Cattle Futures', source: 'yahoo' },
  { symbol: 'HE=F', label: 'Lean Hogs Futures', source: 'yahoo' },
  { symbol: 'OJ=F', label: 'Orange Juice Futures', source: 'yahoo' },
  { symbol: '6J=F', label: 'Japanese Yen Futures', source: 'yahoo' },
  { symbol: '6S=F', label: 'Swiss Franc Futures', source: 'yahoo' },
  { symbol: '6A=F', label: 'Australian Dollar Futures', source: 'yahoo' },
  { symbol: '6C=F', label: 'Canadian Dollar Futures', source: 'yahoo' },
  { symbol: '6N=F', label: 'NZ Dollar Futures', source: 'yahoo' },
  { symbol: 'ZT=F', label: '2-Year T-Note Futures', source: 'yahoo' },
  { symbol: 'ZF=F', label: '5-Year T-Note Futures', source: 'yahoo' },
  { symbol: 'ZB=F', label: '30-Year T-Bond Futures', source: 'yahoo' },
  { symbol: 'UB=F', label: 'Ultra T-Bond Futures', source: 'yahoo' },
  { symbol: 'HO=F', label: 'Heating Oil Futures', source: 'yahoo' },
  { symbol: 'RB=F', label: 'RBOB Gasoline Futures', source: 'yahoo' },
  { symbol: 'BZ=F', label: 'Brent Crude Futures', source: 'yahoo' },
  { symbol: 'NKD=F', label: 'Nikkei 225 Futures', source: 'yahoo' },
  { symbol: '^VIX', label: 'VIX Volatility Index', source: 'yahoo' },
  { symbol: '^FTSE', label: 'FTSE 100', source: 'yahoo' },
  { symbol: '^GDAXI', label: 'DAX', source: 'yahoo' },
  { symbol: '^HSI', label: 'Hang Seng', source: 'yahoo' },
  { symbol: 'AAPL', label: 'Apple', source: 'yahoo' },
  { symbol: 'MSFT', label: 'Microsoft', source: 'yahoo' },
  { symbol: 'GOOGL', label: 'Alphabet', source: 'yahoo' },
  { symbol: 'AMZN', label: 'Amazon', source: 'yahoo' },
  { symbol: 'NVDA', label: 'Nvidia', source: 'yahoo' },
  { symbol: 'TSLA', label: 'Tesla', source: 'yahoo' },
  { symbol: 'META', label: 'Meta', source: 'yahoo' },
  { symbol: 'JPM', label: 'JPMorgan Chase', source: 'yahoo' },
  { symbol: 'V', label: 'Visa', source: 'yahoo' },
  { symbol: 'WMT', label: 'Walmart', source: 'yahoo' },
  { symbol: 'JNJ', label: 'Johnson & Johnson', source: 'yahoo' },
  { symbol: 'PG', label: 'Procter & Gamble', source: 'yahoo' },
  { symbol: 'XOM', label: 'ExxonMobil', source: 'yahoo' },
  { symbol: 'BRK-B', label: 'Berkshire Hathaway', source: 'yahoo' },
  { symbol: 'UNH', label: 'UnitedHealth', source: 'yahoo' },
  { symbol: 'NFLX', label: 'Netflix', source: 'yahoo' },
  { symbol: 'DIS', label: 'Disney', source: 'yahoo' },
  { symbol: 'KO', label: 'Coca-Cola', source: 'yahoo' },
  { symbol: 'PEP', label: 'PepsiCo', source: 'yahoo' },
  { symbol: 'INTC', label: 'Intel', source: 'yahoo' },
  { symbol: 'AMD', label: 'AMD', source: 'yahoo' }
];

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

function getHourBucket() {
  return new Date().toISOString().slice(0, 13);
}

function getFxFuturesStore() {
  return getStore({
    name: 'fxfutures-tracker',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN
  });
}

// ---------- indicator math ----------

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

function getMarketStructure(pivots) {
  const highs = pivots.filter(p => p.type === 'high');
  const lows = pivots.filter(p => p.type === 'low');
  if (highs.length < 2 || lows.length < 2) return { trend: 'NONE' };
  const lastHigh = highs[highs.length - 1], prevHigh = highs[highs.length - 2];
  const lastLow = lows[lows.length - 1], prevLow = lows[lows.length - 2];
  const higherHighs = lastHigh.price > prevHigh.price;
  const higherLows = lastLow.price > prevLow.price;
  const lowerLows = lastLow.price < prevLow.price;
  const lowerHighs = lastHigh.price < prevHigh.price;
  if (higherHighs && higherLows) return { trend: 'UP', lastHigh, prevHigh, lastLow, prevLow };
  if (lowerLows && lowerHighs) return { trend: 'DOWN', lastHigh, prevHigh, lastLow, prevLow };
  return { trend: 'NONE' };
}

function suggestedLeverage(strength) {
  return Math.max(2, Math.min(10, Math.round(strength)));
}

async function fetchTwelveDataSeries(symbol) {
  if (!TD_API_KEY) throw new Error('TWELVE_DATA_API_KEY not set');
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1h&outputsize=100&apikey=${TD_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status === 'error' || !data.values) {
    throw new Error(`Twelve Data error for ${symbol}: ${data.message || JSON.stringify(data)}`);
  }
  return data.values.map(v => ({
    high: parseFloat(v.high), low: parseFloat(v.low), close: parseFloat(v.close)
  })).reverse();
}

// Yahoo Finance's UNOFFICIAL chart endpoint — no official public API exists.
// Could change format or block without notice at any time.
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
  return candles;
}

async function fetchSeries(instrument) {
  return instrument.source === 'twelvedata'
    ? fetchTwelveDataSeries(instrument.symbol)
    : fetchYahooSeries(instrument.symbol);
}

const MIN_RR = 2.5;

function computeSignal(candles) {
  const price = candles[candles.length - 1].close;
  const lastCandle = candles[candles.length - 1];
  const atrNow = atr(candles, 14);
  const pivots = findPivots(candles, 3, 3);
  const structure = getMarketStructure(pivots);

  let signal = 'WAIT', sl = null, tp = null, rr = null, strength = null;

  if (structure.trend === 'UP') {
    const zoneCandle = structure.lastLow.candle;
    const zoneLow = zoneCandle.low;
    const zoneHigh = Math.max(zoneCandle.open || zoneCandle.close, zoneCandle.close);
    const touchingZone = lastCandle.low <= zoneHigh && lastCandle.close > zoneLow;
    if (touchingZone) {
      const stop = zoneLow - atrNow * 0.1;
      const target = structure.lastHigh.price;
      const risk = price - stop;
      const reward = target - price;
      if (risk > 0 && reward > 0) {
        const ratio = reward / risk;
        if (ratio >= MIN_RR) {
          signal = 'LONG'; sl = stop; tp = target; rr = Math.round(ratio * 10) / 10;
          strength = Math.max(1, Math.min(10, Math.round(ratio * 2)));
        }
      }
    }
  } else if (structure.trend === 'DOWN') {
    const zoneCandle = structure.lastHigh.candle;
    const zoneHigh = zoneCandle.high;
    const zoneLow = Math.min(zoneCandle.open || zoneCandle.close, zoneCandle.close);
    const touchingZone = lastCandle.high >= zoneLow && lastCandle.close < zoneHigh;
    if (touchingZone) {
      const stop = zoneHigh + atrNow * 0.1;
      const target = structure.lastLow.price;
      const risk = stop - price;
      const reward = price - target;
      if (risk > 0 && reward > 0) {
        const ratio = reward / risk;
        if (ratio >= MIN_RR) {
          signal = 'SHORT'; sl = stop; tp = target; rr = Math.round(ratio * 10) / 10;
          strength = Math.max(1, Math.min(10, Math.round(ratio * 2)));
        }
      }
    }
  }

  return { signal, price, sl, tp, rr, strength, trendUp: structure.trend === 'UP', atrNow };
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

async function sendTelegram(text, source) {
  const sourceTag = source === 'yahoo' ? ' <i>(unofficial source — Yahoo Finance)</i>' : '';
  const tagged = `💱📊 <b>FX & FUTURES TRACKER</b>${sourceTag}\n${text}`;
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

const STATE_VERSION = 1; // fresh store — merged from the two previous separate trackers

exports.handler = async function () {
  const store = getFxFuturesStore();
  let state = (await store.get('state', { type: 'json' })) || { trades: {}, latest: {} };
  if (!state.latest) state.latest = {};
  if (!state.hourlyCount || state.hourlyCount.hour !== getHourBucket()) {
    state.hourlyCount = { hour: getHourBucket(), count: 0 };
  }
  let weekly = (await store.get('weekly', { type: 'json' })) || { signals: 0, tp: 0, sl: 0, invalidated: 0, weekStart: Date.now() };
  let history = (await store.get('history', { type: 'json' })) || [];
  let daily = (await store.get('daily', { type: 'json' })) || { date: uaeDateStr(), totalPnlPct: 0, count: 0 };

  if (state.version !== STATE_VERSION) {
    console.log(`Initializing merged FX & Futures tracker (version ${STATE_VERSION}).`);
    state = { trades: {}, latest: {}, hourlyCount: { hour: getHourBucket(), count: 0 }, version: STATE_VERSION };
    weekly = { signals: 0, tp: 0, sl: 0, invalidated: 0, weekStart: Date.now() };
    history = [];
    daily = { date: uaeDateStr(), totalPnlPct: 0, count: 0 };
    await store.setJSON('dailyLog', []);
    await sendTelegram(
      `🔗 <b>Merged tracker live</b> — forex and futures/indices/stocks are now one combined tracker ` +
      `(${INSTRUMENTS.length} instruments: 2 via Twelve Data, ${INSTRUMENTS.length - 2} via Yahoo Finance). ` +
      `Same market structure + supply/demand + 2.5:1 R:R strategy as before. Max ${MAX_TRADES_PER_HOUR} new trades ` +
      `per hour combined across all instruments here.`
    );
  }

  if (isNewCalendarMonth(weekly.weekStart)) {
    weekly = { signals: 0, tp: 0, sl: 0, invalidated: 0, weekStart: Date.now() };
  }

  function log(entry) {
    history.unshift({ ...entry, time: Date.now() });
    if (history.length > HISTORY_CAP) history = history.slice(0, HISTORY_CAP);
  }

  await Promise.all(INSTRUMENTS.map(async (instrument) => {
    const { symbol, label, source } = instrument;
    try {
      const candles = await fetchSeries(instrument);
      const result = computeSignal(candles);
      state.latest[symbol] = { label, source, price: result.price, signal: result.signal, updatedAt: Date.now() };
      if (result.signal !== 'WAIT') {
        console.log(`${label}: ${result.signal} — strength ${result.strength}/10, R:R 1:${result.rr}`);
      }

      const ts = state.trades[symbol];

      if (ts && ts.status === 'active') {
        const price = result.price;

        if (!ts.breakevenMoved && ts.initialRisk) {
          const favorableMove = ts.direction === 'LONG' ? price - ts.entry : ts.entry - price;
          if (favorableMove >= ts.initialRisk) {
            ts.sl = ts.entry;
            ts.breakevenMoved = true;
            await sendTelegram(`🛡️ <b>${label} ${ts.direction} moved to breakeven</b>\nStop-loss now at entry (${fmt(ts.entry)}) — this trade can no longer close as a loss.`, source);
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
          await sendTelegram(`${hit === 'WON' ? '✅' : '❌'} <b>${label} ${ts.direction} ${hit === 'WON' ? 'TP HIT' : 'SL HIT'}</b>\nEntry ${fmt(ts.entry)} → Close ${fmt(price)}\nP/L on $100 @ ${ts.leverage}x: ${fmtDollarPnl(pnlPct, ts.leverage)}`, source);
          log({ sym: label, type: hit === 'WON' ? 'TP' : 'SL', direction: ts.direction, price, pnlPct });
        }
      } else {
        if ((result.signal === 'LONG' || result.signal === 'SHORT') && state.hourlyCount.count < MAX_TRADES_PER_HOUR) {
          const leverage = suggestedLeverage(result.strength);
          const initialRisk = Math.abs(result.price - result.sl);
          state.trades[symbol] = {
            status: 'active', direction: result.signal, entry: result.price,
            sl: result.sl, tp: result.tp, rr: result.rr, strength: result.strength,
            leverage, initialRisk, breakevenMoved: false, openedAt: Date.now()
          };
          state.hourlyCount.count++;
          weekly.signals++;
          await sendTelegram(
            `📡 <b>${label} ${result.signal}</b> (${result.strength}/10)\n` +
            `Entry: ${fmt(result.price)}\nSL: ${fmt(result.sl)}\nTP: ${fmt(result.tp)}\nR:R 1:${result.rr}\n` +
            `Suggested leverage: ${leverage}x (based on setup confidence)\n` +
            `Trade ${state.hourlyCount.count}/${MAX_TRADES_PER_HOUR} this hour`,
            source
          );
          log({ sym: label, type: 'SIGNAL', direction: result.signal, strength: result.strength, entry: result.price, sl: result.sl, tp: result.tp });
        } else if (result.signal === 'LONG' || result.signal === 'SHORT') {
          console.log(`${label}: valid ${result.signal} but hourly cap (${MAX_TRADES_PER_HOUR}) already reached — skipped, not queued.`);
        }
      }
    } catch (e) {
      console.log(`${label} failed: ${e.message}`);
    }
  }));

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
