'use strict';

/**
 * services/backupService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * LabSync Security Feature #17: Database Backup and Disaster Recovery Service.
 *
 * Architecture: Custom mysql2-Based Logical SQL Exporter (Option B)
 * - Dedicated connection with supportBigNumbers, bigNumberStrings, dateStrings
 * - Shared MySQL advisory lock: labsync_schema_backup_lock
 * - Transactional consistent snapshot (REPEATABLE READ)
 * - Dynamic base-table discovery and foreign-key topological ordering
 * - Dynamic generated-column exclusion from INSERT statements
 * - SQL-mode-independent utf8mb4 hex literal serialization
 * - Memory-safe streaming with gzip compression (level 6) & SHA-256 digest
 * - Post-generation decompression & completion-trailer verification
 * - Fail-closed production restore protection
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const events = require('events');
const { Transform } = require('stream');
const mysql = require('mysql2/promise');
const pool = require('../database/connection');

const SCHEMA_BACKUP_LOCK_NAME = 'labsync_schema_backup_lock';
const LOCK_TIMEOUT_SECONDS = 10;
const MAX_DECOMPRESSED_BYTES = 250 * 1024 * 1024; // 250MB decompression safety limit

/**
 * Transform stream that hashes and measures compressed bytes on the fly.
 */
class DigestAndSizeTransform extends Transform {
    constructor() {
        super();
        this.hash = crypto.createHash('sha256');
        this.bytesWritten = 0;
    }

    _transform(chunk, encoding, callback) {
        this.hash.update(chunk);
        this.bytesWritten += chunk.length;
        callback(null, chunk);
    }

    getDigest() {
        return this.hash.digest('hex');
    }
}

/**
 * Determines whether the current runtime environment is considered production.
 * @returns {boolean}
 */
function isProductionEnvironment() {
    if (process.env.NODE_ENV === 'production') return true;
    if (process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT ||
        process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID || process.env.RAILWAY_DEPLOYMENT_ID) {
        return true;
    }
    const host = String(process.env.DB_HOST || '').toLowerCase();
    if (host.includes('railway') || host.includes('.internal')) {
        return true;
    }
    return false;
}

/**
 * Creates a dedicated MySQL connection configured specifically for backup operations.
 * Leaves the shared application pool untouched.
 * @returns {Promise<import('mysql2/promise').Connection>}
 */
async function createDedicatedBackupConnection() {
    const config = {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '',
        database: process.env.DB_NAME || 'labsync',
        port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
        supportBigNumbers: true,
        bigNumberStrings: true,
        dateStrings: true
    };

    return await mysql.createConnection(config);
}

/**
 * Serializes a JavaScript / database value into safe, SQL-mode-independent SQL text.
 * Strings and datetime values are serialized as `_utf8mb4 0x<hex>` to guarantee
 * immunity against quotes, backslashes, newlines, null bytes, and NO_BACKSLASH_ESCAPES mode.
 *
 * @param {any} val - Raw column value
 * @param {object} col - Column metadata from information_schema.COLUMNS
 * @returns {string} Safe SQL literal
 */
function serializeSqlValue(val, col) {
    if (val === null || val === undefined) {
        return 'NULL';
    }

    const dataType = (col.DATA_TYPE || '').toLowerCase();

    // Integer numeric types
    if (['tinyint', 'smallint', 'mediumint', 'int', 'bigint'].includes(dataType)) {
        if (typeof val === 'boolean') {
            return val ? '1' : '0';
        }
        const strVal = String(val).trim();
        if (/^-?\d+$/.test(strVal)) {
            return strVal;
        }
        throw new Error(`Invalid integer literal for column ${col.COLUMN_NAME}: ${val}`);
    }

    // Floating-point / fixed-point numeric types
    if (['float', 'double', 'decimal', 'numeric'].includes(dataType)) {
        const strVal = String(val).trim();
        if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(strVal)) {
            return strVal;
        }
        throw new Error(`Invalid numeric literal for column ${col.COLUMN_NAME}: ${val}`);
    }

    // Binary / BLOB types
    if (['blob', 'tinyblob', 'mediumblob', 'longblob', 'binary', 'varbinary'].includes(dataType)) {
        if (Buffer.isBuffer(val)) {
            return `0x${val.toString('hex')}`;
        }
        return `0x${Buffer.from(String(val), 'utf8').toString('hex')}`;
    }

    // Spatial / Geometry types (explicit fail-fast if encountered)
    if (['geometry', 'point', 'linestring', 'polygon', 'multipoint', 'multilinestring', 'multipolygon', 'geometrycollection'].includes(dataType)) {
        throw new Error(`Unsupported spatial column type in table ${col.TABLE_NAME || ''}: ${dataType}`);
    }

    // Date, DateTime, Timestamp, Time, String, Text, Enum, JSON
    // With dateStrings: true, dates and times are already formatted strings
    const strVal = String(val);
    if (strVal.length === 0) {
        return "''";
    }

    const hex = Buffer.from(strVal, 'utf8').toString('hex');
    return `_utf8mb4 0x${hex}`;
}

