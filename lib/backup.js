/**
 * lib/backup.js
 * -------------
 * Feature: Workspace Backup.
 * Compresses the entire sandboxed workspace folder into a timestamped
 * .zip file under ./backups. Only ever reads from the workspace sandbox
 * and writes to the backups folder - it never touches anything else.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { createZip } = require('./zipUtil');

function timestampForFilename(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-` +
    `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  );
}

/** Recursively collect {name, data} entries for every file under baseDir. */
function collectEntries(baseDir, currentDir, entries) {
  let dirItems;
  try {
    dirItems = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch (err) {
    return;
  }
  for (const item of dirItems) {
    if (item.isSymbolicLink()) continue;
    const fullPath = path.join(currentDir, item.name);
    if (item.isDirectory()) {
      collectEntries(baseDir, fullPath, entries);
    } else if (item.isFile()) {
      const relativeName = path.relative(baseDir, fullPath).split(path.sep).join('/');
      entries.push({ name: relativeName, data: fs.readFileSync(fullPath) });
    }
  }
}

/**
 * Create a zip backup of `workspaceDir` inside `backupsDir`.
 * @param {string} workspaceDir - absolute path to the sandboxed workspace
 * @param {string} backupsDir - absolute path to the backups folder (auto-created)
 * @returns {{success: boolean, message?: string, path?: string, fileCount?: number, sizeBytes?: number}}
 */
function createBackup(workspaceDir, backupsDir) {
  try {
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    const entries = [];
    collectEntries(workspaceDir, workspaceDir, entries);

    const zipBuffer = createZip(entries);
    const filename = `backup-${timestampForFilename()}.zip`;
    const fullPath = path.join(backupsDir, filename);
    fs.writeFileSync(fullPath, zipBuffer);

    return {
      success: true,
      message: `Backup created: ${path.relative(process.cwd(), fullPath)}`,
      path: fullPath,
      fileCount: entries.length,
      sizeBytes: zipBuffer.length,
    };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

module.exports = { createBackup, timestampForFilename };
