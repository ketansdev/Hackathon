/**
 * lib/report.js
 * -------------
 * Feature: Save System Reports.
 * Writes a getSystemInfo() snapshot to a timestamped JSON file under
 * ./reports, auto-creating the folder if needed.
 */

'use strict';

const fs = require('fs');
const path = require('path');

function timestampForFilename(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-` +
    `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  );
}

/**
 * @param {Object} info - output of getSystemInfo()
 * @param {string} reportsDir - absolute path to the reports folder (auto-created)
 * @returns {{success: boolean, message?: string, path?: string}}
 */
function saveReport(info, reportsDir) {
  try {
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    const filename = `report-${timestampForFilename()}.json`;
    const fullPath = path.join(reportsDir, filename);
    fs.writeFileSync(fullPath, JSON.stringify(info, null, 2), 'utf8');
    return {
      success: true,
      message: `Report saved: ${path.relative(process.cwd(), fullPath)}`,
      path: fullPath,
    };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

module.exports = { saveReport, timestampForFilename };
