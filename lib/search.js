/**
 * lib/search.js
 * -------------
 * Feature: Search Files.
 * Recursively searches filenames inside the sandboxed workspace for a
 * case-insensitive keyword match. Read-only.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * @param {string} baseDir - sandbox root (workspace folder)
 * @param {string} keyword
 * @returns {Array<{relativePath: string, type: 'file'|'directory'}>}
 */
function searchFiles(baseDir, keyword) {
  const needle = String(keyword).toLowerCase();
  const matches = [];

  function visit(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (err) {
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.name.toLowerCase().includes(needle)) {
        matches.push({
          relativePath: path.relative(baseDir, fullPath),
          type: entry.isDirectory() ? 'directory' : 'file',
        });
      }
      if (entry.isDirectory()) visit(fullPath);
    }
  }

  visit(baseDir);
  return matches.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

/**
 * Render matches as a simple tree-style listing rooted at "workspace/".
 */
function formatAsTree(matches) {
  if (matches.length === 0) return 'workspace/\n(no matches)';
  const lines = ['workspace/'];
  matches.forEach((m, i) => {
    const isLast = i === matches.length - 1;
    const prefix = isLast ? '└── ' : '├── ';
    lines.push(`${prefix}${m.relativePath}`);
  });
  return lines.join('\n');
}

module.exports = { searchFiles, formatAsTree };
