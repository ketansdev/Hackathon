/**
 * lib/fileCRUD.js
 * ----------------
 * Provides Create / Read / Update / Delete operations for code files.
 *
 * Safety design (important - read before modifying):
 *  1. SANDBOXED ROOT: every operation is resolved against a single
 *     `baseDir` (defaults to ./workspace relative to where the tool is
 *     run). Path traversal outside of that root (e.g. "../../etc/passwd")
 *     is rejected. This stops the tool from being used to read/write
 *     arbitrary files on the host system.
 *  2. EXTENSION WHITELIST: only recognized "code file" extensions can be
 *     created/updated (.js, .ts, .py, .json, .md, .txt, .html, .css, ...).
 *     This keeps the tool scoped to its stated purpose (managing code
 *     files) rather than becoming a general-purpose file editor.
 *  3. NO OVERWRITE-BY-SURPRISE: `create()` refuses to clobber an existing
 *     file; `update()` refuses to create a new one. Use the right verb.
 *  4. Every function returns a result object { success, message, ... }
 *     instead of throwing, so calling code (CLI or otherwise) can handle
 *     failures gracefully and uniformly.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ALLOWED_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.py', '.rb', '.go', '.java', '.c', '.cpp', '.h',
  '.json', '.md', '.txt', '.yml', '.yaml',
  '.html', '.css', '.scss', '.sh',
]);

class FileCRUD {
  /**
   * @param {string} baseDir - root directory all operations are confined to.
   */
  constructor(baseDir = path.join(process.cwd(), 'workspace')) {
    this.baseDir = path.resolve(baseDir);
    // Ensure the sandbox root exists.
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /**
   * Resolve a user-supplied relative path against baseDir and verify it
   * does not escape the sandbox (blocks "../" traversal tricks).
   * Throws a plain Error with a clear message on violation; callers in
   * this class always wrap calls in try/catch so this is safe.
   */
  _resolveSafePath(relativePath) {
    if (typeof relativePath !== 'string' || relativePath.trim() === '') {
      throw new Error('File path must be a non-empty string.');
    }
    const resolved = path.resolve(this.baseDir, relativePath);
    if (resolved !== this.baseDir && !resolved.startsWith(this.baseDir + path.sep)) {
      throw new Error(
        `Path traversal blocked: "${relativePath}" resolves outside the sandbox root.`
      );
    }
    return resolved;
  }

  /**
   * Public helper for other modules (hash, search, stats, backup, ...) that
   * need a sandbox-safe absolute path without going through the full
   * create/read/update/delete API. Throws on traversal attempts, same as
   * the internal resolver.
   */
  resolveSafePath(relativePath) {
    return this._resolveSafePath(relativePath);
  }

  _checkExtension(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new Error(
        `File extension "${ext || '(none)'}" is not in the allowed code-file list.`
      );
    }
  }

  /** CREATE: write a new file. Fails if the file already exists. */
  create(relativePath, content = '') {
    try {
      const fullPath = this._resolveSafePath(relativePath);
      this._checkExtension(fullPath);
      if (fs.existsSync(fullPath)) {
        return { success: false, message: `File already exists: ${relativePath}. Use update() instead.` };
      }
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content, 'utf8');
      return { success: true, message: `Created ${relativePath}`, path: fullPath };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  /** READ: return the contents of a file, plus basic metadata. */
  read(relativePath) {
    try {
      const fullPath = this._resolveSafePath(relativePath);
      if (!fs.existsSync(fullPath)) {
        return { success: false, message: `File not found: ${relativePath}` };
      }
      const stats = fs.statSync(fullPath);
      if (!stats.isFile()) {
        return { success: false, message: `Not a regular file: ${relativePath}` };
      }
      const content = fs.readFileSync(fullPath, 'utf8');
      return {
        success: true,
        path: fullPath,
        sizeBytes: stats.size,
        modified: stats.mtime.toISOString(),
        content,
      };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  /** UPDATE: overwrite (or append to) an existing file's contents. */
  update(relativePath, content, { append = false } = {}) {
    try {
      const fullPath = this._resolveSafePath(relativePath);
      this._checkExtension(fullPath);
      if (!fs.existsSync(fullPath)) {
        return { success: false, message: `File not found: ${relativePath}. Use create() instead.` };
      }
      if (append) {
        fs.appendFileSync(fullPath, content, 'utf8');
      } else {
        fs.writeFileSync(fullPath, content, 'utf8');
      }
      return { success: true, message: `Updated ${relativePath}`, path: fullPath, appended: append };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  /** DELETE: remove a file. */
  delete(relativePath) {
    try {
      const fullPath = this._resolveSafePath(relativePath);
      if (!fs.existsSync(fullPath)) {
        return { success: false, message: `File not found: ${relativePath}` };
      }
      fs.unlinkSync(fullPath);
      return { success: true, message: `Deleted ${relativePath}` };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  /** LIST: convenience helper to see what's currently in the sandbox. */
  list(relativeDir = '.') {
    try {
      const fullPath = this._resolveSafePath(relativeDir);
      if (!fs.existsSync(fullPath)) {
        return { success: false, message: `Directory not found: ${relativeDir}` };
      }
      const entries = fs.readdirSync(fullPath, { withFileTypes: true }).map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
      }));
      return { success: true, path: fullPath, entries };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }
}

module.exports = { FileCRUD, ALLOWED_EXTENSIONS };