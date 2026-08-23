'use strict';

const { CLAIM_EXPIRATION_MS, normalizeRoomNumber } = require('./iot.config');

/**
 * In-memory store for recent room claim scans
 * Map<roomKey, { userId, userName, role, timestamp }>
 */
const recentRoomClaims = {};

/**
 * Record a QR claim for a room by an authenticated user.
 *
 * @param {string|number} roomNumber
 * @param {{ userId: number, userName: string, role?: string }} user
 * @param {number} [timestamp]
 */
function recordClaim(roomNumber, user, timestamp = Date.now()) {
    const clean = normalizeRoomNumber(roomNumber);
    const raw = String(roomNumber);

    const claimData = {
        userId: user.userId,
        userName: user.userName,
        role: user.role || null,
        timestamp
    };

    recentRoomClaims[clean] = claimData;
    recentRoomClaims[raw] = claimData;
}

/**
 * Retrieve a valid (non-expired) room claim.
 *
 * @param {string|number} roomNumber
 * @param {number} [now]
 * @returns {{ userId: number, userName: string, role?: string, timestamp: number } | null}
 */
function getValidClaim(roomNumber, now = Date.now()) {
    const clean = normalizeRoomNumber(roomNumber);
    const raw = String(roomNumber);

    const claim = recentRoomClaims[clean] || recentRoomClaims[raw];
    if (claim && (now - claim.timestamp < CLAIM_EXPIRATION_MS)) {
        return claim;
    }
    return null;
}

/**
 * Clear recent room claim on key returned or explicit release.
 *
 * @param {string|number} roomNumber
 */
function clearClaim(roomNumber) {
    const clean = normalizeRoomNumber(roomNumber);
    const raw = String(roomNumber);

    delete recentRoomClaims[clean];
    delete recentRoomClaims[raw];
}

/**
 * Retrieve a copy of all active claims in memory (primarily for testing/inspection)
 */
function getAllClaims() {
    return { ...recentRoomClaims };
}

/**
 * Clear all in-memory claims (useful in test harnesses)
 */
function clearAllClaims() {
    for (const key of Object.keys(recentRoomClaims)) {
        delete recentRoomClaims[key];
    }
}

module.exports = {
    recordClaim,
    getValidClaim,
    clearClaim,
    getAllClaims,
    clearAllClaims
};
