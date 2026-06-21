/**
 * lib/history.js
 * --------------
 * Feature: Command History.
 * Appends an entry to a hidden `.history.json` file (at the project
 * root, alongside index.js - not inside the sandbox, since it's tool
 * metadata rather than user-managed content) every time a command runs,
 * recording the command, a timestamp, and whether it succeeded.
 */

'use strict';

const fs = require('fs');

const MAX_ENTRIES_KEPT = 500; // simple cap so the file doesn't grow forever

/**
 * @param {string} historyFilePath - absolute path to .history.json
 * @returns {Array<{command: string, timestamp: string, success: boolean}>}
 */
function loadHistory(historyFilePath) {
  try {
    if (!fs.existsSync(historyFilePath)) return [];
    const raw = fs.readFileSync(historyFilePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    // Corrupt or unreadable history should never crash the CLI.
    return [];
  }
}

/**
 * @param {string} historyFilePath
 * @param {string} command - full command line as invoked, e.g. "stats --json"
 * @param {boolean} success
 */
function appendHistory(historyFilePath, command, success) {
  try {
    const history = loadHistory(historyFilePath);
    history.push({ command, timestamp: new Date().toISOString(), success });
    const trimmed = history.slice(-MAX_ENTRIES_KEPT);
    fs.writeFileSync(historyFilePath, JSON.stringify(trimmed, null, 2), 'utf8');
  } catch (err) {
    // History logging is best-effort; never let it break the actual command.
  }
}

/**
 * @param {string} historyFilePath
 * @param {number} [limit] - how many most-recent entries to return
 */
function getRecentHistory(historyFilePath, limit = 20) {
  const history = loadHistory(historyFilePath);
  return history.slice(-limit).reverse();
}

module.exports = { loadHistory, appendHistory, getRecentHistory };
