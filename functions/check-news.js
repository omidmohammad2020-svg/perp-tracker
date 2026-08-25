// Runs every 30 minutes (see netlify.toml). Sources release DATES from the
// official, free FRED (St. Louis Fed) API — a legitimate government source,
// not a scrape. Sends a heads-up alert for each watched release, on the day
// it happens, at a set time before it publishes. No directional trading
// signal here — just "this is happening, at this time."

const { getStore } = require('@netlify/blobs');

const FRED_API_KEY = process.env.FRED_API_KEY;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Substrings matched (case-insensitive) against FRED release names.
const WATCHLIST = [
  'Consumer Price Index',
  'Producer Price Index',
  'Employment Situation',              // official NFP / jobs report release
  'Gross Domestic Product',
  'Advance Monthly Sales for Retail and Food Services' // Retail Sales
];

// Standard 8:30 AM ET release time for these specific BLS/Census releases —
// that's 13:30 UTC, which is 5:30 PM Dubai/UAE time (UTC+4, no DST).
const STANDARD_RELEASE_HOUR_UTC = 13;
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

exports.handler = async function () {
  if (!FRED_API_KEY) {
    console.log('FRED_API_KEY not set — skipping news check entirely.');
    return { statusCode: 200, body: 'no api key configured' };
  }

  const store = getNewsStore();
  let alerted = (await store.get('alerted', { type: 'json' })) || {};

  try {
    const releases = await fetchUpcomingReleases();
    const matches = releases.filter(r =>
      WATCHLIST.some(keyword => r.release_name.toLowerCase().includes(keyword.toLowerCase()))
    );

    const now = Date.now();
    for (const match of matches) {
      const eventTime = new Date(`${match.date}T${String(STANDARD_RELEASE_HOUR_UTC).padStart(2, '0')}:${String(STANDARD_RELEASE_MINUTE_UTC).padStart(2, '0')}:00Z`).getTime();
      const minutesUntil = (eventTime - now) / 60000;
      const dedupeKey = `${match.release_id}-${match.date}`;

      // Fires once, in the ~55-65 min-before window (matches the 30-min check
      // cadence with margin), and only once per event.
      if (minutesUntil > 0 && minutesUntil <= 65 && minutesUntil >= 25 && !alerted[dedupeKey]) {
        alerted[dedupeKey] = true;
        await sendTelegram(
          `⏰ <b>${match.release_name}</b> is today at 5:30 PM Dubai time (UAE, UTC+4)\n` +
          `High-impact — expect volatility around this time.`
        );
      }
    }

    // Prune old dedupe entries so this doesn't grow forever.
    const cutoff = Date.now() - 5 * 24 * 60 * 60 * 1000;
    for (const key of Object.keys(alerted)) {
      const datePart = key.split('-').slice(1).join('-');
      if (new Date(datePart).getTime() < cutoff) delete alerted[key];
    }
  } catch (e) {
    console.log('News check failed: ' + e.message);
  }

  await store.setJSON('alerted', alerted);
  return { statusCode: 200, body: 'ok' };
};
