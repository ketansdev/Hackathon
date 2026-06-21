/**
 * lib/hash.js
 * -----------
 * Feature: File Hashing.
 * Computes SHA256 and MD5 digests for a single file inside the sandbox.
 * Uses Node's built-in crypto module - no external dependency.
 */

'use strict';

const fs = require('fs');
const crypto = require('crypto');

/**
 * Hash a file's raw bytes with the given algorithm.
 * @param {string} fullPath - absolute, already sandbox-validated path
 * @param {string} algorithm - e.g. 'sha256' or 'md5'
 * @returns {string} hex digest
 */
function hashAlgorithm(fullPath, algorithm) {
  const data = fs.readFileSync(fullPath);
  return crypto.createHash(algorithm).update(data).digest('hex');
}

/**
 * Compute SHA256 + MD5 for a file already resolved to a safe absolute path.
 * @param {FileCRUD} crud - sandbox-aware file manager (used only to resolve
 *   the path and confirm the file exists; never bypasses the sandbox).
 * @param {string} relativePath
 * @returns {{success: boolean, message?: string, path?: string, sha256?: string, md5?: string}}
 */
function hashFile(crud, relativePath) {
  try {
    const fullPath = crud.resolveSafePath(relativePath);
    if (!fs.existsSync(fullPath)) {
      return { success: false, message: `File not found: ${relativePath}` };
    }
    const stats = fs.statSync(fullPath);
    if (!stats.isFile()) {
      return { success: false, message: `Not a regular file: ${relativePath}` };
    }
    return {
      success: true,
      path: relativePath,
      sizeBytes: stats.size,
      sha256: hashAlgorithm(fullPath, 'sha256'),
      md5: hashAlgorithm(fullPath, 'md5'),
    };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

module.exports = { hashFile };
