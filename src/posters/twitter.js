const { TwitterApi } = require('twitter-api-v2');
const config = require('../config');

let client = null;

function getClient() {
  const { appKey, appSecret, accessToken, accessSecret } = config.twitter;
  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    throw new Error('Twitter credentials are incomplete. Check .env');
  }
  if (!client) {
    client = new TwitterApi({ appKey, appSecret, accessToken, accessSecret });
  }
  return client.v2;
}

async function post(text) {
  const res = await getClient().tweet(text);
  return { id: res.data.id, url: `https://twitter.com/i/status/${res.data.id}` };
}

async function check() {
  const me = await getClient().me();
  return { ok: true, user: me.data.username };
}

module.exports = { post, check, platform: 'twitter' };
