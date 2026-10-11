'use strict';

const { CLAIM_EXPIRATION_MS, CLAIM_LOCK_WINDOW_MS, normalizeRoomNumber } = require('./iot.config');

/**
 * In-memory store for recent room claim scans
 * Map<roomKey, { userId, userName, role, timestamp, lockExpiresAt, scanId }>
 */
const recentRoomClaims = {};

/**
 * Record a QR claim for a room by an authenticated user.
 *
 * @param {string|number} roomNumber
 * @param {{ userId: number, userName: string, role?: string }} user
 * @param {number} [timestamp]
 * @param {string|number|null} [scanId]
 * @param {number} [lockWindowMs]
 */
function recordClaim(roomNumber, user, timestamp = Date.now(), scanId = null, lockWindowMs = CLAIM_LOCK_WINDOW_MS) {
    const clean = normalizeRoomNumber(roomNumber);
    const raw = String(roomNumber);
    const win = Number(lockWindowMs) || CLAIM_LOCK_WINDOW_MS;

    const claimData = {
        userId: user.userId,
        userName: user.userName,
        role: user.role || null,
        timestamp,
        lockExpiresAt: timestamp + win,
        lockWindowMs: win,
        scanId: scanId || null
    };

    recentRoomClaims[clean] = claimData;
    recentRoomClaims[raw] = claimData;
}

/**
 * Check whether an active, unconsumed authorization lock exists on any of the target rooms
 * that belongs to a DIFFERENT user.
 *
 * @param {Array<string|number>|string|number} roomInputs
 * @param {number} requestingUserId
 * @param {number} [now]
 * @returns {{ isLocked: boolean, activeUser?: { userId: number, userName: string, role?: string }, remainingMs?: number, room?: string }}
 */
function checkActiveClaimLock(roomInputs, requestingUserId, now = Date.now()) {
    const inputs = Array.isArray(roomInputs) ? roomInputs : [roomInputs];
    for (const item of inputs) {
        const clean = normalizeRoomNumber(item);
        const claim = recentRoomClaims[clean];
        if (claim && claim.userId && (now - claim.timestamp < (claim.lockWindowMs || CLAIM_LOCK_WINDOW_MS))) {
            if (Number(claim.userId) !== Number(requestingUserId)) {
                const remainingMs = Math.max(0, (claim.lockWindowMs || CLAIM_LOCK_WINDOW_MS) - (now - claim.timestamp));
                return {
                    isLocked: true,
                    activeUser: {
                        userId: claim.userId,
                        userName: claim.userName,
                        role: claim.role
                    },
                    remainingMs,
                    room: clean
                };
            }
        }
    }
    return { isLocked: false };
}

/**
 * Check whether the requesting user already holds an active, unconsumed authorization lock
 * on any of the target rooms (used for idempotent repeat scans by the same faculty).
 *
 * @param {Array<string|number>|string|number} roomInputs
 * @param {number} requestingUserId
 * @param {number} [now]
 * @returns {boolean}
 */
function isSameActiveClaim(roomInputs, requestingUserId, now = Date.now()) {
    const inputs = Array.isArray(roomInputs) ? roomInputs : [roomInputs];
    for (const item of inputs) {
        const clean = normalizeRoomNumber(item);
        const claim = recentRoomClaims[clean];
        if (claim && claim.userId && (now - claim.timestamp < (claim.lockWindowMs || CLAIM_LOCK_WINDOW_MS))) {
            if (Number(claim.userId) === Number(requestingUserId)) {
                return true;
            }
        }
    }
    return false;
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

/**
 * Invalidate all in-memory claims associated with a given user across all rooms.
 * Called immediately upon a key retrieval event to prevent sibling slot claims.
 *
 * @param {number} userId
 */
function clearUserClaims(userId) {
    if (!userId) return;
    for (const key of Object.keys(recentRoomClaims)) {
        if (recentRoomClaims[key] && recentRoomClaims[key].userId === userId) {
            delete recentRoomClaims[key];
        }
    }
}

module.exports = {
    recordClaim,
    checkActiveClaimLock,
    isSameActiveClaim,
    getValidClaim,
    clearClaim,
    clearUserClaims,
    getAllClaims,
    clearAllClaims
};
