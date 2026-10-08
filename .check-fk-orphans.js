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

    const checks = [
        ["key_authorization_requests.User_ID -> users.User_ID",
            "SELECT COUNT(*) AS c FROM key_authorization_requests k LEFT JOIN users u ON k.User_ID=u.User_ID WHERE k.User_ID IS NOT NULL AND u.User_ID IS NULL"],
        ["key_authorization_requests.Room_ID -> laboratories.Room_ID",
            "SELECT COUNT(*) AS c FROM key_authorization_requests k LEFT JOIN laboratories l ON k.Room_ID=l.Room_ID WHERE k.Room_ID IS NOT NULL AND l.Room_ID IS NULL"],
        ["key_authorization_requests.Approved_By -> users.User_ID",
            "SELECT COUNT(*) AS c FROM key_authorization_requests k LEFT JOIN users u ON k.Approved_By=u.User_ID WHERE k.Approved_By IS NOT NULL AND u.User_ID IS NULL"],
        ["key_found_reports.Key_ID -> laboratory_keys.Key_ID",
            "SELECT COUNT(*) AS c FROM key_found_reports k LEFT JOIN laboratory_keys l ON k.Key_ID=l.Key_ID WHERE k.Key_ID IS NOT NULL AND l.Key_ID IS NULL"],
        ["laboratory_keys.Room_ID -> laboratories.Room_ID",
            "SELECT COUNT(*) AS c FROM laboratory_keys k LEFT JOIN laboratories l ON k.Room_ID=l.Room_ID WHERE k.Room_ID IS NOT NULL AND l.Room_ID IS NULL"],
        ["lab_units.Room_ID -> laboratories.Room_ID",
            "SELECT COUNT(*) AS c FROM lab_units u LEFT JOIN laboratories l ON u.Room_ID=l.Room_ID WHERE u.Room_ID IS NOT NULL AND l.Room_ID IS NULL"],
        ["maintenance.PC_ID -> lab_units.PC_ID",
            "SELECT COUNT(*) AS c FROM maintenance m LEFT JOIN lab_units p ON m.PC_ID=p.PC_ID WHERE m.PC_ID IS NOT NULL AND p.PC_ID IS NULL"],
        ["maintenance.User_ID -> users.User_ID",
            "SELECT COUNT(*) AS c FROM maintenance m LEFT JOIN users u ON m.User_ID=u.User_ID WHERE m.User_ID IS NOT NULL AND u.User_ID IS NULL"],
        ["maintenance_issues.PC_ID -> lab_units.PC_ID",
            "SELECT COUNT(*) AS c FROM maintenance_issues m LEFT JOIN lab_units p ON m.PC_ID=p.PC_ID WHERE m.PC_ID IS NOT NULL AND p.PC_ID IS NULL"],
        ["maintenance_issues.Resolved_By_User_ID -> users.User_ID",
            "SELECT COUNT(*) AS c FROM maintenance_issues m LEFT JOIN users u ON m.Resolved_By_User_ID=u.User_ID WHERE m.Resolved_By_User_ID IS NOT NULL AND u.User_ID IS NULL"],
        ["maintenance_issues.Followed_Up_By_User_ID -> users.User_ID",
            "SELECT COUNT(*) AS c FROM maintenance_issues m LEFT JOIN users u ON m.Followed_Up_By_User_ID=u.User_ID WHERE m.Followed_Up_By_User_ID IS NOT NULL AND u.User_ID IS NULL"],
        ["occupancy_log.User_ID -> users.User_ID",
            "SELECT COUNT(*) AS c FROM occupancy_log o LEFT JOIN users u ON o.User_ID=u.User_ID WHERE o.User_ID IS NOT NULL AND u.User_ID IS NULL"],
        ["occupancy_log.Room_ID -> laboratories.Room_ID",
            "SELECT COUNT(*) AS c FROM occupancy_log o LEFT JOIN laboratories l ON o.Room_ID=l.Room_ID WHERE o.Room_ID IS NOT NULL AND l.Room_ID IS NULL"],
        ["schedules.User_ID -> users.User_ID",
            "SELECT COUNT(*) AS c FROM schedules s LEFT JOIN users u ON s.User_ID=u.User_ID WHERE s.User_ID IS NOT NULL AND u.User_ID IS NULL"],
        ["schedules.Room_ID -> laboratories.Room_ID",
            "SELECT COUNT(*) AS c FROM schedules s LEFT JOIN laboratories l ON s.Room_ID=l.Room_ID WHERE s.Room_ID IS NOT NULL AND l.Room_ID IS NULL"],
        ["schedule_drafts.Room_ID -> laboratories.Room_ID",
            "SELECT COUNT(*) AS c FROM schedule_drafts s LEFT JOIN laboratories l ON s.Room_ID=l.Room_ID WHERE s.Room_ID IS NOT NULL AND l.Room_ID IS NULL"],
        ["schedule_drafts.User_ID -> users.User_ID",
            "SELECT COUNT(*) AS c FROM schedule_drafts s LEFT JOIN users u ON s.User_ID=u.User_ID WHERE s.User_ID IS NOT NULL AND u.User_ID IS NULL"],
        ["schedule_key_reminders.Recipient_User_ID -> users.User_ID",
            "SELECT COUNT(*) AS c FROM schedule_key_reminders s LEFT JOIN users u ON s.Recipient_User_ID=u.User_ID WHERE s.Recipient_User_ID IS NOT NULL AND u.User_ID IS NULL"],
        ["schedule_key_reminders.Room_ID -> laboratories.Room_ID",
            "SELECT COUNT(*) AS c FROM schedule_key_reminders s LEFT JOIN laboratories l ON s.Room_ID=l.Room_ID WHERE s.Room_ID IS NOT NULL AND l.Room_ID IS NULL"],
        ["schedule_key_reminders.Schedule_ID -> schedules.Schedule_ID",
            "SELECT COUNT(*) AS c FROM schedule_key_reminders s LEFT JOIN schedules x ON s.Schedule_ID=x.Schedule_ID WHERE s.Schedule_ID IS NOT NULL AND x.Schedule_ID IS NULL"],
        ["schedule_metadata.Room_ID -> laboratories.Room_ID",
            "SELECT COUNT(*) AS c FROM schedule_metadata s LEFT JOIN laboratories l ON s.Room_ID=l.Room_ID WHERE s.Room_ID IS NOT NULL AND l.Room_ID IS NULL"],
        ["schedule_metadata.Finalized_By -> users.User_ID",
            "SELECT COUNT(*) AS c FROM schedule_metadata s LEFT JOIN users u ON s.Finalized_By=u.User_ID WHERE s.Finalized_By IS NOT NULL AND u.User_ID IS NULL"],
        ["schedule_metadata.Updated_By -> users.User_ID",
            "SELECT COUNT(*) AS c FROM schedule_metadata s LEFT JOIN users u ON s.Updated_By=u.User_ID WHERE s.Updated_By IS NOT NULL AND u.User_ID IS NULL"]
    ];

    console.log('\n=== FOREIGN KEY ORPHAN CHECK ===\n');

    for (const [label, sql] of checks) {
        const [rows] = await db.query(sql);
        const count = rows[0].c;
        console.log(`${count === 0 ? '✅' : '❌'} ${label}: ${count} orphan(s)`);
    }

    await db.end();
}

main().catch(err => {
    console.error('\n❌ Check failed:', err.message);
    process.exit(1);
});
