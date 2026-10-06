/**
 * tests/test-key-reservation-workflow.js
 * Verification suite for Advance 2nd Key Reservations, conflict prevention,
 * Dept Head approval, early pickup buffer, and cancellation lifecycle.
 */

const assert = require('assert');
const db = require('../database/connection');
const keyAuthRepo = require('../repositories/key-authorization.repository');
const keyAuthService = require('../services/keyAuthorizationService');
const occupancyService = require('../services/iot/occupancy.service');

console.log('================================================================');
console.log('🧪 ADVANCE 2ND KEY RESERVATION & CONFLICT WORKFLOW TEST SUITE');
console.log('================================================================');

async function runTests() {
    try {
        // Fetch test rooms and users
        const [deptHeads] = await db.query("SELECT User_ID, Name, Role FROM users WHERE Role = 'IT Dept. Head' LIMIT 1");
        const [faculties] = await db.query("SELECT User_ID, Name, Role, ID_QR_String FROM users WHERE Role = 'Faculty' LIMIT 1");
        const [rooms] = await db.query("SELECT Room_ID, Room_Number FROM laboratories WHERE Room_Number IN ('203', '204') ORDER BY Room_Number ASC");

        assert.ok(deptHeads.length > 0, 'Must have at least 1 IT Dept Head');
        assert.ok(faculties.length > 0, 'Must have at least 1 Faculty member');
        assert.ok(rooms.length >= 2, 'Requires Room 203 and 204');

        const deptHead = deptHeads[0];
        const faculty1 = faculties[0];
        const targetRoom = rooms[0]; // 203
        const secondRoom = rooms[1]; // 204

        // Ensure Faculty 2 exists for conflict testing
        let [faculty2Rows] = await db.query("SELECT User_ID, Name, Role, ID_QR_String FROM users WHERE Email = 'test_faculty2@bulsu.edu.ph'");
        let faculty2;
        if (faculty2Rows.length === 0) {
            const [insertRes] = await db.query(
                `INSERT INTO users (Name, Email, Role, Status, Password, ID_QR_String)
                 VALUES ('Prof. Alan Turing', 'test_faculty2@bulsu.edu.ph', 'Faculty', 'ACTIVE', 'hashedpass', 'LABSYNC-USER-TEST-TURING')`
            );
            faculty2 = { User_ID: insertRes.insertId, Name: 'Prof. Alan Turing', Role: 'Faculty', ID_QR_String: 'LABSYNC-USER-TEST-TURING' };
        } else {
            faculty2 = faculty2Rows[0];
        }

        console.log(`Dept Head: ${deptHead.Name} (ID: ${deptHead.User_ID})`);
        console.log(`Faculty 1: ${faculty1.Name} (ID: ${faculty1.User_ID})`);
        console.log(`Faculty 2: ${faculty2.Name} (ID: ${faculty2.User_ID})`);
        console.log(`Target Lab: Room ${targetRoom.Room_Number} (ID: ${targetRoom.Room_ID})`);

        // Clean up previous test requests for these users
        await db.query("DELETE FROM key_authorization_requests WHERE User_ID IN (?, ?)", [faculty1.User_ID, faculty2.User_ID]);
        await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_ID IN (?, ?)", [targetRoom.Room_ID, secondRoom.Room_ID]);

        console.log('\n--- 1. Testing Reservation Date & Horizon Calculations ---');
        const maxDate = keyAuthService.getMaxAllowedReservationDate();
        const todayStr = keyAuthService.getTodayDateString();
        assert.ok(maxDate >= todayStr, 'Max date must be greater than or equal to today');
        console.log(`✔ PASS: Today is ${todayStr}. Max reservation horizon is ${maxDate}.`);

        console.log('\n--- 2. Sunday & Past Date Restriction Enforcement ---');
        // Find next Sunday
        const d = new Date();
        const daysToSunday = (7 - d.getDay()) % 7 || 7;
        const sunObj = new Date(d.getFullYear(), d.getMonth(), d.getDate() + daysToSunday);
        const sundayDate = `${sunObj.getFullYear()}-${String(sunObj.getMonth() + 1).padStart(2, '0')}-${String(sunObj.getDate()).padStart(2, '0')}`;

        const sunRes = await keyAuthService.requestAdditionalKey(
            faculty1.User_ID,
            'Faculty',
            faculty1.Name,
            targetRoom.Room_ID,
            'Sunday lab class test',
            sundayDate,
            '10:00',
            '12:00'
        );
        assert.strictEqual(sunRes.status, 400, 'Sunday requests must be rejected');
        assert.ok(sunRes.error.includes('Monday through Saturday'), 'Error must explain Monday-Saturday policy');
        console.log('✔ PASS: Sunday reservations correctly rejected.');

        console.log('\n--- 3. Submitting Valid Advance Reservation (Faculty 1) ---');
        // Pick valid upcoming class day (e.g. tomorrow or next Monday)
        const classOffset = d.getDay() === 6 ? 2 : 1;
        const classObj = new Date(d.getFullYear(), d.getMonth(), d.getDate() + classOffset);
        const classDate = `${classObj.getFullYear()}-${String(classObj.getMonth() + 1).padStart(2, '0')}-${String(classObj.getDate()).padStart(2, '0')}`;

        const validRes = await keyAuthService.requestAdditionalKey(
            faculty1.User_ID,
            'Faculty',
            faculty1.Name,
            targetRoom.Room_ID,
            'Special parallel examination session',
            classDate,
            '09:00',
            '11:00'
        );
        assert.strictEqual(validRes.status, 201, 'Valid reservation must be created');
        const requestId1 = validRes.data.requestId;
        assert.ok(requestId1 > 0, 'Must return valid request ID');
        console.log(`✔ PASS: Reservation submitted for Room ${targetRoom.Room_Number} on ${classDate} (09:00 - 11:00). ID: ${requestId1}`);

        console.log('\n--- 4. Conflict Prevention: Overlapping Reservation by Faculty 2 Blocked ---');
        // Faculty 2 tries to reserve the same room on the same day overlapping 10:00 - 12:00
        const conflictRes = await keyAuthService.requestAdditionalKey(
            faculty2.User_ID,
            'Faculty',
            faculty2.Name,
            targetRoom.Room_ID,
            'Overlapping workshop',
            classDate,
            '10:00',
            '12:00'
        );
        assert.strictEqual(conflictRes.status, 409, 'Overlapping reservation must be rejected with 409 Conflict');
        assert.ok(conflictRes.error.includes('already reserved'), 'Error must inform user of existing reservation');
        console.log('✔ PASS: Overlapping room reservation successfully prevented.');

        console.log('\n--- 5. Non-Overlapping Reservation by Faculty 2 Allowed ---');
        // Faculty 2 reserves the same room on the same day AFTER Faculty 1 (13:00 - 15:00)
        const nonConflictRes = await keyAuthService.requestAdditionalKey(
            faculty2.User_ID,
            'Faculty',
            faculty2.Name,
            targetRoom.Room_ID,
            'Afternoon robotics session',
            classDate,
            '13:00',
            '15:00'
        );
        assert.strictEqual(nonConflictRes.status, 201, 'Non-overlapping reservation must succeed');
        const requestId2 = nonConflictRes.data.requestId;
        console.log(`✔ PASS: Non-overlapping reservation permitted on the same date. ID: ${requestId2}`);

        console.log('\n--- 6. Dept Head Pending Queue Inspection ---');
        const deptHeadPending = await keyAuthService.getPendingRequestsForDeptHead(deptHead.User_ID, 'IT Dept. Head');
        assert.strictEqual(deptHeadPending.status, 200);
        const p1 = deptHeadPending.data.find(r => r.Request_ID === requestId1);
        assert.ok(p1, 'Dept Head must see Faculty 1 pending reservation');
        assert.strictEqual(p1.Start_Time.slice(0, 5), '09:00');
        assert.strictEqual(p1.End_Time.slice(0, 5), '11:00');
        console.log('✔ PASS: Dept Head sees reservation window details in review queue.');

        console.log('\n--- 7. Dept Head Approves Reservation ---');
        const approveRes = await keyAuthService.approveRequest(requestId1, deptHead.User_ID, 'IT Dept. Head');
        assert.strictEqual(approveRes.status, 200, 'Approval must succeed');
        assert.strictEqual(approveRes.data.status, 'APPROVED');
        console.log('✔ PASS: Dept Head approved reservation.');

        console.log('\n--- 8. Early Pickup Buffer Validation (IoT Key Box Simulation) ---');
        // Simulate Faculty 1 attempting to pick up key right now (when class is tomorrow)
        // Mark Faculty 1 as currently holding Room 2 key so they are requesting their 2nd key
        await db.query("UPDATE laboratories SET Key_Status = 'Absent', Current_User_ID = ? WHERE Room_ID = ?", [faculty1.User_ID, secondRoom.Room_ID]);

        const scanEarlyResult = await occupancyService.logOccupancy({
            roomNumber: targetRoom.Room_Number,
            qrString: faculty1.ID_QR_String,
            authMethod: 'QR Code'
        });
        assert.strictEqual(scanEarlyResult.status, 403, 'Premature pickup must be rejected');
        assert.ok(scanEarlyResult.error && (scanEarlyResult.error.includes('Key pickup opens 15 minutes before class') || scanEarlyResult.error.includes('scheduled for')),
            'Rejection message must inform user when their pickup window opens');
        console.log('✔ PASS: IoT Key Box prevents premature key claim with informative scheduling notice.');

        console.log('\n--- 9. Active Pickup Window Simulation ---');
        // Update reservation to today with start time = now - 5 mins, end time = now + 60 mins
        const now = new Date();
        const startH = String(now.getHours()).padStart(2, '0');
        const startM = String(Math.max(0, now.getMinutes() - 5)).padStart(2, '0');
        const endH = '23';
        const endM = '59';

        await db.query(
            `UPDATE key_authorization_requests
             SET Reservation_Date = CURDATE(), Start_Time = ?, End_Time = ?
             WHERE Request_ID = ?`,
            [`${startH}:${startM}:00`, `${endH}:${endM}:00`, requestId1]
        );

        const scanActiveResult = await occupancyService.logOccupancy({
            roomNumber: targetRoom.Room_Number,
            qrString: faculty1.ID_QR_String,
            authMethod: 'QR Code'
        });
        assert.strictEqual(scanActiveResult.status, 200, 'Pickup within active window must succeed');
        console.log('✔ PASS: IoT Key Box approved QR scan during active reservation window.');

        // Simulate key taken hardware sensor event
        await occupancyService.logOccupancy({
            roomNumber: targetRoom.Room_Number,
            keyEvent: 'Key Taken'
        });
        const [claimedReq] = await keyAuthRepo.findById(requestId1);
        assert.strictEqual(claimedReq[0].Status, 'CLAIMED', 'Key withdrawal must transition request to CLAIMED');
        console.log('✔ PASS: Physical key withdrawal updated status to CLAIMED.');

        console.log('\n--- 10. Key Return Lifecycle Completion ---');
        await occupancyService.logOccupancy({
            roomNumber: targetRoom.Room_Number,
            keyEvent: 'Key Returned'
        });
        const [completedReq] = await keyAuthRepo.findById(requestId1);
        assert.strictEqual(completedReq[0].Status, 'COMPLETED', 'Key return must transition request to COMPLETED');
        console.log('✔ PASS: Key return marked reservation as COMPLETED.');

        console.log('\n--- 11. Faculty Cancellation Flow ---');
        const cancelRes = await keyAuthService.cancelRequest(requestId2, faculty2.User_ID, 'Faculty');
        assert.strictEqual(cancelRes.status, 200, 'Faculty cancellation must succeed');
        const [cancelledReq] = await keyAuthRepo.findById(requestId2);
        assert.strictEqual(cancelledReq[0].Status, 'EXPIRED', 'Cancelled request must be marked EXPIRED');
        console.log('✔ PASS: Reservation cancelled and room slot released.');

        // Cleanup test keys and mock user
        await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_ID IN (?, ?)", [targetRoom.Room_ID, secondRoom.Room_ID]);
        await db.query("DELETE FROM key_authorization_requests WHERE User_ID IN (?, ?)", [faculty1.User_ID, faculty2.User_ID]);
        await db.query("DELETE FROM users WHERE Email = 'test_faculty2@bulsu.edu.ph'");

        console.log('\n================================================================');
        console.log('🎉 ALL 11 ADVANCE RESERVATION & CONFLICT TESTS PASSED 100%!');
        console.log('================================================================\n');

    } catch (e) {
        console.error('❌ Test failed with error:', e);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

runTests();
