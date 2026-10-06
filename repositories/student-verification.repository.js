'use strict';

/**
 * repositories/student-verification.repository.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Data access layer for persistent Student ID QR verification sessions.
 * Provides persistent replay protection and workstation binding stored in MySQL.
 */

const db = require('../database/connection');

function toSqlDatetime(val) {
    if (!val) return null;
    const d = val instanceof Date ? val : new Date(val);
    if (isNaN(d.getTime())) return null;
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Creates a persistent verification session record.
 */
async function createVerificationSession({
    verificationId,
    nonce,
    studentName,
    studentNumber,
    roomNumber,
    pcNumber,
    issuedAt,
    expiresAt
}, executor = db) {
    const sqlIssuedAt = toSqlDatetime(issuedAt);
    const sqlExpiresAt = toSqlDatetime(expiresAt);

    return executor.query(
        `INSERT INTO student_verification_sessions
         (Verification_ID, Nonce, Student_Name, Student_Number, Room_Number, PC_Number, Issued_At, Expires_At)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            verificationId,
            nonce,
            studentName,
            studentNumber,
            String(roomNumber).trim(),
            String(pcNumber).trim(),
            sqlIssuedAt,
            sqlExpiresAt
        ]
    );
}

/**
 * Retrieves a verification session by its unique nonce.
 */
async function findSessionByNonce(nonce, executor = db) {
    return executor.query(
        `SELECT Session_ID, Verification_ID, Nonce, Student_Name, Student_Number,
                Room_Number, PC_Number, Issued_At, Expires_At, Used_At
         FROM student_verification_sessions
         WHERE Nonce = ?`,
        [nonce]
    );
}

/**
 * Retrieves a verification session by its verification ID.
 */
async function findSessionByVerificationId(verificationId, executor = db) {
    return executor.query(
        `SELECT Session_ID, Verification_ID, Nonce, Student_Name, Student_Number,
                Room_Number, PC_Number, Issued_At, Expires_At, Used_At
         FROM student_verification_sessions
         WHERE Verification_ID = ?`,
        [verificationId]
    );
}

/**
 * Atomically marks a verification session as used.
 * Concurrency & replay safe: Only updates if Used_At IS NULL.
 *
 * @param {string} nonce
 * @param {object} [executor]
 * @returns {Promise<any>}
 */
async function markSessionAsUsed(nonce, executor = db) {
    return executor.query(
        `UPDATE student_verification_sessions
         SET Used_At = NOW()
         WHERE Nonce = ? AND Used_At IS NULL`,
        [nonce]
    );
}

/**
 * Cleanup helper for expired verification sessions older than a retention threshold.
 */
async function deleteExpiredSessions(olderThanHours = 24, executor = db) {
    return executor.query(
        `DELETE FROM student_verification_sessions
         WHERE Expires_At < DATE_SUB(NOW(), INTERVAL ? HOUR)`,
        [olderThanHours]
    );
}

module.exports = {
    createVerificationSession,
    findSessionByNonce,
    findSessionByVerificationId,
    markSessionAsUsed,
    deleteExpiredSessions,
    toSqlDatetime
};
