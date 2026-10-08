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

    const tests = [
        {
            name: 'Followed_Up_By_User_ID -> users.User_ID',
            sql: `
                ALTER TABLE \`__fk_test_maintenance_issues\`
                ADD CONSTRAINT \`test_fk_followed_up_by\`
                FOREIGN KEY (\`Followed_Up_By_User_ID\`)
                REFERENCES \`users\` (\`User_ID\`)
                ON DELETE SET NULL
            `
        },
        {
            name: 'Resolved_By_User_ID -> users.User_ID',
            sql: `
                ALTER TABLE \`__fk_test_maintenance_issues\`
                ADD CONSTRAINT \`test_fk_resolved_by\`
                FOREIGN KEY (\`Resolved_By_User_ID\`)
                REFERENCES \`users\` (\`User_ID\`)
                ON DELETE SET NULL
            `
        },
        {
            name: 'PC_ID -> lab_units.PC_ID',
            sql: `
                ALTER TABLE \`__fk_test_maintenance_issues\`
                ADD CONSTRAINT \`test_fk_pc\`
                FOREIGN KEY (\`PC_ID\`)
                REFERENCES \`lab_units\` (\`PC_ID\`)
                ON DELETE CASCADE
            `
        }
    ];

    try {
        for (const test of tests) {
            await db.query('DROP TABLE IF EXISTS `__fk_test_maintenance_issues`');

            await db.query(`
                CREATE TABLE \`__fk_test_maintenance_issues\`
                LIKE \`maintenance_issues\`
            `);

            try {
                await db.query(test.sql);
                console.log(`✅ PASS: ${test.name}`);
            } catch (err) {
                console.log(`❌ FAIL: ${test.name}`);
                console.log(`   Code: ${err.code}`);
                console.log(`   Errno: ${err.errno}`);
                console.log(`   Message: ${err.message}`);
            }
        }

        await db.query('DROP TABLE IF EXISTS `__fk_test_maintenance_issues`');

        console.log('\n=== COLUMN DEFINITIONS ===\n');

        const [rows] = await db.query(`
            SELECT
                TABLE_NAME,
                COLUMN_NAME,
                COLUMN_TYPE,
                IS_NULLABLE,
                COLUMN_KEY,
                EXTRA
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = 'railway'
              AND (
                    (TABLE_NAME = 'maintenance_issues'
                     AND COLUMN_NAME IN ('PC_ID', 'Resolved_By_User_ID', 'Followed_Up_By_User_ID'))
                 OR (TABLE_NAME = 'users'
                     AND COLUMN_NAME = 'User_ID')
                 OR (TABLE_NAME = 'lab_units'
                     AND COLUMN_NAME = 'PC_ID')
              )
            ORDER BY TABLE_NAME, COLUMN_NAME
        `);

        console.table(rows);

        await db.end();
    } catch (err) {
        console.error('\n❌ Diagnostic failed:', err.message);
        try {
            await db.end();
        } catch (_) {}
        process.exit(1);
    }
}

main();
