const { getStore } = require('@netlify/blobs');

function getSignalStore() {
  return getStore({
    name: 'signal-tracker',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN
  });
}

exports.handler = async function () {
  const store = getSignalStore();
  const history = (await store.get('history', { type: 'json' })) || [];
  const weekly = (await store.get('weekly', { type: 'json' })) || { signals: 0, tp: 0, sl: 0, invalidated: 0, weekStart: Date.now() };
  const state = (await store.get('state', { type: 'json' })) || { trades: {} };

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify({ history, weekly, trades: state.trades || {} })
  };
};