/**
 * Topologically sorts base tables so referenced tables are created before referencing tables.
 *
 * @param {import('mysql2/promise').Connection} conn
 * @param {string} dbName
 * @param {string[]} baseTables
 * @returns {Promise<string[]>}
 */
async function getTopologicalTableOrder(conn, dbName, baseTables) {
    const tableSet = new Set(baseTables);
    const deps = new Map();
    baseTables.forEach(t => deps.set(t, new Set()));

    const [fkRows] = await conn.query(
        `SELECT TABLE_NAME, REFERENCED_TABLE_NAME
         FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = ?
           AND REFERENCED_TABLE_NAME IS NOT NULL
           AND TABLE_NAME != REFERENCED_TABLE_NAME`,
        [dbName]
    );

    for (const row of fkRows) {
        const tbl = row.TABLE_NAME;
        const ref = row.REFERENCED_TABLE_NAME;
        if (tableSet.has(tbl) && tableSet.has(ref)) {
            deps.get(tbl).add(ref);
        }
    }

    const ordered = [];
    const remaining = new Set(baseTables);

    while (remaining.size > 0) {
        let progressed = false;
        for (const tbl of remaining) {
            const tableDeps = deps.get(tbl);
            // Check if all dependencies have already been placed in ordered
            let allResolved = true;
            for (const d of tableDeps) {
                if (!ordered.includes(d)) {
                    allResolved = false;
                    break;
                }
            }
            if (allResolved) {
                ordered.push(tbl);
                remaining.delete(tbl);
                progressed = true;
            }
        }

        // If a cycle or mutual dependency prevents clean ordering, append remaining tables
        if (!progressed) {
            for (const tbl of remaining) {
                ordered.push(tbl);
            }
            break;
        }
    }

    return ordered;
}

/**
 * Verifies that the created backup archive decompress cleanly, is within size bounds,
 * matches the computed SHA-256 digest, and contains the required completion marker.
 *
 * @param {string} filePath
 * @param {string} expectedSha256
 * @returns {Promise<boolean>}
 */
async function verifyDecompressedArchive(filePath, expectedSha256) {
    const stats = await fs.promises.stat(filePath);
    if (stats.size === 0) {
        throw new Error('Generated backup archive is empty (0 bytes).');
    }
    if (stats.size < 20) {
        throw new Error('Generated backup archive is truncated or corrupted.');
    }

    // Verify gzip magic bytes (0x1f, 0x8b)
    const headerBuf = Buffer.alloc(2);
    const fd = await fs.promises.open(filePath, 'r');
    await fd.read(headerBuf, 0, 2, 0);
    await fd.close();

    if (headerBuf[0] !== 0x1f || headerBuf[1] !== 0x8b) {
        throw new Error('Archive does not have a valid gzip header magic number (0x1F, 0x8B).');
    }

    // Verify SHA-256 from disk
    const fileHash = crypto.createHash('sha256');
    const readStream = fs.createReadStream(filePath);
    for await (const chunk of readStream) {
        fileHash.update(chunk);
    }
    const computedDigest = fileHash.digest('hex');
    if (computedDigest.toLowerCase() !== expectedSha256.toLowerCase()) {
        throw new Error(`Archive SHA-256 digest mismatch: expected ${expectedSha256}, computed ${computedDigest}`);
    }

    // Decompress and verify trailer and size bounds
    let totalDecompressedBytes = 0;
    let trailingBuffer = '';
    const gunzip = zlib.createGunzip();
    const decompressStream = fs.createReadStream(filePath).pipe(gunzip);

    for await (const chunk of decompressStream) {
        totalDecompressedBytes += chunk.length;
        if (totalDecompressedBytes > MAX_DECOMPRESSED_BYTES) {
            throw new Error(`Decompressed SQL exceeded safety limit of ${MAX_DECOMPRESSED_BYTES} bytes.`);
        }
        const text = chunk.toString('utf8');
        trailingBuffer = (trailingBuffer + text).slice(-2048);
    }

    if (!trailingBuffer.includes('-- Dump completed on ')) {
        throw new Error('SQL completion trailer missing from decompressed archive.');
    }

    return true;
}

