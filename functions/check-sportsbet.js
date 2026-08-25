// Runs once daily (see netlify.toml). Builds a small, high-probability parlay
// following the strategy: max 3 legs, each an extreme favorite (~80%+ implied
// probability — matching the "-400 or shorter" range cited in the source
// material), FIXED $100 unit size regardless of the odds (never scale stake
// to chase a payout target). Checks yesterday's parlay result on the same run.
//
// HONEST LIMITATION: the source strategy specifically uses player props
// (points/rebounds/assists lines). OddsPapi supports props, but player-prop
// market IDs are dynamic per fixture (a single NFL game can have 1,000+ of
// them) and need a different bookmaker than the one used here — that
// discovery flow isn't verified working without live API testing. This
// version uses team moneylines instead, applying the same core principles
// (max 3 legs, ~80%+ probability per leg, fixed unit size). Every message
// says this plainly.
//
// PARLAY MATH REMINDER (also stated in every message): every leg must win.
// Even at 80% each, three legs combined = ~51% — still real risk, just far
// better than a standard 3-leg -110 parlay (~65% each leg → ~27% combined).

const { getStore } = require('@netlify/blobs');

const ODDSPAPI_KEY = process.env.ODDSPAPI_KEY;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const UNIT_SIZE = 100; // fixed $ stake per the strategy — never scaled to odds

const MAX_LEGS = 3;
const MAX_LEG_ODDS = 1.25; // ~80%+ implied probability ("-400 or shorter")
const MIN_LEG_ODDS = 1.02; // sanity floor — skip near-100% "not really a bet" lines
const LOOKAHEAD_MS = 36 * 60 * 60 * 1000; // only consider games starting within 36h
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // refresh sports/tournaments/participants weekly

function getSportsBetStore() {
  return getStore({
    name: 'sportsbet-tracker',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN
  });
}

