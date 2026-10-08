const readline = require('readline');
const mysql = require('mysql2/promise');

const checks = [
    ["key_authorization_requests", "key_authorization_requests_ibfk_1", "User_ID", "users", "User_ID"],
    ["key_authorization_requests", "key_authorization_requests_ibfk_2", "Room_ID", "laboratories", "Room_ID"],
    ["key_authorization_requests", "key_authorization_requests_ibfk_3", "Approved_By", "users", "User_ID"],
    ["key_found_reports", "fk_key_found_reports_key", "Key_ID", "laboratory_keys", "Key_ID"],
    ["laboratory_keys", "fk_lab_keys_room", "Room_ID", "laboratories", "Room_ID"],
    ["lab_units", "lab_units_ibfk_1", "Room_ID", "laboratories", "Room_ID"],
    ["maintenance", "maintenance_ibfk_1", "PC_ID", "lab_units", "PC_ID"],
    ["maintenance", "maintenance_ibfk_2", "User_ID", "users", "User_ID"],
    ["maintenance_issues", "maintenance_issues_ibfk_1", "PC_ID", "lab_units", "PC_ID"],
    ["maintenance_issues", "fk_maintenance_issues_resolved_by", "Resolved_By_User_ID", "users", "User_ID"],
    ["maintenance_issues", "fk_maintenance_issues_followed_up_by", "Followed_Up_By_User_ID", "users", "User_ID"],
    ["occupancy_log", "occupancy_log_ibfk_1", "User_ID", "users", "User_ID"],
    ["occupancy_log", "occupancy_log_ibfk_2", "Room_ID", "laboratories", "Room_ID"],
    ["schedules", "schedules_ibfk_1", "User_ID", "users", "User_ID"],
    ["schedules", "schedules_ibfk_2", "Room_ID", "laboratories", "Room_ID"],
    ["schedule_drafts", "schedule_drafts_ibfk_1", "Room_ID", "laboratories", "Room_ID"],
    ["schedule_drafts", "schedule_drafts_ibfk_2", "User_ID", "users", "User_ID"],
    ["schedule_key_reminders", "fk_skr_recipient", "Recipient_User_ID", "users", "User_ID"],
    ["schedule_key_reminders", "fk_skr_room", "Room_ID", "laboratories", "Room_ID"],
    ["schedule_key_reminders", "fk_skr_schedule", "Schedule_ID", "schedules", "Schedule_ID"],
    ["schedule_metadata", "schedule_metadata_ibfk_1", "Room_ID", "laboratories", "Room_ID"],
    ["schedule_metadata", "schedule_metadata_ibfk_2", "Finalized_By", "users", "User_ID"],
    ["schedule_metadata", "schedule_metadata_ibfk_3", "Updated_By", "users", "User_ID"]
];

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

    console.log('\n=== FOREIGN KEY SCHEMA COMPATIBILITY TEST ===\n');

    for (const [child, constraint, childCol, parent, parentCol] of checks) {
        const temp = `__fkcheck_${child}_${childCol}`;

        try {
            await db.query(`DROP TABLE IF EXISTS \`${temp}\``);

            // CREATE TABLE ... LIKE copies the table structure/indexes
            // but gives us a temporary table for a safe FK test.
            await db.query(
                `CREATE TABLE \`${temp}\` LIKE \`${child}\``
            );

            await db.query(`
                ALTER TABLE \`${temp}\`
                ADD CONSTRAINT \`${constraint}_TEST\`
                FOREIGN KEY (\`${childCol}\`)
                REFERENCES \`${parent}\` (\`${parentCol}\`)
            `);

            console.log(`✅ ${child}.${childCol} -> ${parent}.${parentCol}`);

            await db.query(`DROP TABLE \`${temp}\``);
        } catch (err) {
            console.log(`❌ ${child}.${childCol} -> ${parent}.${parentCol}`);
            console.log(`   Error: ${err.message}`);

            try {
                await db.query(`DROP TABLE IF EXISTS \`${temp}\``);
            } catch (_) {}
        }
    }

    await db.end();

    console.log('\n=== COMPLETE ===');
}

main().catch(err => {
    console.error('\n❌ Diagnostic failed:', err.message);
    process.exit(1);
});