/**
 * Formats a Date object as YYYY-MM-DD HH:MM:SS in local server time.
 * @param {Date} date
 * @returns {string}
 */
function formatTimestamp(date = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    const YYYY = date.getFullYear();
    const MM = pad(date.getMonth() + 1);
    const DD = pad(date.getDate());
    const HH = pad(date.getHours());
    const mm = pad(date.getMinutes());
    const ss = pad(date.getSeconds());
    return `${YYYY}-${MM}-${DD} ${HH}:${mm}:${ss}`;
}

/**
 * Generates a verified .sql.gz backup using a dedicated MySQL connection,
 * consistent snapshot transaction, advisory schema lock, and row streaming.
 *
 * @param {object} [options]
 * @returns {Promise<{
 *   filePath: string,
 *   tempDir: string,
 *   filename: string,
 *   checksumSha256: string,
 *   fileSizeBytes: number,
 *   tableCount: number
 * }>}
 */
async function generateVerifiedSqlBackup(options = {}) {
    const activeDbName = process.env.DB_NAME || 'labsync';
    const conn = await createDedicatedBackupConnection();
    let lockAcquired = false;

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'labsync-backup-'));
    const timestampStr = formatTimestamp().replace(/[: ]/g, match => (match === ' ' ? '_' : ''));
    const filename = `labsync-backup-${timestampStr.replace(/_/g, match => '')}.sql.gz`
        .replace(/(\d{4}-\d{2}-\d{2})(\d{2})(\d{2})(\d{2})/, '$1_$2$3$4');
    const finalFilename = `labsync-backup-${formatTimestamp().replace(/ /g, '_').replace(/:/g, '')}.sql.gz`;
    const tempFilePath = path.join(tempDir, finalFilename);

    const fileOut = fs.createWriteStream(tempFilePath, { mode: 0o600 });
    const gzip = zlib.createGzip({ level: 6 });
    const digestTransform = new DigestAndSizeTransform();

    gzip.pipe(digestTransform).pipe(fileOut);

    async function writeChunk(str) {
        if (!gzip.write(str)) {
            await events.once(gzip, 'drain');
        }
    }

    try {
        // 1. Acquire advisory lock
        const [lockRows] = await conn.query(
            'SELECT GET_LOCK(?, ?) AS lockAcquired',
            [SCHEMA_BACKUP_LOCK_NAME, LOCK_TIMEOUT_SECONDS]
        );

        if (!lockRows || !lockRows[0] || lockRows[0].lockAcquired !== 1) {
            throw new Error(`Failed to acquire schema backup lock '${SCHEMA_BACKUP_LOCK_NAME}' within ${LOCK_TIMEOUT_SECONDS}s. Another backup or migration may be in progress.`);
        }
        lockAcquired = true;

        // 2. Start consistent snapshot transaction
        await conn.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');

        // 3. Inspect for unsupported database objects
        const [views] = await conn.query('SELECT TABLE_NAME FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ?', [activeDbName]);
        if (views && views.length > 0) {
            throw new Error(`Unsupported database object: VIEW (${views[0].TABLE_NAME}) detected. Custom exporter supports base tables only.`);
        }

        const [triggers] = await conn.query('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ?', [activeDbName]);
        if (triggers && triggers.length > 0) {
            throw new Error(`Unsupported database object: TRIGGER (${triggers[0].TRIGGER_NAME}) detected.`);
        }

        const [routines] = await conn.query('SELECT ROUTINE_NAME FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ?', [activeDbName]);
        if (routines && routines.length > 0) {
            throw new Error(`Unsupported database object: ROUTINE (${routines[0].ROUTINE_NAME}) detected.`);
        }

        const [eventsList] = await conn.query('SELECT EVENT_NAME FROM information_schema.EVENTS WHERE EVENT_SCHEMA = ?', [activeDbName]);
        if (eventsList && eventsList.length > 0) {
            throw new Error(`Unsupported database object: EVENT (${eventsList[0].EVENT_NAME}) detected.`);
        }

        // 4. Discover base tables
        const [tableRows] = await conn.query(
            "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME ASC",
            [activeDbName]
        );
        const baseTables = tableRows.map(r => r.TABLE_NAME);
        if (baseTables.length === 0) {
            throw new Error(`No base tables found in database '${activeDbName}'. Backup aborted.`);
        }

        // 5. Order tables topologically by foreign keys
        const orderedTables = await getTopologicalTableOrder(conn, activeDbName, baseTables);

        // 6. Write SQL header
        const nowFormatted = formatTimestamp();
        await writeChunk(
            `-- LabSync MySQL/MariaDB Database Dump\n` +
            `-- Backup Generated: ${nowFormatted}\n` +
            `-- ------------------------------------------------------\n\n` +
            `/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;\n` +
            `/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;\n` +
            `/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;\n` +
            `/*!40101 SET NAMES utf8mb4 */;\n` +
            `/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;\n` +
            `/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;\n` +
            `/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;\n` +
            `/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;\n\n`
        );

        // 7. Iterate through tables and serialize schema + data
        for (const tableName of orderedTables) {
            // Write table structure
            await writeChunk(
                `--\n` +
                `-- Table structure for table \`${tableName}\`\n` +
                `--\n\n` +
                `DROP TABLE IF EXISTS \`${tableName}\`;\n` +
                `/*!40101 SET @saved_cs_client     = @@character_set_client */;\n` +
                `/*!40101 SET character_set_client = utf8mb4 */;\n`
            );

            const [createRows] = await conn.query(`SHOW CREATE TABLE \`${tableName}\``);
            if (!createRows || createRows.length === 0 || !createRows[0]['Create Table']) {
                throw new Error(`Failed to retrieve CREATE TABLE statement for table: ${tableName}`);
            }

            await writeChunk(`${createRows[0]['Create Table']};\n`);
            await writeChunk(`/*!40101 SET character_set_client = @saved_cs_client */;\n\n`);

            // Inspect columns and filter out generated columns
            const [columnRows] = await conn.query(
                `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, EXTRA, GENERATION_EXPRESSION, IS_NULLABLE
                 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
                 ORDER BY ORDINAL_POSITION ASC`,
                [activeDbName, tableName]
            );

            const nonGeneratedColumns = columnRows.filter(c => {
                const extra = (c.EXTRA || '').toUpperCase();
                const genExpr = c.GENERATION_EXPRESSION || '';
                return !extra.includes('GENERATED') && !genExpr;
            });

            if (nonGeneratedColumns.length === 0) {
                continue;
            }

            const colListSql = nonGeneratedColumns.map(c => `\`${c.COLUMN_NAME}\``).join(', ');

            // Write table data
            await writeChunk(
                `--\n` +
                `-- Dumping data for table \`${tableName}\`\n` +
                `--\n\n` +
                `LOCK TABLES \`${tableName}\` WRITE;\n` +
                `/*!40000 ALTER TABLE \`${tableName}\` DISABLE KEYS */;\n`
            );

            // Stream rows using the non-generated column list
            const rowQuery = `SELECT ${colListSql} FROM \`${tableName}\``;
            const rowStream = conn.connection.query(rowQuery).stream({ highWaterMark: 100 });

            const BATCH_SIZE = 100;
            let batch = [];

            for await (const row of rowStream) {
                const serializedValues = nonGeneratedColumns.map(col => {
                    return serializeSqlValue(row[col.COLUMN_NAME], col);
                });
                batch.push(`(${serializedValues.join(', ')})`);

                if (batch.length >= BATCH_SIZE) {
                    await writeChunk(`INSERT INTO \`${tableName}\` (${colListSql}) VALUES\n${batch.join(',\n')};\n`);
                    batch = [];
                }
            }

            if (batch.length > 0) {
                await writeChunk(`INSERT INTO \`${tableName}\` (${colListSql}) VALUES\n${batch.join(',\n')};\n`);
                batch = [];
            }

            await writeChunk(
                `/*!40000 ALTER TABLE \`${tableName}\` ENABLE KEYS */;\n` +
                `UNLOCK TABLES;\n\n`
            );
        }

        // 8. Write SQL trailer
        const completedTimestamp = formatTimestamp();
        await writeChunk(
            `/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;\n` +
            `/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;\n` +
            `/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;\n` +
            `/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;\n` +
            `/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;\n` +
            `/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;\n` +
            `/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;\n\n` +
            `-- Dump completed on ${completedTimestamp}\n`
        );

        // 9. End stream and wait for compression and file writing to complete
        gzip.end();
        await events.once(fileOut, 'finish');

        // 10. Commit snapshot transaction
        await conn.query('COMMIT');

        // 11. Retrieve computed hash digest and size
        const checksumSha256 = digestTransform.getDigest();
        const fileSizeBytes = digestTransform.bytesWritten;

        // 12. Verify decompressed archive integrity
        await verifyDecompressedArchive(tempFilePath, checksumSha256);

        return {
            filePath: tempFilePath,
            tempDir,
            filename: finalFilename,
            checksumSha256,
            fileSizeBytes,
            tableCount: orderedTables.length
        };
    } catch (err) {
        try {
            await conn.query('ROLLBACK');
        } catch (_) {}

        // Clean up temporary files on export failure
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (_) {}

        throw err;
    } finally {
        if (lockAcquired) {
            try {
                await conn.query('SELECT RELEASE_LOCK(?)', [SCHEMA_BACKUP_LOCK_NAME]);
            } catch (releaseErr) {
                console.warn('[BackupService] Warning: Error releasing advisory lock:', releaseErr.message);
            }
        }
        try {
            await conn.end();
        } catch (_) {}
    }
}