function uaeDateStr() {
  return new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function sendTelegram(text) {
  const tagged = `🎲 <b>SPORTS BET TRACKER</b>\n${text}`;
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

async function apiGet(path, params = {}) {
  const url = new URL(`https://api.oddspapi.io${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('apiKey', ODDSPAPI_KEY);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`OddsPapi ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function getSportIds(cache) {
  if (cache.sportIds && Date.now() - (cache.sportIdsAt || 0) < CACHE_TTL_MS) return cache.sportIds;
  const sports = await apiGet('/v4/sports', { language: 'en' });
  const soccer = sports.find(s => s.slug === 'soccer');
  const basketball = sports.find(s => s.slug === 'basketball');
  const esports = sports.find(s => /esport/i.test(s.sportName) || /esport/i.test(s.slug));
  const sportIds = { soccer: soccer?.sportId, basketball: basketball?.sportId, esports: esports?.sportId };
  cache.sportIds = sportIds;
  cache.sportIdsAt = Date.now();
  return sportIds;
}

async function getTournamentIds(cache, key, sportId, nameFilter) {
  const dataKey = `tournaments_${key}`, ageKey = `${dataKey}_at`;
  if (cache[dataKey] && Date.now() - (cache[ageKey] || 0) < CACHE_TTL_MS) return cache[dataKey];
  if (!sportId) return [];
  const tournaments = await apiGet('/v4/tournaments', { sportId });
  let filtered = nameFilter ? tournaments.filter(t => nameFilter.test(t.tournamentName || '')) : tournaments;
  filtered = filtered.filter(t => (t.upcomingFixtures || 0) > 0 || (t.futureFixtures || 0) > 0);
  filtered.sort((a, b) => (b.futureFixtures || 0) - (a.futureFixtures || 0));
  const ids = filtered.slice(0, 5).map(t => t.tournamentId);
  cache[dataKey] = ids;
  cache[ageKey] = Date.now();
  return ids;
}

async function getParticipantNames(cache, key, sportId) {
  const dataKey = `participants_${key}`, ageKey = `${dataKey}_at`;
  if (cache[dataKey] && Date.now() - (cache[ageKey] || 0) < CACHE_TTL_MS) return cache[dataKey];
  if (!sportId) return {};
  const names = await apiGet('/v4/participants', { sportId, language: 'en' });
  cache[dataKey] = names;
  cache[ageKey] = Date.now();
  return names;
}

function extractMoneyline(fixture) {
  const pinnacle = fixture.bookmakerOdds && fixture.bookmakerOdds.pinnacle;
  if (!pinnacle || !pinnacle.markets || !pinnacle.markets['101']) return null;
  const outcomes = pinnacle.markets['101'].outcomes;
  const get = (id) => outcomes[id]?.players?.['0']?.price;
  return { home: get('101'), away: get('103') }; // skip draw — hard to grade as a clean "pick"
}

exports.handler = async function () {
  if (!ODDSPAPI_KEY) {
    console.log('ODDSPAPI_KEY not set — skipping sports bet check entirely.');
    return { statusCode: 200, body: 'no api key configured' };
  }

  const store = getSportsBetStore();
  let cache = (await store.get('cache', { type: 'json' })) || {};
  let pending = (await store.get('pending', { type: 'json' })) || null;
  let stats = (await store.get('stats', { type: 'json' })) || { wins: 0, losses: 0, streak: 0, netDollars: 0 };
  let history = (await store.get('history', { type: 'json' })) || [];

  // 1. Resolve yesterday's parlay if its games should be finished by now.
  if (pending && Date.now() > pending.checkAfter) {
    let allWon = true;
    const legResults = [];
    for (const leg of pending.legs) {
      try {
        const scoreData = await apiGet('/v4/scores', { fixtureId: leg.fixtureId });
        const periods = Object.values(scoreData.scores || {});
        const total1 = periods.reduce((s, p) => s + (p.participant1Score || 0), 0);
        const total2 = periods.reduce((s, p) => s + (p.participant2Score || 0), 0);
        const actualWinner = total1 > total2 ? 'home' : total1 < total2 ? 'away' : 'draw';
        const won = actualWinner === leg.pickSide;
        if (!won) allWon = false;
        legResults.push({ ...leg, won, finalScore: `${total1}-${total2}` });
      } catch (e) {
        console.log(`Score fetch failed for ${leg.fixtureId}: ${e.message}`);
        allWon = false;
        legResults.push({ ...leg, won: false, finalScore: 'unknown (fetch failed)' });
      }
    }

    const netDollar = allWon ? UNIT_SIZE * (pending.combinedOdds - 1) : -UNIT_SIZE;
    if (allWon) { stats.wins++; stats.streak = stats.streak >= 0 ? stats.streak + 1 : 1; }
    else { stats.losses++; stats.streak = stats.streak <= 0 ? stats.streak - 1 : -1; }
    stats.netDollars += netDollar;

    history.unshift({ date: pending.date, legs: legResults, combinedOdds: pending.combinedOdds, hit: allWon, netDollar, resolvedAt: Date.now() });
    history = history.slice(0, 60);

    const legLines = legResults.map(l =>
      `${l.won ? '✅' : '❌'} ${l.homeName} vs ${l.awayName} (${l.sport}) — picked ${l.pickSide.toUpperCase()} @ ${l.price} (final ${l.finalScore})`
    ).join('\n');

    await sendTelegram(
      `${allWon ? '🎉 PARLAY HIT' : '💔 PARLAY MISSED'}\n\n${legLines}\n\n` +
      `Combined odds: ${pending.combinedOdds}x on $${UNIT_SIZE} flat unit\n` +
      `Result: ${allWon ? '+' : ''}$${netDollar.toFixed(2)}\n` +
      `Record: ${stats.wins}W-${stats.losses}L (streak ${stats.streak > 0 ? '+' : ''}${stats.streak}) — net $${stats.netDollars.toFixed(2)}`
    );
    pending = null;
  }

  // 2. Build today's parlay if nothing is currently pending.
  if (!pending) {
    try {
      const sportIds = await getSportIds(cache);
      const soccerT = await getTournamentIds(cache, 'soccer', sportIds.soccer);
      const bballT = await getTournamentIds(cache, 'basketball', sportIds.basketball);
      const csT = await getTournamentIds(cache, 'esports', sportIds.esports, /counter[\s-]?strike|cs2|cs:?go/i);

      const soccerNames = await getParticipantNames(cache, 'soccer', sportIds.soccer);
      const bballNames = await getParticipantNames(cache, 'basketball', sportIds.basketball);
      const csNames = await getParticipantNames(cache, 'esports', sportIds.esports);

      const candidates = [];
      const groups = [
        [soccerT, soccerNames, 'soccer'],
        [bballT, bballNames, 'basketball'],
        [csT, csNames, 'CS2']
      ];
      for (const [tournamentIds, names, label] of groups) {
        if (!tournamentIds.length) continue;
        const fixtures = await apiGet('/v4/odds-by-tournaments', { bookmaker: 'pinnacle', tournamentIds: tournamentIds.join(',') });
        for (const f of fixtures) {
          const start = new Date(f.startTime).getTime();
          if (start < Date.now() || start > Date.now() + LOOKAHEAD_MS) continue;
          const ml = extractMoneyline(f);
          if (!ml) continue;
          const homeName = names[f.participant1Id] || `Team ${f.participant1Id}`;
          const awayName = names[f.participant2Id] || `Team ${f.participant2Id}`;
          const sides = [];
          if (ml.home) sides.push({ side: 'home', price: ml.home });
          if (ml.away) sides.push({ side: 'away', price: ml.away });
          const fav = sides.sort((a, b) => a.price - b.price)[0];
          if (!fav || fav.price < MIN_LEG_ODDS || fav.price > MAX_LEG_ODDS) continue;
          candidates.push({ fixtureId: f.fixtureId, homeName, awayName, pickSide: fav.side, price: fav.price, startTime: f.startTime, sport: label });
        }
      }

      // Safest legs first — take up to MAX_LEGS, no forced payout target.
      candidates.sort((a, b) => a.price - b.price);
      const legs = candidates.slice(0, MAX_LEGS);

      if (legs.length >= 2) {
        const combined = Math.round(legs.reduce((p, l) => p * l.price, 1) * 100) / 100;
        const latestStart = Math.max(...legs.map(l => new Date(l.startTime).getTime()));
        pending = { date: uaeDateStr(), legs, combinedOdds: combined, createdAt: Date.now(), checkAfter: latestStart + 4 * 60 * 60 * 1000 };

        const legLines = legs.map(l => `• ${l.homeName} vs ${l.awayName} (${l.sport}) — ${l.pickSide.toUpperCase()} @ ${l.price}`).join('\n');
        const impliedProb = Math.round((1 / combined) * 100);
        await sendTelegram(
          `🎲 <b>Today's Parlay</b> (${legs.length} legs, extreme favorites only)\n\n${legLines}\n\n` +
          `Combined odds: ${combined}x — implied probability ~${impliedProb}%\n` +
          `Flat unit stake: $${UNIT_SIZE} (not scaled to the odds)\n\n` +
          `⚠️ Every leg must win. Even at ~80%+ each, ${legs.length} legs combined is real risk, not a sure thing. ` +
          `This uses team moneylines, not literal player props (see setup notes). Never bet more than you can afford to lose.`
        );
      } else {
        console.log(`Not enough qualifying extreme-favorite legs today (found ${candidates.length}).`);
      }
    } catch (e) {
      console.log('Sports bet parlay build failed: ' + e.message);
    }
  }

  await store.setJSON('cache', cache);
  await store.setJSON('pending', pending);
  await store.setJSON('stats', stats);
  await store.setJSON('history', history);

  return { statusCode: 200, body: 'ok' };
};
