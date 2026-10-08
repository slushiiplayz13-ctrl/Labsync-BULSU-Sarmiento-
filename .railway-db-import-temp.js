const fs = require('fs');
const readline = require('readline');
const mysql = require('mysql2/promise');

async function main() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const password = await new Promise(resolve => {
        rl.question('Enter Railway tunnel password: ', resolve);
    });

    rl.close();

    const sql = fs.readFileSync(
        'C:/Users/andre/Downloads/labsync-local-backup.sql',
        'utf8'
    );

    console.log(`Importing SQL dump (${sql.length.toLocaleString()} characters)...`);

    const connection = await mysql.createConnection({
        host: '127.0.0.1',
        port: 49712,
        user: 'root',
        password,
        database: 'railway',
        multipleStatements: true
    });

    try {
        await connection.query(sql);
        console.log('✅ Railway database import completed successfully.');
    } finally {
        await connection.end();
    }
}

main().catch(err => {
    console.error('❌ Import failed:', err.message);
    process.exit(1);
});
