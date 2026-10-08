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
        database: 'railway',
        multipleStatements: true
    });

    try {
        await db.query('DROP TABLE IF EXISTS `__maintenance_issues_fk_test`');

        await db.query(`
            CREATE TABLE \`__maintenance_issues_fk_test\`
            LIKE \`maintenance_issues\`
        `);

        try {
            await db.query(`
                ALTER TABLE \`__maintenance_issues_fk_test\`
                  ADD CONSTRAINT \`fk_test_followed_up_by\`
                    FOREIGN KEY (\`Followed_Up_By_User_ID\`)
                    REFERENCES \`users\` (\`User_ID\`)
                    ON DELETE SET NULL,
                  ADD CONSTRAINT \`fk_test_resolved_by\`
                    FOREIGN KEY (\`Resolved_By_User_ID\`)
                    REFERENCES \`users\` (\`User_ID\`)
                    ON DELETE SET NULL,
                  ADD CONSTRAINT \`fk_test_pc\`
                    FOREIGN KEY (\`PC_ID\`)
                    REFERENCES \`lab_units\` (\`PC_ID\`)
                    ON DELETE CASCADE
            `);

            console.log('✅ Exact 3-FK maintenance_issues block succeeded on temporary clone.');
        } catch (err) {
            console.log('\n❌ Exact 3-FK block FAILED');
            console.log('Error code:', err.code);
            console.log('Error errno:', err.errno);
            console.log('Error message:', err.message);

            try {
                const [warnings] = await db.query('SHOW WARNINGS');
                console.log('\n=== MYSQL WARNINGS ===');
                console.table(warnings);
            } catch (warningErr) {
                console.log('Could not retrieve SHOW WARNINGS:', warningErr.message);
            }
        }

        await db.query('DROP TABLE IF EXISTS `__maintenance_issues_fk_test`');
    } finally {
        await db.end();
    }
}

main().catch(err => {
    console.error('\n❌ Diagnostic failed:', err.message);
    process.exit(1);
});
