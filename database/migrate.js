'use strict';

const fs = require('fs');
const path = require('path');
const db = require('./connection');

const IGNORABLE_ERROR_CODES = [
    'ER_DUP_FIELDNAME',          // Duplicate column name
    'ER_CANT_DROP_FIELD_OR_KEY', // Can't drop field/key (doesn't exist)
    'ER_DUP_KEYNAME',            // Duplicate key/index name
    1060,                        // Duplicate column name
    1061,                        // Duplicate key name
    1091                         // Can't drop field/key
];

async function runSingleStatement(statement, filename) {
    const cleanSql = statement.trim();
    if (!cleanSql) return;

    try {
        await db.query(cleanSql);
    } catch (err) {
        if (IGNORABLE_ERROR_CODES.includes(err.code) || IGNORABLE_ERROR_CODES.includes(err.errno)) {
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

    for (const file of files) {
        const filePath = path.join(migrationsDir, file);
        const sqlContent = fs.readFileSync(filePath, 'utf8');
        const statements = sqlContent.split(';').map(s => s.trim()).filter(s => s.length > 0);

        for (const stmt of statements) {
            await runSingleStatement(stmt, file);
        }
    }

    console.log('[migrate] Database migrations execution completed.');
}

module.exports = { runMigrations };
