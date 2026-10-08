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

    try {
        for (const table of ['lab_units', 'maintenance_issues']) {
            const [rows] = await db.query(`SHOW CREATE TABLE \`${table}\``);

            console.log(`\n=== ${table} ===\n`);
            console.log(rows[0]['Create Table']);
        }

        const [engines] = await db.query(`
            SELECT TABLE_NAME, ENGINE, TABLE_COLLATION
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = 'railway'
              AND TABLE_NAME IN ('lab_units', 'maintenance_issues')
        `);

        console.log('\n=== TABLE ENGINES ===\n');
        console.table(engines);

    } finally {
        await db.end();
    }
}

main().catch(err => {
    console.error('\n❌ Check failed:', err.message);
    process.exit(1);
});
