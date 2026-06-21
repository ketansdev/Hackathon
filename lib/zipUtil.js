/**
 * lib/zipUtil.js
 * --------------
 * Minimal, dependency-free ZIP archive writer.
 *
 * Why hand-rolled instead of an npm package (e.g. archiver/adm-zip)?
 * Keeping the tool zero-dependency means `npm install` is never required
 * to run it, and there's nothing extra to audit for security. The ZIP
 * format is simple enough to implement correctly with just Node's
 * built-in `zlib` (for DEFLATE compression) and a small CRC32 routine.
 *
 * Supports: one or more {name, data} entries, DEFLATE compression,
 * standard local file headers + central directory + EOCD record.
 * Does NOT support: ZIP64 (files >4GB / >65535 entries), encryption,
 * or extra fields - none of which the workspace backup feature needs.
 */

'use strict';

const zlib = require('zlib');

// Standard CRC32 table (IEEE 802.3 polynomial 0xEDB88320), built once.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** DOS date/time encoding required by the ZIP local file header. */
function toDosDateTime(date) {
  const dosTime =
    (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const dosDate =
    ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

/**
 * Build a ZIP archive buffer from a list of entries.
 * @param {Array<{name: string, data: Buffer, date?: Date}>} entries
 *   `name` should use forward slashes (ZIP convention) and may include
 *   directory separators, e.g. "src/index.js".
 * @returns {Buffer} the complete .zip file contents
 */
function createZip(entries) {
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8');
    const rawData = entry.data;
    const compressed = zlib.deflateRawSync(rawData);
    const crc = crc32(rawData);
    const { dosTime, dosDate } = toDosDateTime(entry.date || new Date());

    // Use stored (uncompressed) data if compression didn't actually help
    // (can happen with tiny/already-compressed files).
    const useStore = compressed.length >= rawData.length;
    const method = useStore ? 0 : 8;
    const payload = useStore ? rawData : compressed;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // local file header signature
    localHeader.writeUInt16LE(20, 4); // version needed to extract
    localHeader.writeUInt16LE(0, 6); // general purpose bit flag
    localHeader.writeUInt16LE(method, 8); // compression method
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(payload.length, 18); // compressed size
    localHeader.writeUInt32LE(rawData.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length

    localChunks.push(localHeader, nameBuf, payload);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // central directory signature
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed to extract
    centralHeader.writeUInt16LE(0, 8); // general purpose bit flag
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(rawData.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra field length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal file attributes
    centralHeader.writeUInt32LE(0, 38); // external file attributes
    centralHeader.writeUInt32LE(offset, 42); // relative offset of local header

    centralChunks.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + payload.length;
  }

  const centralDirSize = centralChunks.reduce((sum, buf) => sum + buf.length, 0);
  const centralDirOffset = offset;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk where central directory starts
  eocd.writeUInt16LE(entries.length, 8); // entries on this disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localChunks, ...centralChunks, eocd]);
}

module.exports = { createZip, crc32 };
