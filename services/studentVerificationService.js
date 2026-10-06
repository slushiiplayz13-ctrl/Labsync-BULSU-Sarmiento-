'use strict';

/**
 * services/studentVerificationService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * QR-based Student Identity Capture Service.
 *
 * NOTE ON SECURITY MODEL:
 * Physical Student ID QR codes are data-bearing credentials, NOT public-key
 * digital certificates. Scanning the QR code allows LabSync to automatically
 * capture the student's Name and Student Number to remove manual free-form typing
 * friction and prevent casual identity falsification.
 *
 * The HMAC signature generated here provides:
 * 1. Data Integrity: Ensures captured student details cannot be tampered with.
 * 2. Workstation Binding: Binds the captured identity strictly to the physical Room and PC.
 * 3. Short Expiration: Valid for only 10 minutes from scan time.
 * 4. Replay Protection: Single-use nonce enforcement ensures the same scan cannot be reused.
 *
 * This HMAC proves server-side session integrity and state binding; it does NOT
 * claim cryptographic authentication of the physical student ID card itself.
 */

const crypto = require('crypto');
const { SESSION_SECRET } = require('../config/app.config');
const auditService = require('./auditService');
const studentVerificationRepository = require('../repositories/student-verification.repository');

const SECRET_KEY = SESSION_SECRET || 'labsync-student-identity-capture-secret-2026';
const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes maximum session validity

/**
 * Checks if a string matches typical university student ID patterns.
 */
function isStudentNumber(val) {
    if (typeof val !== 'string') return false;
    const clean = val.trim();
    return /^(?:20\d{2}[-\s]?\d{4,8}|\d{4}[-\s]?\d{5,7}|[0-9]{8,12})$/i.test(clean);
}

/**
 * Checks if a string looks like a valid personal student name.
 */
