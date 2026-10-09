'use strict';

/**
 * tests/test-welcome-email.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Verification suite for welcome email template and dispatch pipeline:
 * 1. Faculty account welcome email wording & structure.
 * 2. MIS Staff account welcome email wording & structure.
 * 3. Preservation of recipient, name, temporary credentials, and HTML formatting.
 * 4. Backward compatibility with existing 3-parameter callers of sendWelcomeEmail.
 * 5. emailService facade compatibility.
 * 6. Service flow integration for MIS and Faculty account creation.
 */

const assert = require('assert');
const { renderWelcomeEmail, getAccountDescription } = require('../services/email/templates/welcome');
const emailService = require('../services/email/email.service');
const emailServiceFacade = require('../services/emailService');

async function runWelcomeEmailTests() {
    console.log('================================================================');
    console.log('🧪 TESTING WELCOME EMAIL ROLE-BASED CONTENT & DISPATCH PIPELINE');
    console.log('================================================================\n');

    const testFacultyEmail = 'faculty.test@bulsu.edu.ph';
    const testFacultyName = 'Prof. Maria Santos';
    const dummyFacultyPass = 'TempPass!Faculty123';

    const testMisEmail = 'mis.test@bulsu.edu.ph';
    const testMisName = 'Charl Jay Santi';
    const dummyMisPass = 'TempPass!Mis456';

    // ─────────────────────────────────────────────────────────────
    // 1. Account Description Helper Tests
    // ─────────────────────────────────────────────────────────────
    console.log('--- 1. Testing getAccountDescription Helper ---');
    assert.strictEqual(getAccountDescription(), 'faculty account', 'Default must be "faculty account"');
    assert.strictEqual(getAccountDescription(undefined), 'faculty account', 'undefined must yield "faculty account"');
    assert.strictEqual(getAccountDescription(null), 'faculty account', 'null must yield "faculty account"');
    assert.strictEqual(getAccountDescription(''), 'faculty account', 'Empty string must yield "faculty account"');
    assert.strictEqual(getAccountDescription('Faculty'), 'faculty account', '"Faculty" must yield "faculty account"');
    assert.strictEqual(getAccountDescription('faculty'), 'faculty account', 'lowercase "faculty" must yield "faculty account"');
    assert.strictEqual(getAccountDescription('MIS Staff'), 'MIS Staff account', '"MIS Staff" must yield "MIS Staff account"');
    assert.strictEqual(getAccountDescription('mis staff'), 'MIS Staff account', 'lowercase "mis staff" must yield "MIS Staff account"');
    assert.strictEqual(getAccountDescription('MIS'), 'MIS Staff account', '"MIS" must yield "MIS Staff account"');
    assert.strictEqual(getAccountDescription({ role: 'MIS Staff' }), 'MIS Staff account', 'Object with role MIS Staff must yield "MIS Staff account"');
    assert.strictEqual(getAccountDescription({ role: 'Faculty' }), 'faculty account', 'Object with role Faculty must yield "faculty account"');
    assert.strictEqual(getAccountDescription({ accountType: 'MIS Staff' }), 'MIS Staff account', 'Object with accountType must yield "MIS Staff account"');
    console.log('✔ PASS: Account description helper maps roles accurately with safe defaults.');

    // ─────────────────────────────────────────────────────────────
    // 2. Faculty Welcome Email Template Rendering
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- 2. Testing Faculty Welcome Email Rendering ---');
    const defaultFacultyEmail = renderWelcomeEmail(testFacultyEmail, testFacultyName, dummyFacultyPass);
    assert.strictEqual(defaultFacultyEmail.subject, 'Welcome to LabSync - Your Account Credentials');
    assert.ok(defaultFacultyEmail.html.includes(testFacultyName), 'HTML must contain faculty recipient name');
    assert.ok(defaultFacultyEmail.html.includes(testFacultyEmail), 'HTML must contain faculty recipient email');
    assert.ok(defaultFacultyEmail.html.includes(dummyFacultyPass), 'HTML must contain temporary password');
    assert.ok(
        defaultFacultyEmail.html.includes('Your faculty account has been created successfully. Below are your temporary login credentials:'),
        'Faculty email must contain exact faculty account wording'
    );
    assert.ok(!defaultFacultyEmail.html.includes('MIS Staff account'), 'Faculty email must not mention MIS Staff account');

    const explicitFacultyEmail = renderWelcomeEmail(testFacultyEmail, testFacultyName, dummyFacultyPass, 'Faculty');
    assert.ok(
        explicitFacultyEmail.html.includes('Your faculty account has been created successfully. Below are your temporary login credentials:'),
        'Explicit "Faculty" argument must produce exact faculty account wording'
    );
    console.log('✔ PASS: Faculty welcome email properly renders faculty description and preserves credentials.');

    // ─────────────────────────────────────────────────────────────
    // 3. MIS Staff Welcome Email Template Rendering
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- 3. Testing MIS Staff Welcome Email Rendering ---');
    const misEmail = renderWelcomeEmail(testMisEmail, testMisName, dummyMisPass, 'MIS Staff');
    assert.strictEqual(misEmail.subject, 'Welcome to LabSync - Your Account Credentials');
    assert.ok(misEmail.html.includes(testMisName), 'HTML must contain MIS staff recipient name');
    assert.ok(misEmail.html.includes(testMisEmail), 'HTML must contain MIS staff recipient email');
    assert.ok(misEmail.html.includes(dummyMisPass), 'HTML must contain temporary password');
    assert.ok(
        misEmail.html.includes('Your MIS Staff account has been created successfully. Below are your temporary login credentials:'),
        'MIS email must contain exact "MIS Staff account" description'
    );
    assert.ok(!misEmail.html.includes('Your faculty account'), 'MIS email must not describe the account as faculty');
    console.log('✔ PASS: MIS Staff welcome email properly identifies MIS Staff account.');

    // ─────────────────────────────────────────────────────────────
    // 4. HTML Formatting, CTA, and Security Notices Preservation
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- 4. Testing HTML Structure & Security Notices Invariants ---');
    for (const rendered of [defaultFacultyEmail, misEmail]) {
        assert.ok(rendered.html.includes('Welcome to LabSync!'), 'Must preserve welcome title');
        assert.ok(rendered.html.includes('Email Address'), 'Must preserve Email Address block');
        assert.ok(rendered.html.includes('Temporary Password'), 'Must preserve Temporary Password block');
        assert.ok(rendered.html.includes('⚠️ Action Required'), 'Must preserve security warning heading');
        assert.ok(
            rendered.html.includes('For security reasons, you are required to change this temporary password immediately after your first sign-in.'),
            'Must preserve password change notice'
        );
        assert.ok(rendered.html.includes('Access Your Account'), 'Must preserve login CTA button');
        assert.ok(rendered.html.includes('/login.html'), 'Must link to login page');
        assert.ok(rendered.html.includes('LabSync IT Team'), 'Must preserve IT Team signature');
    }
    console.log('✔ PASS: HTML template structure, security notices, and layout preserved intact.');

    // ─────────────────────────────────────────────────────────────
    // 5. Dispatch via email.service.js with Webhook Inspection
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- 5. Testing Dispatch via email.service.js ---');
    const originalFetch = global.fetch;
    const originalWebhookUrl = process.env.EMAIL_WEBHOOK_URL;
    const originalWebhookSecret = process.env.EMAIL_WEBHOOK_SECRET;

    process.env.EMAIL_WEBHOOK_URL = 'https://script.google.com/macros/s/test_webhook/exec';
    process.env.EMAIL_WEBHOOK_SECRET = 'test_webhook_secret_key';

    let lastDispatchedPayload = null;
    global.fetch = async function mockWebhookFetch(url, options) {
        lastDispatchedPayload = JSON.parse(options.body);
        return {
            ok: true,
            status: 200,
            json: async () => ({
                success: true,
                messageId: 'mock_msg_' + Date.now(),
                to: lastDispatchedPayload.to
            })
        };
    };

    try {
        // Test 5a: Backward compatible call (3 args -> Faculty default)
        const facultySent = await emailService.sendWelcomeEmail(testFacultyEmail, testFacultyName, dummyFacultyPass);
        assert.strictEqual(facultySent, true, 'sendWelcomeEmail must succeed');
        assert.deepStrictEqual(lastDispatchedPayload.to, [testFacultyEmail]);
        assert.ok(
            lastDispatchedPayload.html.includes('Your faculty account has been created successfully.'),
            'Default 3-arg sendWelcomeEmail must send faculty wording'
        );
        assert.ok(!lastDispatchedPayload.html.includes('MIS Staff account'));

        // Test 5b: Explicit MIS Staff dispatch
        const misSent = await emailService.sendWelcomeEmail(testMisEmail, testMisName, dummyMisPass, 'MIS Staff');
        assert.strictEqual(misSent, true, 'sendWelcomeEmail for MIS Staff must succeed');
        assert.deepStrictEqual(lastDispatchedPayload.to, [testMisEmail]);
        assert.ok(
            lastDispatchedPayload.html.includes('Your MIS Staff account has been created successfully.'),
            'MIS Staff sendWelcomeEmail must send MIS Staff wording'
        );
        assert.ok(!lastDispatchedPayload.html.includes('Your faculty account'));

        // Test 5c: Compatibility with emailService facade re-export
        const facadeMisSent = await emailServiceFacade.sendWelcomeEmail(testMisEmail, testMisName, dummyMisPass, 'MIS Staff');
        assert.strictEqual(facadeMisSent, true, 'emailService facade sendWelcomeEmail must succeed');
        assert.deepStrictEqual(lastDispatchedPayload.to, [testMisEmail]);
        assert.ok(
            lastDispatchedPayload.html.includes('Your MIS Staff account has been created successfully.'),
            'Facade must forward role to template renderer'
        );

        // Test 5d: Failure handling returns false without throwing
        global.fetch = async function mockFail() {
            return {
                ok: false,
                status: 500,
                statusText: 'Internal Error',
                text: async () => 'Error'
            };
        };
        const failedResult = await emailService.sendWelcomeEmail(testMisEmail, testMisName, dummyMisPass, 'MIS Staff');
        assert.strictEqual(failedResult, false, 'sendWelcomeEmail must return false on delivery failure');

        console.log('✔ PASS: Outgoing webhook dispatches correctly distinguish Faculty vs MIS Staff.');
    } finally {
        global.fetch = originalFetch;
        process.env.EMAIL_WEBHOOK_URL = originalWebhookUrl;
        process.env.EMAIL_WEBHOOK_SECRET = originalWebhookSecret;
    }

    // ─────────────────────────────────────────────────────────────
    // 6. Source File Invariant Inspection (Faculty vs MIS Service callers)
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- 6. Verifying Source Code Callers ---');
    const fs = require('fs');
    const path = require('path');

    const misServiceCode = fs.readFileSync(path.join(__dirname, '../services/misService.js'), 'utf8');
    assert.ok(
        misServiceCode.includes("sendWelcomeEmail(emailResult.value, nameResult.value, temporaryPassword, 'MIS Staff')"),
        'misService.js must pass "MIS Staff" to sendWelcomeEmail'
    );

    const facultyServiceCode = fs.readFileSync(path.join(__dirname, '../services/facultyService.js'), 'utf8');
    assert.ok(
        facultyServiceCode.includes("sendWelcomeEmail(email, trimmedName, generatedPassword, role || 'Faculty')"),
        'facultyService.js must pass faculty role context to sendWelcomeEmail'
    );

    console.log('✔ PASS: misService.js and facultyService.js callers correctly pass explicit role context.');

    console.log('\n================================================================');
    console.log('🎉 ALL WELCOME EMAIL ROLE TESTS PASSED 100%!');
    console.log('================================================================');
}

runWelcomeEmailTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
