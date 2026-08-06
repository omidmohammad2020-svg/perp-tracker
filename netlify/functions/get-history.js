const { getStore } = require('@netlify/blobs');

exports.handler = async function () {
  const store = getStore('signal-tracker');
  const history = (await store.get('history', { type: 'json' })) || [];
  const weekly = (await store.get('weekly', { type: 'json' })) || { signals: 0, tp: 0, sl: 0, invalidated: 0, weekStart: Date.now() };

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify({ history, weekly })
  };
};