/**
 * Inserts a record into the backup_history table.
 *
 * @param {object} params
 * @returns {Promise<number>} Inserted Backup_ID
 */
async function recordBackupHistoryEntry({
    filename,
    triggerType = 'MANUAL',
    status = 'PENDING',
    fileSizeBytes = 0,
    tableCount = 0,
    checksumSha256 = null,
    errorMessage = null,
    executedByEmail = null,
    ipAddress = null
}) {
    const [result] = await pool.query(
        `INSERT INTO backup_history
         (Filename, Trigger_Type, Status, File_Size_Bytes, Table_Count, Checksum_SHA256, Error_Message, Executed_By_Email, IP_Address, Created_At)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
            filename,
            triggerType,
            status,
            fileSizeBytes,
            tableCount,
            checksumSha256,
            errorMessage,
            executedByEmail,
            ipAddress
        ]
    );

    return result.insertId;
}

/**
 * Updates an existing backup_history record's status and error message.
 *
 * @param {number} backupId
 * @param {object} updates
 * @returns {Promise<void>}
 */
async function updateBackupHistoryStatus(backupId, { status, errorMessage = null }) {
    await pool.query(
        'UPDATE backup_history SET Status = ?, Error_Message = ? WHERE Backup_ID = ?',
        [status, errorMessage, backupId]
    );
}

/**
 * Returns safe metadata and history for administrative monitoring.
 *
 * @returns {Promise<object>}
 */
async function getBackupStatus() {
    const isProd = isProductionEnvironment();
    let dbVersion = 'Unknown';
    let tableCount = 0;

    try {
        const [verRows] = await pool.query('SELECT VERSION() AS ver');
        if (verRows && verRows[0] && verRows[0].ver) {
            dbVersion = verRows[0].ver;
        }
        const activeDb = process.env.DB_NAME || 'labsync';
        const [countRows] = await pool.query(
            "SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'",
            [activeDb]
        );
        if (countRows && countRows[0]) {
            tableCount = countRows[0].total;
        }
    } catch (err) {
        console.error('[BackupService] Failed to query database metadata:', err.message);
    }

    let latestBackup = null;
    let recentBackups = [];

    try {
        const [latestRows] = await pool.query(
            'SELECT Backup_ID, Filename, Trigger_Type, Status, File_Size_Bytes, Table_Count, Checksum_SHA256, Created_At FROM backup_history ORDER BY Created_At DESC LIMIT 1'
        );
        if (latestRows && latestRows.length > 0) {
            latestBackup = latestRows[0];
        }

        const [recentRows] = await pool.query(
            'SELECT Backup_ID, Filename, Status, File_Size_Bytes, Table_Count, Checksum_SHA256, Created_At FROM backup_history WHERE Status = "SUCCESS" ORDER BY Created_At DESC LIMIT 10'
        );
        recentBackups = recentRows || [];
    } catch (err) {
        console.error('[BackupService] Failed to query backup history:', err.message);
    }

    return {
        available: true,
        databaseEngine: dbVersion.includes('MariaDB') ? 'MariaDB' : 'MySQL',
        databaseVersion: dbVersion,
        baseTableCount: tableCount,
        isProduction: isProd,
        latestBackup,
        recentBackups
    };
}

module.exports = {
    SCHEMA_BACKUP_LOCK_NAME,
    LOCK_TIMEOUT_SECONDS,
    MAX_DECOMPRESSED_BYTES,
    isProductionEnvironment,
    createDedicatedBackupConnection,
    serializeSqlValue,
    getTopologicalTableOrder,
    verifyDecompressedArchive,
    generateVerifiedSqlBackup,
    recordBackupHistoryEntry,
    updateBackupHistoryStatus,
    getBackupStatus
};

