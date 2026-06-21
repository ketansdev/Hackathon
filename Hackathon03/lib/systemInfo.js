/**
 * lib/systemInfo.js
 * ------------------
 * Responsible for ONE thing: gathering system / environment information.
 *
 * Design goals:
 *  - Never throw. Every field is collected defensively so that one failing
 *    OS call (e.g. os.userInfo() failing in a sandboxed/containerized env)
 *    does not take down the whole report.
 *  - Return plain JSON-serializable data so it can be printed as a table,
 *    dumped to JSON, written to a file, or piped into another tool.
 */

'use strict';

const os = require('os');
const process = require('process');

/**
 * Safely run a function and fall back to a default value (or an
 * explanatory string) if it throws or returns undefined/null.
 *
 * @param {Function} fn      - zero-arg function to execute
 * @param {*} fallback       - value to use if fn throws or returns nothing
 * @returns {*}
 */
function safe(fn, fallback = 'N/A') {
  try {
    const result = fn();
    return result === undefined || result === null || result === ''
      ? fallback
      : result;
  } catch (err) {
    return `Unavailable (${err.message})`;
  }
}

/**
 * Convert bytes to a human readable string (GB, 2 decimal places).
 */
function bytesToGB(bytes) {
  if (typeof bytes !== 'number' || Number.isNaN(bytes)) return 'N/A';
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/**
 * Pull a curated whitelist of environment variables.
 * We deliberately whitelist rather than dump `process.env` wholesale,
 * because process.env can contain secrets (API keys, tokens, passwords).
 * Dumping everything would be an information-disclosure risk.
 *
 * @param {string[]} keys - explicit list of env var names to read
 */
function getSelectedEnvVars(keys) {
  const result = {};
  for (const key of keys) {
    result[key] = safe(() => process.env[key], 'Not set');
  }
  return result;
}

/**
 * The default safe-list of environment variables. Chosen because they are
 * common, generally non-sensitive, and useful for debugging an environment.
 * Extend this list via getSystemInfo({ envKeys: [...] }) if needed.
 */
const DEFAULT_ENV_KEYS = [
  'PATH',
  'HOME',
  'USER',
  'USERNAME',
  'SHELL',
  'LANG',
  'TERM',
  'NODE_ENV',
  'TMPDIR',
  'TEMP',
  'PWD',
];

/**
 * Gather a structured snapshot of system and environment information.
 *
 * @param {Object} options
 * @param {string[]} [options.envKeys] - override which env vars to report
 * @returns {Object} structured system info report
 */
function getSystemInfo(options = {}) {
  const envKeys = options.envKeys || DEFAULT_ENV_KEYS;

  const cpus = safe(() => os.cpus(), []);

  return {
    generatedAt: new Date().toISOString(),

    operatingSystem: {
      type: safe(() => os.type()),          // e.g. 'Linux', 'Windows_NT', 'Darwin'
      platform: safe(() => os.platform()),  // e.g. 'linux', 'win32', 'darwin'
      release: safe(() => os.release()),
      version: safe(() => os.version()),
      uptimeSeconds: safe(() => os.uptime()),
      endianness: safe(() => os.endianness()),
    },

    cpu: {
      architecture: safe(() => os.arch()),  // e.g. 'x64', 'arm64'
      model: safe(() => (Array.isArray(cpus) && cpus.length ? cpus[0].model : 'N/A')),
      coreCount: safe(() => (Array.isArray(cpus) ? cpus.length : 'N/A')),
      loadAverage: safe(() => os.loadavg()), // [1m, 5m, 15m] - empty array on Windows
    },

    memory: {
      totalMemory: safe(() => bytesToGB(os.totalmem())),
      freeMemory: safe(() => bytesToGB(os.freemem())),
    },

    host: {
      hostname: safe(() => os.hostname()),
      homeDirectory: safe(() => os.homedir()),
      tempDirectory: safe(() => os.tmpdir()),
      currentWorkingDirectory: safe(() => process.cwd()),
    },

    user: {
      // os.userInfo() can throw in some restricted/containerized environments
      // (no matching /etc/passwd entry), hence the `safe()` wrapper.
      username: safe(() => os.userInfo().username),
      uid: safe(() => os.userInfo().uid),
      gid: safe(() => os.userInfo().gid),
      shell: safe(() => os.userInfo().shell),
    },

    runtime: {
      nodeVersion: safe(() => process.version),
      v8Version: safe(() => process.versions.v8),
      execPath: safe(() => process.execPath),
      pid: safe(() => process.pid),
    },

    environmentVariables: getSelectedEnvVars(envKeys),
  };
}

module.exports = {
  getSystemInfo,
  getSelectedEnvVars,
  DEFAULT_ENV_KEYS,
};
