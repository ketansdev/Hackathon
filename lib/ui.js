/**
 * lib/ui.js
 * ---------
 * Small, dependency-free console formatting helpers shared by every
 * command in index.js. Centralizing this here avoids duplicated
 * formatting logic spread across command handlers.
 */

'use strict';

/** Print a boxed section header, e.g. used above key/value blocks. */
function printHeader(title) {
  const line = '='.repeat(title.length + 4);
  console.log(`\n${line}\n  ${title}\n${line}`);
}

/** Print a thin divider line with an optional label, e.g. for tables. */
function printDivider(label) {
  if (label) {
    console.log(`\n--- ${label} ---`);
  } else {
    console.log('-'.repeat(40));
  }
}

function printOK(message) {
  console.log(`[OK] ${message}`);
}

function printError(message) {
  console.error(`[ERROR] ${message}`);
}

function printInfo(message) {
  console.log(`[INFO] ${message}`);
}

function printWarn(message) {
  console.log(`[WARN] ${message}`);
}

/**
 * Print a simple aligned key/value table.
 * @param {Object} obj - flat object of label -> value pairs
 * @param {number} [padWidth] - column width for the label
 */
function printKeyValueTable(obj, padWidth = 24) {
  for (const [key, value] of Object.entries(obj)) {
    console.log(`  ${String(key).padEnd(padWidth)}: ${formatValue(value)}`);
  }
}

function formatValue(value) {
  if (Array.isArray(value)) return value.length ? value.join(', ') : '(empty)';
  if (value === undefined || value === null || value === '') return 'N/A';
  return String(value);
}

/** Human-readable byte sizes (B, KB, MB, GB). */
function formatBytes(bytes) {
  if (typeof bytes !== 'number' || Number.isNaN(bytes)) return 'N/A';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 2)} ${units[exponent]}`;
}

module.exports = {
  printHeader,
  printDivider,
  printOK,
  printError,
  printInfo,
  printWarn,
  printKeyValueTable,
  formatValue,
  formatBytes,
};
