'use strict';

const fs = require('fs');
const path = require('path');
const db = require('./connection');

const IGNORABLE_ERROR_CODES = [
    'ER_DUP_FIELDNAME',          // Duplicate column name
    'ER_CANT_DROP_FIELD_OR_KEY', // Can't drop field/key (doesn't exist)
    'ER_DUP_KEYNAME',            // Duplicate key/index name
    'ER_FK_DUP_NAME',            // Duplicate foreign key constraint name
    'ER_FK_FAIL_ADD_SYSTEM',     // Duplicate foreign key constraint (errno 121)
    1060,                        // Duplicate column name
    1061,                        // Duplicate key name
    1091,                        // Can't drop field/key
    121,                         // Duplicate foreign key constraint
    1826                         // Duplicate foreign key constraint name
];

const SCHEMA_BACKUP_LOCK_NAME = 'labsync_schema_backup_lock';
const LOCK_TIMEOUT_SECONDS = 10;

async function runSingleStatement(connOrStatement, statementOrFilename, maybeFilename) {
    let conn = db;
    let statement = connOrStatement;
    let filename = statementOrFilename;

    if (connOrStatement && typeof connOrStatement.query === 'function' && typeof statementOrFilename === 'string') {
        conn = connOrStatement;
        statement = statementOrFilename;
        filename = maybeFilename || 'statement';
    }

    const cleanSql = statement.trim();
    if (!cleanSql) return;

    try {
        await conn.query(cleanSql);
    } catch (err) {
        const isDuplicateFk = err.code === 'ER_CANT_CREATE_TABLE' && 
            (err.message.includes('121') || err.message.includes('Duplicate'));

        if (IGNORABLE_ERROR_CODES.includes(err.code) || IGNORABLE_ERROR_CODES.includes(err.errno) || isDuplicateFk) {
            console.log(`[migrate] ${filename} — Safely skipped existing schema element: ${err.message}`);
        } else {
            console.error(`[migrate] Fatal error executing statement from ${filename}:`, err.message);
            throw err;
        }
    }
}

async function runMigrations() {
    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
        console.warn('[migrate] Migrations directory does not exist.');
        return;
    }

    const files = fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql'))
        .sort();

    const conn = await db.getConnection();
    let lockAcquired = false;

    try {
        const [lockRows] = await conn.query(
            'SELECT GET_LOCK(?, ?) AS lockAcquired',
            [SCHEMA_BACKUP_LOCK_NAME, LOCK_TIMEOUT_SECONDS]
        );

        if (!lockRows || !lockRows[0] || lockRows[0].lockAcquired !== 1) {
            throw new Error(`Failed to acquire migration lock '${SCHEMA_BACKUP_LOCK_NAME}' within ${LOCK_TIMEOUT_SECONDS}s. Another backup or migration may be in progress.`);
        }
        lockAcquired = true;

        for (const file of files) {
            const filePath = path.join(migrationsDir, file);
            const sqlContent = fs.readFileSync(filePath, 'utf8');
            const statements = sqlContent.split(';').map(s => s.trim()).filter(s => s.length > 0);

            for (const stmt of statements) {
                await runSingleStatement(conn, stmt, file);
            }
        }

        console.log('[migrate] Database migrations execution completed.');
    } finally {
        if (lockAcquired) {
            try {
                await conn.query('SELECT RELEASE_LOCK(?)', [SCHEMA_BACKUP_LOCK_NAME]);
            } catch (releaseErr) {
                console.warn('[migrate] Warning: Error releasing advisory lock:', releaseErr.message);
            }
        }
        conn.release();
    }
}

module.exports = {
    runMigrations,
    runSingleStatement,
    SCHEMA_BACKUP_LOCK_NAME,
    LOCK_TIMEOUT_SECONDS
};
