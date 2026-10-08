'use strict';

/**
 * services/roomLockService.js
 * In-memory collaborative editing lock manager for Schedule Studio.
 * Guarantees that only one administrator can edit a given Room + Academic Year + Semester at a time.
 * Single-instance Node.js architecture with ephemeral editSessionTokens and heartbeat TTLs.
 */

class RoomLockService {
    constructor() {
        this.locks = new Map();
        this.LOCK_TIMEOUT_MS = 30000; // 30-second lease
    }

    /**
     * Normalizes and returns the deterministic lock key: Room|AcademicYear|Semester
     */
    getLockKey(roomNumber, academicYear, semester) {
        const room = String(roomNumber || '').trim();
        const ay = String(academicYear || '').trim();
        const sem = String(semester || '').trim();
        return `${room}|${ay}|${sem}`;
    }

    /**
     * Atomically attempts to acquire an active edit lock for a specific room and term.
     * Guaranteed strictly synchronous to prevent race conditions in the Node.js event loop.
     *
     * @param {Object} params
     * @param {string|number} params.roomNumber
     * @param {string} params.academicYear
     * @param {string} params.semester
     * @param {number|string} params.userId
     * @param {string} params.userName
     * @param {string} params.userRole
     * @param {string} params.editSessionToken
     * @returns {Object} { acquired: boolean, lock?: Object, code?: string, lockedBy?: Object, remainingSeconds?: number }
     */
    acquireLock({ roomNumber, academicYear, semester, userId, userName, userRole, editSessionToken }) {
        if (!roomNumber || !academicYear || !semester || !editSessionToken) {
            return {
                acquired: false,
                code: 'INVALID_PARAMS',
                error: 'Room number, academic year, semester, and editSessionToken are required.'
            };
        }

        const key = this.getLockKey(roomNumber, academicYear, semester);
        const now = Date.now();
        const existing = this.locks.get(key);

        if (existing) {
            const isExpired = (now - existing.lastHeartbeat) >= this.LOCK_TIMEOUT_MS;
            const isSameSession = (existing.editSessionToken === editSessionToken);

            if (!isExpired && !isSameSession) {
                const remainingSeconds = Math.max(1, Math.ceil((this.LOCK_TIMEOUT_MS - (now - existing.lastHeartbeat)) / 1000));
                return {
                    acquired: false,
                    code: 'LOCKED',
                    lockedBy: {
                        userId: existing.userId,
                        userName: existing.userName,
                        userRole: existing.userRole
                    },
                    remainingSeconds
                };
            }
        }

        const lock = {
            key,
            roomNumber: String(roomNumber).trim(),
            academicYear: String(academicYear).trim(),
            semester: String(semester).trim(),
            userId,
            userName: userName || 'Administrator',
            userRole: userRole || 'IT Dept. Head',
            editSessionToken,
            acquiredAt: (existing && existing.editSessionToken === editSessionToken) ? existing.acquiredAt : now,
            lastHeartbeat: now
        };

        this.locks.set(key, lock);

        return {
            acquired: true,
            lock
        };
    }

    /**
     * Atomically forces acquisition of a lock (used during Reopen transition to guarantee IT Dept. Head lock).
     */
    forceAcquireLock({ roomNumber, academicYear, semester, userId, userName, userRole, editSessionToken }) {
        const key = this.getLockKey(roomNumber, academicYear, semester);
        const now = Date.now();
        const lock = {
            key,
            roomNumber: String(roomNumber).trim(),
            academicYear: String(academicYear).trim(),
            semester: String(semester).trim(),
            userId,
            userName: userName || 'Administrator',
            userRole: userRole || 'IT Dept. Head',
            editSessionToken,
            acquiredAt: now,
            lastHeartbeat: now
        };

        this.locks.set(key, lock);
        return { acquired: true, lock };
    }

