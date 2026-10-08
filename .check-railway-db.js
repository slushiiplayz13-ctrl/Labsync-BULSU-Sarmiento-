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
        port: 49712,
        user: 'root',
        password,
        database: 'railway'
    });

    try {
        const [tables] = await db.query('SHOW TABLES');
        console.log('\n=== TABLES CURRENTLY IN RAILWAY ===');
        console.table(tables);

        const [status] = await db.query('SHOW ENGINE INNODB STATUS');
        console.log('\n=== LATEST INNODB STATUS / FOREIGN KEY ERROR ===');
        console.log(status[0]?.Status || 'No InnoDB status returned');
    } finally {
        await db.end();
    }
}

main().catch(err => {
    console.error('\n❌ Check failed:', err.message);
    process.exit(1);
});
