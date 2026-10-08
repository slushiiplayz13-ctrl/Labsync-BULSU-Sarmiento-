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

    async function clean() {
        await db.query('DROP TABLE IF EXISTS `__fk_child_test`');
    }

    try {
        console.log('\n=== TEST A: Minimal child -> lab_units.PC_ID ===');

        await clean();

        await db.query(`
            CREATE TABLE \`__fk_child_test\` (
                \`PC_ID\` INT NOT NULL,
                INDEX \`idx_pc\` (\`PC_ID\`),
                CONSTRAINT \`test_child_pc_fk\`
                    FOREIGN KEY (\`PC_ID\`)
                    REFERENCES \`lab_units\` (\`PC_ID\`)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB
        `);

        console.log('✅ TEST A PASSED');

        await clean();

        console.log('\n=== TEST B: Minimal child WITHOUT index declared manually ===');

        await db.query(`
            CREATE TABLE \`__fk_child_test\` (
                \`PC_ID\` INT NOT NULL
            ) ENGINE=InnoDB
        `);

        try {
            await db.query(`
                ALTER TABLE \`__fk_child_test\`
                ADD CONSTRAINT \`test_child_pc_fk_2\`
                    FOREIGN KEY (\`PC_ID\`)
                    REFERENCES \`lab_units\` (\`PC_ID\`)
                    ON DELETE CASCADE
            `);

            console.log('✅ TEST B PASSED');
        } catch (err) {
            console.log('❌ TEST B FAILED');
            console.log('Code:', err.code);
            console.log('Errno:', err.errno);
            console.log('Message:', err.message);
        }

        await clean();

        console.log('\n=== TEST C: Minimal clone of maintenance_issues WITHOUT generated/index complexity ===');

        await db.query(`
            CREATE TABLE \`__fk_child_test\` (
                \`Issue_ID\` INT NOT NULL AUTO_INCREMENT,
                \`PC_ID\` INT NOT NULL,
                \`Issue_Type\` VARCHAR(50) NOT NULL,
                PRIMARY KEY (\`Issue_ID\`),
                KEY \`idx_pc\` (\`PC_ID\`)
            ) ENGINE=InnoDB
        `);

        try {
            await db.query(`
                ALTER TABLE \`__fk_child_test\`
                ADD CONSTRAINT \`test_child_pc_fk_3\`
                    FOREIGN KEY (\`PC_ID\`)
                    REFERENCES \`lab_units\` (\`PC_ID\`)
                    ON DELETE CASCADE
            `);

            console.log('✅ TEST C PASSED');
        } catch (err) {
            console.log('❌ TEST C FAILED');
            console.log('Code:', err.code);
            console.log('Errno:', err.errno);
            console.log('Message:', err.message);
        }

        await clean();

        console.log('\n=== MYSQL VERSION ===');
        const [versionRows] = await db.query('SELECT VERSION() AS version');
        console.table(versionRows);

    } finally {
        await clean();
        await db.end();
    }
}

main().catch(err => {
    console.error('\n❌ Diagnostic failed:', err.message);
    process.exit(1);
});
