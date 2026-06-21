/**
 * lib/stats.js
 * ------------
 * Feature: Workspace Statistics.
 * Walks the sandboxed workspace recursively and computes aggregate
 * stats: file/dir counts, total size, breakdown by extension, and the
 * largest/smallest file. Read-only - never writes anything.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Recursively walk `dir` collecting stats. Symlinks are skipped to avoid
 * escaping the sandbox or following cycles.
 *
 * @param {string} baseDir - sandbox root (workspace folder), already
 *   validated by the caller (FileCRUD owns the sandbox).
 * @returns {Object} aggregated statistics
 */
function getWorkspaceStats(baseDir) {
  let totalFiles = 0;
  let totalDirectories = 0;
  let totalSizeBytes = 0;
  const byExtension = {};
  let largestFile = null;
  let smallestFile = null;

  function visit(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (err) {
      return; // unreadable directory - skip rather than crash the whole report
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isSymbolicLink()) continue; // never follow symlinks out of the sandbox

      if (entry.isDirectory()) {
        totalDirectories += 1;
        visit(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;

      let size = 0;
      try {
        size = fs.statSync(fullPath).size;
      } catch (err) {
        continue;
      }

      totalFiles += 1;
      totalSizeBytes += size;

      const ext = path.extname(entry.name).toLowerCase() || '(no extension)';
      byExtension[ext] = (byExtension[ext] || 0) + 1;

      const relativePath = path.relative(baseDir, fullPath);
      const fileRecord = { path: relativePath, sizeBytes: size };

      if (!largestFile || size > largestFile.sizeBytes) largestFile = fileRecord;
      if (!smallestFile || size < smallestFile.sizeBytes) smallestFile = fileRecord;
    }
  }

  visit(baseDir);

  return {
    generatedAt: new Date().toISOString(),
    totalFiles,
    totalDirectories,
    totalSizeBytes,
    fileCountByExtension: byExtension,
    largestFile,
    smallestFile,
  };
}

module.exports = { getWorkspaceStats };
