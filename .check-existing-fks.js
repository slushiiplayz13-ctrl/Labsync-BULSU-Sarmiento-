const readline = require('readline');
const mysql = require('mysql2/promise');

async function main() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const password = await new Promise(resolve => {
        rl.question('Enter Railway tunnel password: ', answer => {
            rl.close();
            resolve(answer);
        });
    });

    const db = await mysql.createConnection({
        host: '127.0.0.1',
        port: 49701,
        user: 'root',
        password,
        database: 'railway'
    });

    const [rows] = await db.query(`
        SELECT
            CONSTRAINT_NAME,
            TABLE_NAME,
            COLUMN_NAME,
            REFERENCED_TABLE_NAME,
            REFERENCED_COLUMN_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE CONSTRAINT_SCHEMA = 'railway'
          AND REFERENCED_TABLE_NAME IS NOT NULL
        ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION
    `);

    console.log('\n=== FOREIGN KEYS CURRENTLY IN RAILWAY ===\n');
    console.table(rows);

    console.log(`\nTotal foreign-key columns found: ${rows.length}`);

    await db.end();
}

main().catch(err => {
    console.error('\n❌ Check failed:', err.message);
    process.exit(1);
});