function isStudentName(val) {
    if (typeof val !== 'string') return false;
    const clean = val.trim();
    if (clean.length < 2 || clean.length > 100) return false;
    return /^[a-zA-Z\s.,'-]+$/.test(clean) && /[a-zA-Z]{2,}/.test(clean);
}

/**
 * Normalizes student name string.
 */
function cleanName(raw) {
    if (!raw) return '';
    return String(raw).trim().replace(/\s+/g, ' ');
}

/**
 * Normalizes student number string.
 */
function cleanNumber(raw) {
    if (!raw) return '';
    return String(raw).trim().toUpperCase();
}

/**
 * Parses raw Student ID QR content across common formats:
 * - Delimited string: "STUDENT_NO|NAME" or "NAME|STUDENT_NO"
 * - JSON: {"studentNumber": "...", "name": "..."}
 * - Key-Value multiline: "Student No: ... \n Name: ..."
 * - URL Query: "?id=...&name=..."
 *
 * @param {string} rawData
 * @returns {{ studentNumber: string, studentName: string } | null}
 */
function parseStudentIDQR(rawData) {
    if (!rawData || typeof rawData !== 'string') return null;
    const trimmed = rawData.trim();
    if (!trimmed) return null;

    let studentNumber = null;
    let studentName = null;

    // 1. JSON parsing
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
            const parsed = JSON.parse(trimmed);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                studentNumber = cleanNumber(
                    parsed.studentNumber ||
                    parsed.student_number ||
                    parsed.studentId ||
                    parsed.student_id ||
                    parsed.studentNo ||
                    parsed.student_no ||
                    parsed.id ||
                    parsed.idNumber ||
                    parsed.id_number ||
                    ''
                );

                studentName = cleanName(
                    parsed.studentName ||
                    parsed.student_name ||
                    parsed.fullName ||
                    parsed.full_name ||
                    parsed.name ||
                    parsed.Name ||
                    ''
                );

                if (studentNumber && studentName) {
                    return { studentNumber, studentName };
                }
            }
        } catch (_) {}
    }

    // 2. URL query parameters
    if (trimmed.includes('?') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        try {
            const urlObj = new URL(trimmed.startsWith('http') ? trimmed : `https://dummy.edu/${trimmed}`);
            studentNumber = cleanNumber(
                urlObj.searchParams.get('studentNumber') ||
                urlObj.searchParams.get('student_number') ||
                urlObj.searchParams.get('studentId') ||
                urlObj.searchParams.get('student_id') ||
                urlObj.searchParams.get('id') ||
                urlObj.searchParams.get('studentNo') ||
                ''
            );

            studentName = cleanName(
                urlObj.searchParams.get('studentName') ||
                urlObj.searchParams.get('student_name') ||
                urlObj.searchParams.get('name') ||
                urlObj.searchParams.get('fullName') ||
                ''
            );

            if (studentNumber && studentName) {
                return { studentNumber, studentName };
            }
        } catch (_) {}
    }

    // 3. Multiline key-value
    if (trimmed.includes('\n') || trimmed.includes('\r')) {
        const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
            const numMatch = line.match(/^(?:student\s*(?:no\.?|number|num\.?|id)|id\s*(?:number|num\.?|no\.?)|id|sn)\s*[:=]\s*(.+)$/i);
            if (numMatch && !studentNumber) {
                studentNumber = cleanNumber(numMatch[1]);
            }
            const nameMatch = line.match(/^(?:student\s*name|full\s*name|name)\s*[:=]\s*(.+)$/i);
            if (nameMatch && !studentName) {
                studentName = cleanName(nameMatch[1]);
            }
        }

        if (!studentNumber || !studentName) {
            if (lines.length >= 2) {
                if (isStudentNumber(lines[0]) && isStudentName(lines[1])) {
                    studentNumber = cleanNumber(lines[0]);
                    studentName = cleanName(lines[1]);
                } else if (isStudentName(lines[0]) && isStudentNumber(lines[1])) {
                    studentName = cleanName(lines[0]);
                    studentNumber = cleanNumber(lines[1]);
                }
            }
        }

        if (studentNumber && studentName) {
            return { studentNumber, studentName };
        }
    }

    // 4. Delimited strings (pipe |, tab \t, semicolon ;, or comma ,)
    const delimiters = ['|', '\t', ';', ','];
    for (const delim of delimiters) {
        if (trimmed.includes(delim)) {
            const parts = trimmed.split(delim).map(p => p.trim()).filter(Boolean);
            if (parts.length >= 2) {
                if (isStudentNumber(parts[0]) && isStudentName(parts[1])) {
                    return {
                        studentNumber: cleanNumber(parts[0]),
                        studentName: cleanName(parts[1])
                    };
                }
                if (isStudentName(parts[0]) && isStudentNumber(parts[1])) {
                    return {
                        studentNumber: cleanNumber(parts[1]),
                        studentName: cleanName(parts[0])
                    };
                }
                const hasDigit0 = /\d/.test(parts[0]);
                const hasDigit1 = /\d/.test(parts[1]);
                if (hasDigit0 && !hasDigit1 && parts[1].length >= 2) {
                    return {
                        studentNumber: cleanNumber(parts[0]),
                        studentName: cleanName(parts[1])
                    };
                } else if (!hasDigit0 && hasDigit1 && parts[0].length >= 2) {
                    return {
                        studentNumber: cleanNumber(parts[1]),
                        studentName: cleanName(parts[0])
                    };
                }
            }
        }
    }

    return null;
}

/**
 * Creates an integrity-protected, workstation-bound capture token with persistent database session.
 *
 * @param {string} studentNumber
 * @param {string} studentName
 * @param {string|number} roomNumber
 * @param {string|number} pcNumber
 * @param {number} [issuedAt]
 * @returns {Promise<{ token: string, verificationId: string, issuedAt: number, expiresAt: number, nonce: string }>}
 */
