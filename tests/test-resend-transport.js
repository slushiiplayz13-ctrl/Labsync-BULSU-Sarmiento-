'use strict';

/**
 * tests/test-resend-transport.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Focused unit test suite for the Resend HTTPS API email transport layer.
 * Verifies exports, configuration fallback, missing API key rejection,
 * payload structure, error mapping, and contract compatibility with email.service.js.
 *
 * NOTE: All network dispatch is mocked in this test — ZERO live email requests.
 */

const assert = require('assert');

async function runResendTransportTests() {
    console.log('================================================================');
    console.log('🧪 TESTING RESEND HTTPS API TRANSPORT & SERVICE INTEGRATION');
    console.log('================================================================\n');

    const emailTransport = require('../services/email/email.transport');
    const emailService = require('../services/email/email.service');

    // 1. Module Exports Verification
    console.log('--- 1. Testing email.transport.js Function Exports ---');
    assert.strictEqual(typeof emailTransport.getSenderAddress, 'function', 'getSenderAddress must be exported');
    assert.strictEqual(typeof emailTransport.sendMailWithTimeout, 'function', 'sendMailWithTimeout must be exported');
    assert.strictEqual(typeof emailTransport.getTransporter, 'function', 'getTransporter must be exported');
    assert.strictEqual(typeof emailTransport.getResendClient, 'function', 'getResendClient must be exported');
    console.log('✔ PASS: All required transport methods are properly exported.');

    // 2. Sender Address Resolution
    console.log('\n--- 2. Testing Sender Address (EMAIL_FROM) Resolution ---');
    const originalEmailFrom = process.env.EMAIL_FROM;

    delete process.env.EMAIL_FROM;
    assert.strictEqual(
        emailTransport.getSenderAddress(),
        'LabSync <onboarding@resend.dev>',
        'Default sender must fall back to Resend sandbox address'
    );

    process.env.EMAIL_FROM = '"LabSync Official" <notifications@labsync.edu.ph>';
    assert.strictEqual(
        emailTransport.getSenderAddress(),
        '"LabSync Official" <notifications@labsync.edu.ph>',
        'Custom EMAIL_FROM must be respected'
    );

    if (originalEmailFrom !== undefined) {
        process.env.EMAIL_FROM = originalEmailFrom;
    } else {
        delete process.env.EMAIL_FROM;
    }
    console.log('✔ PASS: getSenderAddress correctly prioritizes EMAIL_FROM with safe Resend fallback.');

    // 3. Missing RESEND_API_KEY Handling
    console.log('\n--- 3. Testing Missing RESEND_API_KEY Rejection ---');
    const originalApiKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;

    let threwMissingKey = false;
    try {
        await emailTransport.sendMailWithTimeout({
            to: 'test@example.com',
            subject: 'Test Subject',
            html: '<p>Test</p>'
        });
    } catch (err) {
        threwMissingKey = true;
        assert.strictEqual(err.code, 'MISSING_RESEND_API_KEY', 'Must reject with MISSING_RESEND_API_KEY error code');
    }
    assert.ok(threwMissingKey, 'sendMailWithTimeout must reject when RESEND_API_KEY is not set');
    console.log('✔ PASS: Missing RESEND_API_KEY fails fast without hanging.');

    // 4. Mocked Resend Client Behavior (Success & Error Handling)
    console.log('\n--- 4. Testing Mocked Resend Client Send & Error Mapping ---');
    process.env.RESEND_API_KEY = 're_test_mock_key_1234567890';

    const client = emailTransport.getResendClient();
    assert.ok(client, 'Resend client must be instantiated when RESEND_API_KEY is present');

    // Save original emails.send
    const originalSend = client.emails.send;

    // Test 4A: Successful dispatch
    client.emails.send = async function mockSuccessSend(payload) {
        assert.ok(payload.to.includes('recipient@example.com'), 'Recipient must be passed in array');
        assert.strictEqual(payload.subject, 'Welcome to LabSync');
        assert.ok(payload.html.includes('Your credentials'), 'HTML body must be preserved');
        return {
            data: { id: 'msg_mock_success_789' },
            error: null
        };
    };

    const successResult = await emailTransport.sendMailWithTimeout({
        to: 'recipient@example.com',
        subject: 'Welcome to LabSync',
        html: '<p>Your credentials</p>'
    });

    assert.strictEqual(successResult.id, 'msg_mock_success_789');
    assert.strictEqual(successResult.messageId, 'msg_mock_success_789');
    console.log('✔ PASS: Successful Resend response returns standardized id & messageId.');

    // Test 4B: Resend API Error (e.g. Unverified Domain or Rate Limit)
    client.emails.send = async function mockErrorSend() {
        return {
            data: null,
            error: {
                name: 'validation_error',
                message: 'Domain not verified. You can only send to your own email address while using the onboarding domain.',
                statusCode: 403
            }
        };
    };

    let caughtApiError = null;
    try {
        await emailTransport.sendMailWithTimeout({
            to: 'unverified@external.com',
            subject: 'Test Subject',
            html: '<p>Body</p>'
        });
    } catch (err) {
        caughtApiError = err;
    }

    assert.ok(caughtApiError, 'Must throw when Resend returns an error');
    assert.strictEqual(caughtApiError.code, 'validation_error');
    assert.strictEqual(caughtApiError.statusCode, 403);
    assert.ok(caughtApiError.message.includes('Domain not verified'));
    console.log('✔ PASS: Resend API errors correctly parsed and thrown as diagnostic Error objects.');

    // 5. Contract Preservation with email.service.js
    console.log('\n--- 5. Testing email.service.js Higher-Level Contract Compatibility ---');

    // With mock success: all email.service methods must return true
    client.emails.send = async function mockServiceSuccess() {
        return { data: { id: 'msg_svc_test' }, error: null };
    };

    const welcomeResult = await emailService.sendWelcomeEmail('prof@bulsu.edu.ph', 'Prof. Smith', 'TempPass123!');
    assert.strictEqual(welcomeResult, true, 'sendWelcomeEmail must return true on success');

    const resetResult = await emailService.sendResetPasswordEmail('prof@bulsu.edu.ph', 'Prof. Smith', 'https://labsync.edu.ph/reset-password.html?token=abc');
    assert.strictEqual(resetResult, true, 'sendResetPasswordEmail must return true on success');

    const verifyResult = await emailService.sendEmailVerificationEmail('prof@bulsu.edu.ph', 'Prof. Smith', 'https://labsync.edu.ph/verify?token=abc');
    assert.strictEqual(verifyResult, true, 'sendEmailVerificationEmail must return true on success');

    const keyAuthReqResult = await emailService.sendKeyAuthorizationEmail('head@bulsu.edu.ph', 'Dept Head', {
        requesterName: 'Prof. Smith',
        requesterRole: 'Faculty',
        requestedRoom: '204',
        heldRooms: 'Room 203',
        reason: 'Dual exam',
        reviewLink: 'https://labsync.edu.ph/dashboard',
        requestedAt: '09:00 AM'
    });
    assert.strictEqual(keyAuthReqResult, true, 'sendKeyAuthorizationEmail must return true on success');

    const keyAuthOutcomeResult = await emailService.sendKeyAuthorizationOutcomeEmail('prof@bulsu.edu.ph', 'Prof. Smith', {
        status: 'APPROVED',
        roomNumber: '204',
        approverName: 'Dept Head',
        durationMinutes: 60,
        actionLink: 'https://labsync.edu.ph/room-status.html'
    });
    assert.strictEqual(keyAuthOutcomeResult, true, 'sendKeyAuthorizationOutcomeEmail must return true on success');

    const keyReminderResult = await emailService.sendKeyReturnReminderEmail('prof@bulsu.edu.ph', {
        roomNumber: '204',
        currentHolderName: 'Prof. Smith',
        scheduledSubject: 'IT 101',
        scheduledRoom: '204',
        scheduledEndTime: '10:00 AM',
        reminderDeadline: '10:15 AM',
        scheduledFacultyName: 'Prof. Smith',
        keyStatus: 'Borrowed'
    });
    assert.strictEqual(keyReminderResult, true, 'sendKeyReturnReminderEmail must return true on success');

    console.log('✔ PASS: All 6 emailService functions successfully dispatched via Resend transport.');

    // With mock error: email.service methods must gracefully return false without crashing
    client.emails.send = async function mockServiceFailure() {
        return { data: null, error: { message: 'Network Timeout', name: 'network_error', statusCode: 504 } };
    };

    const failedWelcome = await emailService.sendWelcomeEmail('prof@bulsu.edu.ph', 'Prof. Smith', 'Pass');
    assert.strictEqual(failedWelcome, false, 'sendWelcomeEmail must catch failure and return false');

    const failedReset = await emailService.sendResetPasswordEmail('prof@bulsu.edu.ph', 'Prof. Smith', 'link');
    assert.strictEqual(failedReset, false, 'sendResetPasswordEmail must catch failure and return false');

    console.log('✔ PASS: emailService functions gracefully catch errors and return false without process abort.');

    // Teardown
    client.emails.send = originalSend;
    if (originalApiKey !== undefined) {
        process.env.RESEND_API_KEY = originalApiKey;
    } else {
        delete process.env.RESEND_API_KEY;
    }

    console.log('\n================================================================');
    console.log('🎉 ALL RESEND TRANSPORT TESTS PASSED WITH 100% SUCCESS!');
    console.log('================================================================');
}

runResendTransportTests().catch(err => {
    console.error('❌ Resend Transport Test Suite Failed:', err);
    process.exit(1);
});