    /**
     * Renews the heartbeat lease for an active editing session.
     * Rejects if the lock was expired and claimed by another session.
     */
    renewHeartbeat({ roomNumber, academicYear, semester, editSessionToken }) {
        const key = this.getLockKey(roomNumber, academicYear, semester);
        const now = Date.now();
        const existing = this.locks.get(key);

        if (!existing) {
            return {
                renewed: false,
                code: 'LOCK_NOT_FOUND',
                error: 'Editing lock not found or expired.'
            };
        }

        if (existing.editSessionToken !== editSessionToken) {
            return {
                renewed: false,
                code: 'LOCK_LOST',
                error: 'Your editing lock was lost or acquired by another session.',
                lockedBy: {
                    userName: existing.userName,
                    userRole: existing.userRole
                }
            };
        }

        const isExpired = (now - existing.lastHeartbeat) >= this.LOCK_TIMEOUT_MS;
        if (isExpired) {
            this.locks.delete(key);
            return {
                renewed: false,
                code: 'LOCK_EXPIRED',
                error: 'Your editing session lease expired due to inactivity.'
            };
        }

        existing.lastHeartbeat = now;
        return {
            renewed: true,
            lastHeartbeat: now
        };
    }

    /**
     * Explicitly releases a lock when leaving the editor.
     * Only succeeds if the editSessionToken matches the active owner.
     */
    releaseLock({ roomNumber, academicYear, semester, editSessionToken }) {
        const key = this.getLockKey(roomNumber, academicYear, semester);
        const existing = this.locks.get(key);

        if (!existing) {
            return { released: true, message: 'No active lock to release.' };
        }

        if (editSessionToken && existing.editSessionToken !== editSessionToken) {
            return {
                released: false,
                code: 'TOKEN_MISMATCH',
                error: 'Cannot release lock held by another session token.'
            };
        }

        this.locks.delete(key);
        return { released: true, message: 'Lock released successfully.' };
    }

    /**
     * Verifies whether a given session token currently holds a valid, unexpired lock.
     */
    verifyLock({ roomNumber, academicYear, semester, editSessionToken, userId }) {
        if (!roomNumber || !academicYear || !semester || !editSessionToken) {
            return false;
        }

        const key = this.getLockKey(roomNumber, academicYear, semester);
        const now = Date.now();
        const existing = this.locks.get(key);

        if (!existing) return false;

        if ((now - existing.lastHeartbeat) >= this.LOCK_TIMEOUT_MS) {
            this.locks.delete(key);
            return false;
        }

        if (existing.editSessionToken !== editSessionToken) {
            return false;
        }

        if (userId !== undefined && userId !== null && Number(existing.userId) !== Number(userId)) {
            return false;
        }

        // Auto-refresh heartbeat timestamp on active verified actions (e.g. Save)
        existing.lastHeartbeat = now;
        return true;
    }

    /**
     * Inspects active lock for a room and term (auto-prunes if expired).
     */
    getLock(roomNumber, academicYear, semester) {
        const key = this.getLockKey(roomNumber, academicYear, semester);
        const now = Date.now();
        const existing = this.locks.get(key);

        if (!existing) return null;

        if ((now - existing.lastHeartbeat) >= this.LOCK_TIMEOUT_MS) {
            this.locks.delete(key);
            return null;
        }

        return { ...existing };
    }

    /**
     * Returns a map of all currently active (non-expired) locks for a given academic term.
     * Keyed by roomNumber for rapid lookup in Master Schedule room cards.
     */
    getActiveLocksForTerm(academicYear, semester) {
        const now = Date.now();
        const result = {};
        const ay = (academicYear && typeof academicYear === 'string') ? academicYear.trim() : '';
        const sem = (semester && typeof semester === 'string') ? semester.trim() : '';

        for (const [key, lock] of this.locks.entries()) {
            if ((now - lock.lastHeartbeat) >= this.LOCK_TIMEOUT_MS) {
                this.locks.delete(key);
                continue;
            }

            if ((!ay || lock.academicYear === ay) && (!sem || lock.semester === sem)) {
                result[lock.roomNumber] = {
                    roomNumber: lock.roomNumber,
                    academicYear: lock.academicYear,
                    semester: lock.semester,
                    userName: lock.userName,
                    userRole: lock.userRole,
                    acquiredAt: lock.acquiredAt
                };
            }
        }

        return result;
    }

    /**
     * Clears all locks (used in tests or server maintenance).
     */
    clearAllLocks() {
        this.locks.clear();
    }
}

module.exports = new RoomLockService();
