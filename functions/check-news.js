// Runs every 30 minutes (see netlify.toml). Sources data from the official,
// free FRED (St. Louis Fed) API — a legitimate government source, not a
// scrape. Two things happen here:
//
// 1. A heads-up ~1 hour before each watched release (release DATE from FRED;
//    exact TIME is a standard assumption — see below).
// 2. After the release, a directional NEWS SIGNAL comparing the actual new
//    print to the PRIOR period's value. IMPORTANT HONEST LIMITATION: this is
//    actual-vs-prior, NOT actual-vs-forecast/consensus. Real news-traders
//    react to whether a number beat or missed expectations — that forecast
//    figure is proprietary (Bloomberg/Reuters-style surveys) and isn't in any
//    free official government feed. This signal tells you the print moved in
//    a given direction from last time, not whether it surprised the market.
//    Every message says this plainly — never presented as the real thing.

const { getStore } = require('@netlify/blobs');

const FRED_API_KEY = process.env.FRED_API_KEY;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Maps a FRED release name (substring match) to the specific series FRED
// tracks for it, a friendly label, and how to read a "higher" print.
// 'inflationary'/'growth' → higher = typically USD-bullish (hawkish Fed
// expectations), bearish for EUR/USD and GBP/USD.
const RELEASE_MAP = [
  { keyword: 'Consumer Price Index', seriesId: 'CPIAUCSL', label: 'US CPI (headline)', kind: 'inflationary' },
  { keyword: 'Producer Price Index', seriesId: 'PPIFIS', label: 'US PPI (final demand)', kind: 'inflationary' },
  { keyword: 'Employment Situation', seriesId: 'PAYEMS', label: 'US Nonfarm Payrolls', kind: 'growth' },
  { keyword: 'Gross Domestic Product', seriesId: 'A191RL1Q225SBEA', label: 'US GDP growth (annualized)', kind: 'growth' },
  { keyword: 'Advance Monthly Sales for Retail and Food Services', seriesId: 'RSAFS', label: 'US Retail Sales', kind: 'growth' }
];

const STANDARD_RELEASE_HOUR_UTC = 13; // 8:30 AM ET = 13:30 UTC (standard BLS/Census time)
const STANDARD_RELEASE_MINUTE_UTC = 30;

function getNewsStore() {
  return getStore({
    name: 'news-tracker',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN
  });
}

async function sendTelegram(text) {
  const tagged = `📰 <b>NEWS TRACKER</b> <i>(source: FRED, official)</i>\n${text}`;
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

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}
function tomorrowUTC() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function fetchUpcomingReleases() {
  const url = `https://api.stlouisfed.org/fred/releases/dates?api_key=${FRED_API_KEY}&file_type=json` +
    `&realtime_start=${todayUTC()}&realtime_end=${tomorrowUTC()}&include_release_dates_with_no_data=false&limit=200`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FRED API error: ${res.status}`);
  const data = await res.json();
  return data.release_dates || [];
}

// Fetches the latest 2 observations for a series — [newest, previous].
async function fetchLatestObservations(seriesId) {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}` +
    `&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=2`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FRED observations error for ${seriesId}: ${res.status}`);
  const data = await res.json();
  return (data.observations || []).filter(o => o.value !== '.'); // '.' = no data yet
}

function directionalBias(kind, higher) {
  // Simple, well-established macro heuristic — NOT a guaranteed reaction.
  const usdBullish = higher;
  return {
    usdBullish,
    pairs: [
      { pair: 'EUR/USD', direction: usdBullish ? 'SHORT' : 'LONG' },
      { pair: 'GBP/USD', direction: usdBullish ? 'SHORT' : 'LONG' }
    ]
  };
}

exports.handler = async function () {
  if (!FRED_API_KEY) {
    console.log('FRED_API_KEY not set — skipping news check entirely.');
    return { statusCode: 200, body: 'no api key configured' };
  }

  const store = getNewsStore();
  let alerted = (await store.get('alerted', { type: 'json' })) || {};
  let lastSeenObs = (await store.get('lastSeenObs', { type: 'json' })) || {};

  try {
    const releases = await fetchUpcomingReleases();
    const matches = releases.filter(r =>
      RELEASE_MAP.some(m => r.release_name.toLowerCase().includes(m.keyword.toLowerCase()))
    );

    const now = Date.now();
    for (const match of matches) {
      const eventTime = new Date(`${match.date}T${String(STANDARD_RELEASE_HOUR_UTC).padStart(2, '0')}:${String(STANDARD_RELEASE_MINUTE_UTC).padStart(2, '0')}:00Z`).getTime();
      const minutesUntil = (eventTime - now) / 60000;
      const headsUpKey = `headsup-${match.release_id}-${match.date}`;

      if (minutesUntil > 0 && minutesUntil <= 65 && minutesUntil >= 25 && !alerted[headsUpKey]) {
        alerted[headsUpKey] = true;
        await sendTelegram(
          `⏰ <b>${match.release_name}</b>\n` +
          `Releasing in ~1 hour — ${match.date} at 13:30 UTC (8:30 AM ET, standard release time)\n` +
          `High-impact — expect volatility around this time.`
        );
      }

      const minutesSince = (now - eventTime) / 60000;
      if (minutesSince >= 0 && minutesSince <= 90) {
        const mapping = RELEASE_MAP.find(m => match.release_name.toLowerCase().includes(m.keyword.toLowerCase()));
        if (mapping) {
          try {
            const obs = await fetchLatestObservations(mapping.seriesId);
            if (obs.length >= 2) {
              const [latest, prior] = obs;
              const isFreshPrint = lastSeenObs[mapping.seriesId] !== latest.date;
              if (isFreshPrint) {
                lastSeenObs[mapping.seriesId] = latest.date;
                const latestVal = parseFloat(latest.value);
                const priorVal = parseFloat(prior.value);
                const higher = latestVal > priorVal;
                const changeStr = `${latestVal.toFixed(2)} vs prior ${priorVal.toFixed(2)}`;
                const bias = directionalBias(mapping.kind, higher);
                const pairLines = bias.pairs.map(p => `${p.direction} ${p.pair}`).join(', ');

                await sendTelegram(
                  `🚨 <b>NEWS SIGNAL — ${mapping.label}</b>\n` +
                  `This is because of news: actual print ${changeStr} (${higher ? 'higher' : 'lower'} than last reading).\n` +
                  `Historical bias: ${bias.usdBullish ? 'USD-bullish' : 'USD-bearish'} → ${pairLines}\n\n` +
                  `⚠️ <b>Important:</b> this compares the actual number to the PRIOR reading, NOT to what the ` +
                  `market expected (forecast/consensus data isn't in any free official source). A number can ` +
                  `still move markets the opposite way if it was already priced in or missed forecast despite ` +
                  `rising. Treat this as directional context, not a confirmed trade signal.`
                );
              }
            }
          } catch (e) {
            console.log(`${mapping.label} observation fetch failed: ${e.message}`);
          }
        }
      }
    }

    const cutoff = Date.now() - 5 * 24 * 60 * 60 * 1000;
    for (const key of Object.keys(alerted)) {
      const datePart = key.split('-').slice(2).join('-');
      if (new Date(datePart).getTime() < cutoff) delete alerted[key];
    }
  } catch (e) {
    console.log('News check failed: ' + e.message);
  }

  await store.setJSON('alerted', alerted);
  await store.setJSON('lastSeenObs', lastSeenObs);
  return { statusCode: 200, body: 'ok' };
};
