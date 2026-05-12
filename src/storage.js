const fs = require('fs');
const path = require('path');
const config = require('./config');

function ensureDir() {
  if (!fs.existsSync(config.dataDir)) {
    fs.mkdirSync(config.dataDir, { recursive: true });
  }
}

function filePath(name) {
  ensureDir();
  return path.join(config.dataDir, name);
}

function readJSON(name, fallback) {
  const p = filePath(name);
  if (!fs.existsSync(p)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJSON(name, data) {
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2));
}

function appendLog(name, entry) {
  const log = readJSON(name, []);
  log.push({ at: new Date().toISOString(), ...entry });
  writeJSON(name, log);
}

module.exports = { readJSON, writeJSON, appendLog, filePath };
