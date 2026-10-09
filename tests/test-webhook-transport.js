'use strict';

/**
 * tests/test-webhook-transport.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit test suite for the Google Apps Script Web App HTTPS email transport.
 *
 * Verifies:
 * 1. Interface exports & configuration resolution
 * 2. Missing EMAIL_WEBHOOK_URL fail-fast behavior
 * 3. Missing EMAIL_WEBHOOK_SECRET fail-fast behavior
 * 4. Request payload structure (recipient, subject, HTML, secret, headers)
 * 5. Successful webhook dispatch response mapping
 * 6. Unauthorized response handling (HTTP 401 / JSON unauthorized)
 * 7. HTTP failure handling (non-2xx responses)
 * 8. Invalid / malformed JSON response handling
 * 9. Network timeout enforcement
 * 10. Seamless compatibility with all 6 email.service.js transactional functions
 *
 * NOTE: All network requests are completely mocked — ZERO live emails sent.
 */

const assert = require('assert');

async function runWebhookTransportTests() {
    console.log('================================================================');
    console.log('🧪 TESTING GOOGLE APPS SCRIPT WEBHOOK TRANSPORT & SERVICE PIPELINE');
    console.log('================================================================\n');

    const emailTransport = require('../services/email/email.transport');
    const emailService = require('../services/email/email.service');

    // Preserve original environment variables
    const originalEnv = {
        EMAIL_WEBHOOK_URL: process.env.EMAIL_WEBHOOK_URL,
        EMAIL_WEBHOOK_SECRET: process.env.EMAIL_WEBHOOK_SECRET,
        EMAIL_FROM: process.env.EMAIL_FROM
    };

    // Preserve original global.fetch
    const originalFetch = global.fetch;

    try {
        // -------------------------------------------------------------
        // 1. Interface & Exports Verification
        // -------------------------------------------------------------
        console.log('--- 1. Testing email.transport.js Function Exports ---');
        assert.strictEqual(typeof emailTransport.sendMailWithTimeout, 'function', 'sendMailWithTimeout must be exported');
        assert.strictEqual(typeof emailTransport.getSenderAddress, 'function', 'getSenderAddress must be exported');
        assert.strictEqual(typeof emailTransport.getWebhookUrl, 'function', 'getWebhookUrl must be exported');
        assert.strictEqual(typeof emailTransport.getWebhookSecret, 'function', 'getWebhookSecret must be exported');
        assert.strictEqual(typeof emailTransport.getTransporter, 'function', 'getTransporter compatibility alias must be exported');
        assert.strictEqual(typeof emailTransport.getResendClient, 'function', 'getResendClient legacy stub must be exported');
        assert.strictEqual(emailTransport.getResendClient(), null, 'getResendClient should return null');
        console.log('✔ PASS: All required transport methods and compatibility stubs are properly exported.');

        // -------------------------------------------------------------
        // 2. Sender Address Resolution
        // -------------------------------------------------------------
        console.log('\n--- 2. Testing Sender Address (EMAIL_FROM) Resolution ---');
        delete process.env.EMAIL_FROM;
        assert.strictEqual(
            emailTransport.getSenderAddress(),
            'LabSync',
            'Default sender must be "LabSync" when EMAIL_FROM is unset'
        );

        process.env.EMAIL_FROM = '"LabSync Official" <notifications@labsync.edu.ph>';
        assert.strictEqual(
            emailTransport.getSenderAddress(),
            '"LabSync Official" <notifications@labsync.edu.ph>',
            'Custom EMAIL_FROM must be respected'
        );
        console.log('✔ PASS: getSenderAddress correctly prioritizes EMAIL_FROM with safe fallback.');

        // -------------------------------------------------------------
        // 3. Missing EMAIL_WEBHOOK_URL Rejection
        // -------------------------------------------------------------
        console.log('\n--- 3. Testing Missing EMAIL_WEBHOOK_URL Rejection ---');
        delete process.env.EMAIL_WEBHOOK_URL;
        process.env.EMAIL_WEBHOOK_SECRET = 'test_dummy_secret';

        let threwMissingUrl = false;
        try {
            await emailTransport.sendMailWithTimeout({
                to: 'test@example.com',
                subject: 'Test Subject',
                html: '<p>Test</p>'
            });
        } catch (err) {
            threwMissingUrl = true;
            assert.strictEqual(err.code, 'MISSING_EMAIL_WEBHOOK_URL', 'Must reject with MISSING_EMAIL_WEBHOOK_URL');
        }
        assert.ok(threwMissingUrl, 'sendMailWithTimeout must reject when EMAIL_WEBHOOK_URL is not set');
        console.log('✔ PASS: Missing EMAIL_WEBHOOK_URL fails fast with descriptive error.');

        // -------------------------------------------------------------
        // 4. Missing EMAIL_WEBHOOK_SECRET Rejection
        // -------------------------------------------------------------
        console.log('\n--- 4. Testing Missing EMAIL_WEBHOOK_SECRET Rejection ---');
        process.env.EMAIL_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbz_mock/exec';
        delete process.env.EMAIL_WEBHOOK_SECRET;

        let threwMissingSecret = false;
        try {
            await emailTransport.sendMailWithTimeout({
                to: 'test@example.com',
                subject: 'Test Subject',
                html: '<p>Test</p>'
            });
        } catch (err) {
            threwMissingSecret = true;
            assert.strictEqual(err.code, 'MISSING_EMAIL_WEBHOOK_SECRET', 'Must reject with MISSING_EMAIL_WEBHOOK_SECRET');
        }
        assert.ok(threwMissingSecret, 'sendMailWithTimeout must reject when EMAIL_WEBHOOK_SECRET is not set');
        console.log('✔ PASS: Missing EMAIL_WEBHOOK_SECRET fails fast with descriptive error.');

        // -------------------------------------------------------------
        // 5. Payload Structure & Headers Verification
        // -------------------------------------------------------------
        console.log('\n--- 5. Testing Request Payload Structure & Secret Header ---');
        process.env.EMAIL_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbz_test_url/exec';
        process.env.EMAIL_WEBHOOK_SECRET = 'super_secret_webhook_token_987';

        let capturedRequest = null;
        global.fetch = async function mockFetchPayload(url, options) {
            capturedRequest = {
                url,
                method: options.method,
                headers: options.headers,
                body: JSON.parse(options.body),
                redirect: options.redirect
            };

            return {
                ok: true,
                status: 200,
                statusText: 'OK',
                json: async () => ({
                    success: true,
                    messageId: 'gas_mock_payload_test_id',
                    to: 'recipient@bulsu.edu.ph',
                    subject: 'Payload Check'
                })
            };
        };

        const payloadTestResult = await emailTransport.sendMailWithTimeout({
            to: 'recipient@bulsu.edu.ph',
            subject: 'Payload Check',
            html: '<p>Body HTML Check</p>',
            text: 'Body Plain Check',
            replyTo: 'reply@labsync.edu.ph'
        });

        assert.strictEqual(capturedRequest.url, 'https://script.google.com/macros/s/AKfycbz_test_url/exec');
        assert.ok(!capturedRequest.url.includes('?'), 'URL must NOT contain secret query parameters');
        assert.strictEqual(capturedRequest.method, 'POST');
        assert.strictEqual(capturedRequest.headers['Content-Type'], 'application/json');
        assert.strictEqual(capturedRequest.headers['X-LabSync-Webhook-Secret'], 'super_secret_webhook_token_987');
        assert.strictEqual(capturedRequest.headers['Authorization'], 'Bearer super_secret_webhook_token_987');
        assert.strictEqual(capturedRequest.redirect, 'follow');

        assert.strictEqual(capturedRequest.body.secret, 'super_secret_webhook_token_987');
        assert.deepStrictEqual(capturedRequest.body.to, ['recipient@bulsu.edu.ph']);
        assert.strictEqual(capturedRequest.body.subject, 'Payload Check');
        assert.strictEqual(capturedRequest.body.html, '<p>Body HTML Check</p>');
        assert.strictEqual(capturedRequest.body.text, 'Body Plain Check');
        assert.strictEqual(capturedRequest.body.replyTo, 'reply@labsync.edu.ph');

        assert.strictEqual(payloadTestResult.id, 'gas_mock_payload_test_id');
        assert.strictEqual(payloadTestResult.messageId, 'gas_mock_payload_test_id');
        assert.strictEqual(payloadTestResult.success, true);
        console.log('✔ PASS: Outbound HTTPS request contains correct headers, secret, recipient, subject, and body.');

        // -------------------------------------------------------------
        // 6. Successful Webhook Response
        // -------------------------------------------------------------
        console.log('\n--- 6. Testing Successful Webhook Dispatch & ID Normalization ---');
        global.fetch = async function mockFetchSuccess() {
            return {
                ok: true,
                status: 200,
                statusText: 'OK',
                json: async () => ({
                    success: true,
                    messageId: 'gas_179128000_abc123',
                    to: 'user@example.com',
                    subject: 'Test Subject'
                })
            };
        };

        const successRes = await emailTransport.sendMailWithTimeout({
            to: 'user@example.com',
            subject: 'Test Subject',
            html: '<p>Testing success</p>'
        });

        assert.strictEqual(successRes.success, true);
        assert.strictEqual(successRes.id, 'gas_179128000_abc123');
        assert.strictEqual(successRes.messageId, 'gas_179128000_abc123');
        console.log('✔ PASS: Successful Apps Script dispatch returns standardized id & messageId.');

        // -------------------------------------------------------------
        // 7. Unauthorized Response Handling
        // -------------------------------------------------------------
        console.log('\n--- 7. Testing Unauthorized Webhook Response Handling ---');
        // 7A: HTTP 401 response
        global.fetch = async function mockFetchHttp401() {
            return {
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
                text: async () => 'Unauthorized secret'
            };
        };

        let caughtHttp401 = null;
        try {
            await emailTransport.sendMailWithTimeout({
                to: 'user@example.com',
                subject: 'Auth Test',
                html: '<p>Test</p>'
            });
        } catch (err) {
            caughtHttp401 = err;
        }

        assert.ok(caughtHttp401, 'Must reject on HTTP 401');
        assert.strictEqual(caughtHttp401.code, 'UNAUTHORIZED_WEBHOOK');
        assert.strictEqual(caughtHttp401.statusCode, 401);

        // 7B: 200 response with JSON failure indicating Unauthorized
        global.fetch = async function mockFetchJson401() {
            return {
                ok: true,
                status: 200,
                statusText: 'OK',
                json: async () => ({
                    success: false,
                    error: 'Unauthorized: Invalid or missing webhook secret',
                    statusCode: 401
                })
            };
        };

        let caughtJson401 = null;
        try {
            await emailTransport.sendMailWithTimeout({
                to: 'user@example.com',
                subject: 'Auth Test',
                html: '<p>Test</p>'
            });
        } catch (err) {
            caughtJson401 = err;
        }

        assert.ok(caughtJson401, 'Must reject on JSON unauthorized');
        assert.strictEqual(caughtJson401.code, 'UNAUTHORIZED_WEBHOOK');
        assert.strictEqual(caughtJson401.statusCode, 401);
        console.log('✔ PASS: Unauthorized webhook responses correctly identified and mapped.');

        // -------------------------------------------------------------
        // 8. HTTP Failure (e.g. 500, 503) Handling
        // -------------------------------------------------------------
        console.log('\n--- 8. Testing HTTP Failure Handling ---');
        global.fetch = async function mockFetch500() {
            return {
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                text: async () => 'Apps Script execution failure'
            };
        };

        let caught500 = null;
        try {
            await emailTransport.sendMailWithTimeout({
                to: 'user@example.com',
                subject: '500 Test',
                html: '<p>Test</p>'
            });
        } catch (err) {
            caught500 = err;
        }

        assert.ok(caught500, 'Must reject on HTTP 500');
        assert.strictEqual(caught500.code, 'WEBHOOK_HTTP_ERROR');
        assert.strictEqual(caught500.statusCode, 500);
        console.log('✔ PASS: Non-2xx HTTP errors correctly captured with status code.');

        // -------------------------------------------------------------
        // 9. Invalid / Malformed Apps Script Response
        // -------------------------------------------------------------
        console.log('\n--- 9. Testing Invalid / Malformed Response Handling ---');
        global.fetch = async function mockFetchMalformedJson() {
            return {
                ok: true,
                status: 200,
                statusText: 'OK',
                json: async () => { throw new Error('Unexpected token < in JSON'); }
            };
        };

        let caughtMalformed = null;
        try {
            await emailTransport.sendMailWithTimeout({
                to: 'user@example.com',
                subject: 'Malformed Test',
                html: '<p>Test</p>'
            });
        } catch (err) {
            caughtMalformed = err;
        }

        assert.ok(caughtMalformed, 'Must reject on malformed JSON');
        assert.strictEqual(caughtMalformed.code, 'INVALID_WEBHOOK_RESPONSE');
        console.log('✔ PASS: Malformed response gracefully handled without unhandled exception.');

        // -------------------------------------------------------------
        // 10. Network Timeout Safeguard
        // -------------------------------------------------------------
        console.log('\n--- 10. Testing Network Timeout Protection ---');
        global.fetch = async function mockHangingFetch(_url, options) {
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    resolve({
                        ok: true,
                        status: 200,
                        json: async () => ({ success: true })
                    });
                }, 200);

                if (options && options.signal) {
                    options.signal.addEventListener('abort', () => {
                        clearTimeout(timer);
                        const abortErr = new Error('The operation was aborted.');
                        abortErr.name = 'AbortError';
                        reject(abortErr);
                    });
                }
            });
        };

        let caughtTimeout = null;
        try {
            // Test with a tight 30ms timeout
            await emailTransport.sendMailWithTimeout({
                to: 'user@example.com',
                subject: 'Timeout Test',
                html: '<p>Test</p>'
            }, 30);
        } catch (err) {
            caughtTimeout = err;
        }

        assert.ok(caughtTimeout, 'Must reject when timeout is exceeded');
        assert.strictEqual(caughtTimeout.code, 'WEBHOOK_TIMEOUT');
        assert.ok(caughtTimeout.message.includes('timed out'));
        console.log('✔ PASS: Network timeout safeguard triggers cleanly and aborts connection.');

        // -------------------------------------------------------------
        // 11. Higher-Level Contract Compatibility (email.service.js)
        // -------------------------------------------------------------
        console.log('\n--- 11. Testing email.service.js Higher-Level Contract Compatibility ---');

        // With mock success: all email.service methods must return true
        global.fetch = async function mockServiceSuccess() {
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    success: true,
                    messageId: 'gas_svc_success_id',
                    to: 'test@bulsu.edu.ph'
                })
            };
        };

        const welcomeResult = await emailService.sendWelcomeEmail('prof@bulsu.edu.ph', 'Prof. Smith', 'TempPass123!');
        assert.strictEqual(welcomeResult, true, 'sendWelcomeEmail must return true on success');

        const misWelcomeResult = await emailService.sendWelcomeEmail('mis@bulsu.edu.ph', 'MIS Tech', 'TempPass456!', 'MIS Staff');
        assert.strictEqual(misWelcomeResult, true, 'sendWelcomeEmail for MIS Staff must return true on success');

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

        console.log('✔ PASS: All 6 emailService functions successfully dispatched via Apps Script transport.');

        // With mock error: email.service methods must gracefully return false without crashing
        global.fetch = async function mockServiceFailure() {
            return {
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                text: async () => 'Server error'
            };
        };

        const failedWelcome = await emailService.sendWelcomeEmail('prof@bulsu.edu.ph', 'Prof. Smith', 'Pass');
        assert.strictEqual(failedWelcome, false, 'sendWelcomeEmail must catch failure and return false');

        const failedReset = await emailService.sendResetPasswordEmail('prof@bulsu.edu.ph', 'Prof. Smith', 'link');
        assert.strictEqual(failedReset, false, 'sendResetPasswordEmail must catch failure and return false');

        console.log('✔ PASS: emailService functions gracefully catch errors and return false without throwing.');

    } finally {
        // Teardown: Restore original global.fetch and env vars
        global.fetch = originalFetch;
        for (const [key, value] of Object.entries(originalEnv)) {
            if (value !== undefined) {
                process.env[key] = value;
            } else {
                delete process.env[key];
            }
        }
    }

    console.log('\n================================================================');
    console.log('🎉 ALL GOOGLE APPS SCRIPT TRANSPORT TESTS PASSED WITH 100% SUCCESS!');
    console.log('================================================================');
}

runWebhookTransportTests().catch(err => {
    console.error('❌ Webhook Transport Test Suite Failed:', err);
    process.exit(1);
});
