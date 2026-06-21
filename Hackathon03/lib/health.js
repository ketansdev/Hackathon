/**
 * lib/health.js
 * -------------
 * Feature: System Health.
 * Reports CPU core count, memory usage, Node version, and a derived
 * HEALTHY / WARNING / CRITICAL status based on memory-usage thresholds.
 */

'use strict';

const os = require('os');

// Memory-usage thresholds (percent used) that drive the status label.
const WARNING_THRESHOLD = 75;
const CRITICAL_THRESHOLD = 90;

function getHealthStatus(memoryUsagePercent) {
  if (memoryUsagePercent >= CRITICAL_THRESHOLD) return 'CRITICAL';
  if (memoryUsagePercent >= WARNING_THRESHOLD) return 'WARNING';
  return 'HEALTHY';
}

/**
 * @returns {Object} health snapshot
 */
function getSystemHealth() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsagePercent = totalMemory > 0 ? (usedMemory / totalMemory) * 100 : 0;

  return {
    generatedAt: new Date().toISOString(),
    cpuCores: os.cpus().length,
    totalMemoryBytes: totalMemory,
    freeMemoryBytes: freeMemory,
    usedMemoryBytes: usedMemory,
    memoryUsagePercent: Number(memoryUsagePercent.toFixed(2)),
    nodeVersion: process.version,
    status: getHealthStatus(memoryUsagePercent),
    thresholds: { warning: WARNING_THRESHOLD, critical: CRITICAL_THRESHOLD },
  };
}

module.exports = { getSystemHealth, getHealthStatus, WARNING_THRESHOLD, CRITICAL_THRESHOLD };
