'use strict';

const assert = require('assert');
const {
    renderKeyAuthorizationRequestEmail,
    renderKeyAuthorizationOutcomeEmail
} = require('../services/email/templates/key-authorization');
const emailService = require('../services/email/email.service');

async function runEmailTests() {
    console.log('================================================================');
    console.log('🧪 TESTING KEY AUTHORIZATION EMAIL TEMPLATES & DISPATCH PIPELINE');
    console.log('================================================================\n');

    // 1. Render Department Head Request Email
    console.log('--- 1. Testing Dept. Head Request Email Template ---');
    const reqEmail = renderKeyAuthorizationRequestEmail('Andrei Gabito', {
        requesterName: 'Santi Jay Esplana',
        requesterRole: 'Faculty',
        requestedRoom: '204',
        heldRooms: 'Room 203',
        reason: 'Simultaneous dual-room practical examination',
        reviewLink: 'http://localhost:3000/it-head-dashboard.html',
        requestedAt: '05:15 PM'
    });

    assert.ok(reqEmail.subject.includes('[LabSync Urgent] 2nd Key Request'), 'Subject must have urgent flag');
    assert.ok(reqEmail.subject.includes('Santi Jay Esplana'), 'Subject must name requester');
    assert.ok(reqEmail.subject.includes('Room 204'), 'Subject must name requested room');
    assert.ok(reqEmail.html.includes('Andrei Gabito'), 'Body must greet Dept Head');
    assert.ok(reqEmail.html.includes('Room 203'), 'Body must show currently held room');
    assert.ok(reqEmail.html.includes('Room 204'), 'Body must show requested room');
    assert.ok(reqEmail.html.includes('Simultaneous dual-room practical examination'), 'Body must show reason');
    assert.ok(reqEmail.html.includes('Review &amp; Authorize in LabSync') || reqEmail.html.includes('Review & Authorize in LabSync'), 'Body must contain CTA button');
    console.log('✔ PASS: Dept. Head request email rendered with full context and high-priority branding.');

    // 2. Render Faculty Approval Outcome Email
    console.log('\n--- 2. Testing Faculty Approval Outcome Email Template ---');
    const approvedEmail = renderKeyAuthorizationOutcomeEmail('Santi Jay Esplana', {
        status: 'APPROVED',
        roomNumber: '204',
        approverName: 'Andrei Gabito',
        durationMinutes: 120,
        actionLink: 'http://localhost:3000/room-status.html'
    });

    assert.ok(approvedEmail.subject.includes('[LabSync Approved]'), 'Subject must have approved tag');
    assert.ok(approvedEmail.subject.includes('Room 204'), 'Subject must mention Room 204');
    assert.ok(approvedEmail.html.includes('Santi Jay Esplana'), 'Body must greet faculty member');
    assert.ok(approvedEmail.html.includes('Andrei Gabito'), 'Body must name approver');
    assert.ok(approvedEmail.html.includes('120 minutes'), 'Body must mention duration');
    assert.ok(approvedEmail.html.includes('View Key &amp; Room Status') || approvedEmail.html.includes('View Key & Room Status'), 'Body must have action CTA');
    console.log('✔ PASS: Faculty approval outcome email rendered with green badge and duration.');

    // 3. Render Faculty Rejection Outcome Email
    console.log('\n--- 3. Testing Faculty Rejection Outcome Email Template ---');
    const rejReason = 'Room 204 is reserved for maintenance inspection';
    const rejectedEmail = renderKeyAuthorizationOutcomeEmail('Santi Jay Esplana', {
        status: 'REJECTED',
        roomNumber: '204',
        approverName: 'Andrei Gabito',
        rejectionReason: rejReason,
        actionLink: 'http://localhost:3000/index.html'
    });

    assert.ok(rejectedEmail.subject.includes('[LabSync Notice]'), 'Subject must have notice tag');
    assert.ok(rejectedEmail.html.includes('Declined for Room 204'), 'Body must state declined');
    assert.ok(rejectedEmail.html.includes(rejReason), 'Body must state specific rejection reason');
    console.log('✔ PASS: Faculty rejection outcome email rendered with clear reason.');

    // 4. Verify emailService exports
    console.log('\n--- 4. Testing emailService function exports ---');
    assert.strictEqual(typeof emailService.sendKeyAuthorizationEmail, 'function', 'sendKeyAuthorizationEmail must be exported');
    assert.strictEqual(typeof emailService.sendKeyAuthorizationOutcomeEmail, 'function', 'sendKeyAuthorizationOutcomeEmail must be exported');
    console.log('✔ PASS: emailService methods are properly exported.');

    console.log('\n================================================================');
    console.log('🎉 ALL KEY AUTHORIZATION EMAIL TESTS PASSED 100%!');
    console.log('================================================================');
}

runEmailTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