async function createCaptureToken(studentNumber, studentName, roomNumber, pcNumber, issuedAt = Date.now()) {
    const canonicalNum = cleanNumber(studentNumber);
    const canonicalName = cleanName(studentName);
    const canonicalRoom = String(roomNumber || '').trim();
    const canonicalPc = String(pcNumber || '').trim();
    const expiresAt = issuedAt + TOKEN_TTL_MS;
    const nonce = crypto.randomBytes(16).toString('hex');
    const verificationId = `SVR-${Date.now()}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

    const tokenPayload = {
        verificationId,
        studentNumber: canonicalNum,
        studentName: canonicalName,
        roomNumber: canonicalRoom,
        pcNumber: canonicalPc,
        issuedAt,
        expiresAt,
        nonce
    };

    const serialized = JSON.stringify(tokenPayload);
    const signature = crypto.createHmac('sha256', SECRET_KEY).update(serialized).digest('hex');
    const token = `${Buffer.from(serialized, 'utf8').toString('base64url')}.${signature}`;

    // Persist session into MySQL database for restart & multi-instance durability
    await studentVerificationRepository.createVerificationSession({
        verificationId,
        nonce,
        studentName: canonicalName,
        studentNumber: canonicalNum,
        roomNumber: canonicalRoom,
        pcNumber: canonicalPc,
        issuedAt: new Date(issuedAt),
        expiresAt: new Date(expiresAt)
    });

    return {
        token,
        verificationId,
        issuedAt,
        expiresAt,
        nonce
    };
}

/**
 * Validates a submitted capture token against submitted identity and persistent database session.
 * Enforces:
 * 1. Valid cryptographic HMAC signature
 * 2. Short expiration window (10 minutes)
 * 3. Exact match for Student Number and Student Name
 * 4. Exact match for Room and PC
 * 5. Database session existence and unused state (persistent replay protection)
 *
 * @param {string} token
 * @param {string} studentNumber
 * @param {string} studentName
 * @param {string|number} roomNumber
 * @param {string|number} pcNumber
 * @param {object} [executor]
 * @returns {Promise<{ valid: boolean, error?: string, payload?: object, session?: object }>}
 */
async function verifyCaptureToken(token, studentNumber, studentName, roomNumber, pcNumber, executor = null) {
    if (!token || typeof token !== 'string') {
        return { valid: false, error: 'Verification token is missing.' };
    }

    const dotIndex = token.lastIndexOf('.');
    if (dotIndex === -1) {
        return { valid: false, error: 'Verification token format is invalid.' };
    }

    const encodedPayload = token.slice(0, dotIndex);
    const signature = token.slice(dotIndex + 1);

    // 1. Verify cryptographic HMAC signature
    let payloadStr;
    try {
        payloadStr = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    } catch (_) {
        return { valid: false, error: 'Failed to decode verification token payload.' };
    }

    const expectedSignature = crypto.createHmac('sha256', SECRET_KEY).update(payloadStr).digest('hex');
    try {
        const sigBuf = Buffer.from(signature, 'hex');
        const expBuf = Buffer.from(expectedSignature, 'hex');
        if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
            return { valid: false, error: 'Verification token signature is invalid or has been tampered with.' };
        }
    } catch (_) {
        return { valid: false, error: 'Invalid verification token signature.' };
    }

    // 2. Parse payload contents
    let payload;
    try {
        payload = JSON.parse(payloadStr);
    } catch (_) {
        return { valid: false, error: 'Malformed verification token payload.' };
    }

    const now = Date.now();

    // 3. Expiration check from token payload
    if (now > payload.expiresAt) {
        return { valid: false, error: 'Student ID verification session has expired. Please re-scan your Student ID QR code.' };
    }
    if (payload.issuedAt > now + 60 * 1000) {
        return { valid: false, error: 'Verification token timestamp is invalid (future timestamp).' };
    }

    // 4. Workstation binding check (Room & PC)
    const cleanRoom = String(roomNumber || '').trim();
    const cleanPc = String(pcNumber || '').trim();
    if (String(payload.roomNumber).trim() !== cleanRoom || String(payload.pcNumber).trim() !== cleanPc) {
        return { valid: false, error: 'Verification token workstation mismatch. Token was not captured on this laboratory PC.' };
    }

    // 5. Identity match check (Student Number & Student Name)
    const canonicalNum = cleanNumber(studentNumber);
    const canonicalName = cleanName(studentName);
    if (cleanNumber(payload.studentNumber) !== canonicalNum || cleanName(payload.studentName).toUpperCase() !== canonicalName.toUpperCase()) {
        return { valid: false, error: 'Submitted student credentials do not match the scanned Student ID QR session.' };
    }

    // 6. Persistent Database Session Verification (Railway / multi-instance replay defense)
    const [rows] = await studentVerificationRepository.findSessionByNonce(payload.nonce, executor || undefined);
    if (!rows || rows.length === 0) {
        return { valid: false, error: 'Student ID verification session not found or invalid. Please re-scan your Student ID QR code.' };
    }

    const session = rows[0];

    // Check if session in DB has expired
    const dbExpiresAt = new Date(session.Expires_At).getTime();
    if (now > dbExpiresAt) {
        return { valid: false, error: 'Student ID verification session has expired. Please re-scan your Student ID QR code.' };
    }

    // Check if session in DB was already used
    if (session.Used_At !== null) {
        return { valid: false, error: 'Student ID verification session has already been used. Please re-scan your Student ID QR code.' };
    }

    // Check database binding consistency
    if (
        cleanNumber(session.Student_Number) !== canonicalNum ||
        cleanName(session.Student_Name).toUpperCase() !== canonicalName.toUpperCase() ||
        String(session.Room_Number).trim() !== cleanRoom ||
        String(session.PC_Number).trim() !== cleanPc
    ) {
        return { valid: false, error: 'Submitted report details do not match the persistent verification session.' };
    }

    return { valid: true, payload, session };
}

/**
 * Consumes a token nonce in the database to prevent replay attacks.
 *
 * @param {string} nonce
 */
async function consumeTokenNonce(nonce) {
    if (!nonce || typeof nonce !== 'string') return;
    try {
        await studentVerificationRepository.markSessionAsUsed(nonce);
    } catch (_) {}
}

/**
 * Service method for the verification endpoint /api/reports/verify-student-id.
 */
async function verifyStudentIDPayload({ qrData, roomNumber, pcNumber, req = null }) {
    if (!qrData || typeof qrData !== 'string' || !qrData.trim()) {
        await auditService.logSecurityEvent({
            req,
            action: 'STUDENT_ID_QR_CAPTURE',
            resourceType: 'PC',
            resourceId: pcNumber ? `${roomNumber || 'Unknown'}-PC-${pcNumber}` : null,
            actorRole: 'Student',
            details: { roomNumber, pcNumber, error: 'QR code data is required.' },
            result: 'FAILURE'
        });
        return {
            status: 400,
            error: 'QR code data is required. Please scan your physical Student ID QR code.'
        };
    }

    if (!roomNumber || !pcNumber) {
        await auditService.logSecurityEvent({
            req,
            action: 'STUDENT_ID_QR_CAPTURE',
            resourceType: 'PC',
            resourceId: null,
            actorRole: 'Student',
            details: { roomNumber, pcNumber, error: 'Workstation context required.' },
            result: 'FAILURE'
        });
        return {
            status: 400,
            error: 'Workstation context (Room and PC) is required before scanning Student ID.'
        };
    }

    const parsed = parseStudentIDQR(qrData);
    if (!parsed || !parsed.studentNumber || !parsed.studentName) {
        await auditService.logSecurityEvent({
            req,
            action: 'STUDENT_ID_QR_CAPTURE',
            resourceType: 'PC',
            resourceId: `${roomNumber}-PC-${pcNumber}`,
            actorRole: 'Student',
            details: { roomNumber, pcNumber, error: 'Unreadable or invalid Student ID QR code.' },
            result: 'FAILURE'
        });
        return {
            status: 400,
            error: 'Unreadable or invalid Student ID QR code. Please ensure you are scanning the QR code on the back of your official Student ID.'
        };
    }

    const tokenObj = await createCaptureToken(
        parsed.studentNumber,
        parsed.studentName,
        roomNumber,
        pcNumber
    );

    await auditService.logSecurityEvent({
        req,
        action: 'STUDENT_ID_QR_CAPTURE',
        resourceType: 'PC',
        resourceId: `${roomNumber}-PC-${pcNumber}`,
        actorRole: 'Student',
        details: {
            studentNumber: parsed.studentNumber,
            studentName: parsed.studentName,
            roomNumber,
            pcNumber
        },
        result: 'SUCCESS'
    });

    return {
        status: 200,
        data: {
            studentName: parsed.studentName,
            studentNumber: parsed.studentNumber,
            verificationToken: tokenObj.token,
            verificationId: tokenObj.verificationId,
            verificationTimestamp: tokenObj.issuedAt,
            expiresAt: tokenObj.expiresAt
        }
    };
}

/**
 * Backward-compatible helper for legacy test suites or callers.
 */
async function createVerificationToken(studentNumber, studentName, roomNumber, pcNumber, issuedAt = Date.now()) {
    const res = await createCaptureToken(studentNumber, studentName, roomNumber, pcNumber, issuedAt);
    return res.token;
}

/**
 * Backward-compatible helper returning boolean.
 */
async function verifyStudentToken(token, maybeTimestampOrNum, maybeNumOrName, maybeNameOrRoom, maybeRoomOrPc, maybePc) {
    if (maybePc !== undefined) {
        const res = await verifyCaptureToken(token, maybeNumOrName, maybeNameOrRoom, maybeRoomOrPc, maybePc);
        return res.valid;
    }
    const res = await verifyCaptureToken(token, maybeTimestampOrNum, maybeNumOrName, maybeNameOrRoom, maybeRoomOrPc);
    return res.valid;
}

module.exports = {
    parseStudentIDQR,
    createCaptureToken,
    verifyCaptureToken,
    consumeTokenNonce,
    verifyStudentIDPayload,
    createVerificationToken,
    verifyStudentToken,
    isStudentNumber,
    isStudentName,
    TOKEN_TTL_MS
};

