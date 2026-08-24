const { getStore } = require('@netlify/blobs');

function getSportsBetStore() {
  return getStore({
    name: 'sportsbet-tracker',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN
  });
}

exports.handler = async function () {
  const store = getSportsBetStore();
  const history = (await store.get('history', { type: 'json' })) || [];
  const stats = (await store.get('stats', { type: 'json' })) || { wins: 0, losses: 0, streak: 0, netDollars: 0 };
  const pending = (await store.get('pending', { type: 'json' })) || null;

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify({ history, stats, pending })
  };
};
