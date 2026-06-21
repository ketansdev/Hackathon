#!/usr/bin/env node
/**
 * index.js
 * --------
 * CLI entry point. Wires together:
 *   - lib/systemInfo.js  -> system/environment data collection
 *   - lib/fileCRUD.js    -> sandboxed Create/Read/Update/Delete on code files
 *   - lib/stats.js       -> workspace statistics
 *   - lib/hash.js        -> SHA256 / MD5 file hashing
 *   - lib/report.js      -> saving sysinfo snapshots to ./reports
 *   - lib/backup.js      -> zipping the workspace to ./backups
 *   - lib/history.js     -> recording commands to .history.json
 *   - lib/search.js      -> recursive filename search
 *   - lib/health.js      -> CPU/memory health check
 *   - lib/ui.js          -> shared console formatting helpers
 *
 * Usage:
 *   node index.js sysinfo [--json] [--out <file>] [--save]
 *   node index.js create <relativePath> [content]
 *   node index.js read   <relativePath>
 *   node index.js update <relativePath> <content> [--append]
 *   node index.js delete <relativePath>
 *   node index.js list   [relativeDir]
 *   node index.js stats  [--json]
 *   node index.js hash   <relativePath> [--json]
 *   node index.js backup
 *   node index.js history [--json] [--limit <n>]
 *   node index.js search <keyword> [--json]
 *   node index.js health [--json]
 *   node index.js help
 *
 * All file operations are sandboxed to ./workspace (see lib/fileCRUD.js).
 * Reports, backups, and history live outside the sandbox since they are
 * tool-generated metadata, not user-managed code files.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { getSystemInfo } = require('./lib/systemInfo');
const { FileCRUD } = require('./lib/fileCRUD');
const { getWorkspaceStats } = require('./lib/stats');
const { hashFile } = require('./lib/hash');
const { saveReport } = require('./lib/report');
const { createBackup } = require('./lib/backup');
const { appendHistory, getRecentHistory } = require('./lib/history');
const { searchFiles, formatAsTree } = require('./lib/search');
const { getSystemHealth } = require('./lib/health');
const ui = require('./lib/ui');

const crud = new FileCRUD();
const PROJECT_ROOT = process.cwd();
const REPORTS_DIR = path.join(PROJECT_ROOT, 'reports');
const BACKUPS_DIR = path.join(PROJECT_ROOT, 'backups');
const HISTORY_FILE = path.join(PROJECT_ROOT, '.history.json');

// ---------------------------------------------------------------------
// Output helpers (system info / generic CRUD results - unchanged format)
// ---------------------------------------------------------------------

function printHeader(title) {
  const line = '='.repeat(title.length + 4);
  console.log(`\n${line}\n  ${title}\n${line}`);
}

function printKeyValueBlock(title, obj) {
  printHeader(title);
  for (const [key, value] of Object.entries(obj)) {
    console.log(`  ${key.padEnd(24)}: ${formatValue(value)}`);
  }
}

function formatValue(value) {
  if (Array.isArray(value)) return value.length ? value.join(', ') : '(empty)';
  if (value === undefined || value === null || value === '') return 'N/A';
  return String(value);
}

function printSystemInfo(info) {
  console.log('\nSYSTEM INFORMATION REPORT');
  console.log(`Generated at: ${info.generatedAt}`);
  printKeyValueBlock('Operating System', info.operatingSystem);
  printKeyValueBlock('CPU', info.cpu);
  printKeyValueBlock('Memory', info.memory);
  printKeyValueBlock('Host', info.host);
  printKeyValueBlock('User', info.user);
  printKeyValueBlock('Node.js Runtime', info.runtime);
  printKeyValueBlock('Selected Environment Variables', info.environmentVariables);
  console.log('');
}

function printResult(result) {
  if (result.success) {
    if (result.message) console.log(`[OK] ${result.message}`);
    else console.log(`[OK] ${result.path || ''}`.trim());
    if (result.content !== undefined) {
      console.log(`(${result.sizeBytes} bytes, modified ${result.modified})`);
      console.log('--- content ---');
      console.log(result.content);
      console.log('---------------');
    }
    if (result.entries) {
      result.entries.forEach((e) => console.log(`  [${e.type}] ${e.name}`));
    }
  } else {
    console.error(`[ERROR] ${result.message}`);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------
// New feature output helpers
// ---------------------------------------------------------------------

function printStats(stats) {
  ui.printHeader('Workspace Statistics');
  ui.printKeyValueTable({
    'Total files': stats.totalFiles,
    'Total directories': stats.totalDirectories,
    'Total size': ui.formatBytes(stats.totalSizeBytes),
  });

  console.log('\n  File count by extension:');
  const extensions = Object.entries(stats.fileCountByExtension);
  if (extensions.length === 0) {
    console.log('    (workspace is empty)');
  } else {
    extensions
      .sort((a, b) => b[1] - a[1])
      .forEach(([ext, count]) => console.log(`    ${ext.padEnd(18)}: ${count}`));
  }

  console.log('\n  Largest file :', stats.largestFile
    ? `${stats.largestFile.path} (${ui.formatBytes(stats.largestFile.sizeBytes)})`
    : 'N/A');
  console.log('  Smallest file:', stats.smallestFile
    ? `${stats.smallestFile.path} (${ui.formatBytes(stats.smallestFile.sizeBytes)})`
    : 'N/A');
  console.log('');
}

function printHash(result) {
  if (!result.success) {
    ui.printError(result.message);
    process.exitCode = 1;
    return;
  }
  ui.printHeader(`File Hash: ${result.path}`);
  console.log(`  SHA256: ${result.sha256}`);
  console.log(`  MD5   : ${result.md5}`);
  console.log('');
}

function printHistory(entries) {
  ui.printHeader('Command History');
  if (entries.length === 0) {
    console.log('  (no commands recorded yet)');
    console.log('');
    return;
  }
  entries.forEach((entry) => {
    const status = entry.success ? '[OK]   ' : '[ERROR]';
    console.log(`  ${status} ${entry.timestamp}  ${entry.command}`);
  });
  console.log('');
}

function printSearchResults(matches) {
  ui.printHeader(`Search Results (${matches.length} match${matches.length === 1 ? '' : 'es'})`);
  console.log(formatAsTree(matches));
  console.log('');
}

function printHealth(health) {
  ui.printHeader('System Health');
  ui.printKeyValueTable({
    'CPU cores': health.cpuCores,
    'Free memory': ui.formatBytes(health.freeMemoryBytes),
    'Total memory': ui.formatBytes(health.totalMemoryBytes),
    'Memory usage': `${health.memoryUsagePercent}%`,
    'Node version': health.nodeVersion,
  });
  console.log(`\n  Status: ${health.status}`);
  console.log('');
}

// ---------------------------------------------------------------------
// Command handling
// ---------------------------------------------------------------------

function printHelp() {
  console.log(`
System Info & File CRUD Tool

Commands:
  sysinfo [--json] [--out <file>] [--save]   Gather/display system info
  create  <path> [content]                   Create a new code file
  read    <path>                             Read a code file's contents
  update  <path> <content> [--append]        Update (overwrite/append) a file
  delete  <path>                             Delete a file
  list    [dir]                              List files in the workspace
  stats   [--json]                           Show workspace statistics
  hash    <path> [--json]                    SHA256 + MD5 hash of a file
  backup                                     Zip the workspace into ./backups
  history [--json] [--limit <n>]             Show recent command history
  search  <keyword> [--json]                 Search filenames in workspace
  health  [--json]                           Show CPU/memory health status
  help                                       Show this message

All file operations are confined to the "./workspace" directory.
Reports save to "./reports", backups to "./backups", history to
".history.json" (all relative to where the CLI is run from).
`);
}

function main() {
  const [, , command, ...args] = process.argv;
  const fullCommandLine = [command, ...args].filter(Boolean).join(' ');
  let commandSucceeded = true;

  try {
    switch (command) {
      case 'sysinfo': {
        const info = getSystemInfo();
        const jsonFlag = args.includes('--json');
        const saveFlag = args.includes('--save');
        const outIndex = args.indexOf('--out');
        const outFile = outIndex !== -1 ? args[outIndex + 1] : null;

        if (outFile) {
          fs.writeFileSync(outFile, JSON.stringify(info, null, 2), 'utf8');
          console.log(`System info written to ${outFile}`);
        } else if (jsonFlag) {
          console.log(JSON.stringify(info, null, 2));
        } else {
          printSystemInfo(info);
        }

        if (saveFlag) {
          const saveResult = saveReport(info, REPORTS_DIR);
          if (saveResult.success) ui.printOK(saveResult.message);
          else {
            ui.printError(saveResult.message);
            commandSucceeded = false;
          }
        }
        break;
      }

      case 'create': {
        const [filePath, ...contentParts] = args;
        const result = crud.create(filePath, contentParts.join(' '));
        printResult(result);
        commandSucceeded = result.success;
        break;
      }

      case 'read': {
        const [filePath] = args;
        const result = crud.read(filePath);
        printResult(result);
        commandSucceeded = result.success;
        break;
      }

      case 'update': {
        const appendFlag = args.includes('--append');
        const cleanArgs = args.filter((a) => a !== '--append');
        const [filePath, ...contentParts] = cleanArgs;
        const result = crud.update(filePath, contentParts.join(' '), { append: appendFlag });
        printResult(result);
        commandSucceeded = result.success;
        break;
      }

      case 'delete': {
        const [filePath] = args;
        const result = crud.delete(filePath);
        printResult(result);
        commandSucceeded = result.success;
        break;
      }

      case 'list': {
        const [dir] = args;
        const result = crud.list(dir || '.');
        printResult(result);
        commandSucceeded = result.success;
        break;
      }

      case 'stats': {
        const jsonFlag = args.includes('--json');
        const stats = getWorkspaceStats(crud.baseDir);
        if (jsonFlag) console.log(JSON.stringify(stats, null, 2));
        else printStats(stats);
        break;
      }

      case 'hash': {
        const [filePath] = args.filter((a) => a !== '--json');
        const jsonFlag = args.includes('--json');
        const result = hashFile(crud, filePath);
        if (jsonFlag) console.log(JSON.stringify(result, null, 2));
        else printHash(result);
        commandSucceeded = result.success;
        break;
      }

      case 'backup': {
        const result = createBackup(crud.baseDir, BACKUPS_DIR);
        if (result.success) {
          ui.printOK(result.message);
          console.log(`  Files archived: ${result.fileCount}`);
          console.log(`  Archive size  : ${ui.formatBytes(result.sizeBytes)}`);
        } else {
          ui.printError(result.message);
        }
        commandSucceeded = result.success;
        break;
      }

      case 'history': {
        const jsonFlag = args.includes('--json');
        const limitIndex = args.indexOf('--limit');
        const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1], 10) || 20 : 20;
        const entries = getRecentHistory(HISTORY_FILE, limit);
        if (jsonFlag) console.log(JSON.stringify(entries, null, 2));
        else printHistory(entries);
        break;
      }

      case 'search': {
        const jsonFlag = args.includes('--json');
        const [keyword] = args.filter((a) => a !== '--json');
        if (!keyword) {
          ui.printError('Usage: node index.js search <keyword>');
          commandSucceeded = false;
          break;
        }
        const matches = searchFiles(crud.baseDir, keyword);
        if (jsonFlag) console.log(JSON.stringify(matches, null, 2));
        else printSearchResults(matches);
        break;
      }

      case 'health': {
        const jsonFlag = args.includes('--json');
        const health = getSystemHealth();
        if (jsonFlag) console.log(JSON.stringify(health, null, 2));
        else printHealth(health);
        if (health.status === 'CRITICAL') commandSucceeded = false;
        break;
      }

      case 'help':
      case undefined:
        printHelp();
        break;

      default:
        console.error(`Unknown command: "${command}"`);
        printHelp();
        process.exitCode = 1;
        commandSucceeded = false;
    }
  } catch (err) {
    ui.printError(err.message);
    process.exitCode = 1;
    commandSucceeded = false;
  }

  if (command && command !== 'help') {
    appendHistory(HISTORY_FILE, fullCommandLine, commandSucceeded);
  }
}

main();