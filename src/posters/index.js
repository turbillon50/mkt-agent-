const config = require('../config');
const twitter = require('./twitter');
const linkedin = require('./linkedin');

function enabledPosters() {
  const list = [];
  if (config.twitter.enabled) list.push(twitter);
  if (config.linkedin.enabled) list.push(linkedin);
  return list;
}

function getPoster(platform) {
  if (platform === 'twitter') return twitter;
  if (platform === 'linkedin') return linkedin;
  throw new Error(`Unknown platform: ${platform}`);
}

module.exports = { enabledPosters, getPoster, twitter, linkedin };
