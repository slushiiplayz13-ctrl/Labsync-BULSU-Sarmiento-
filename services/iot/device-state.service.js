'use strict';

const { OFFLINE_THRESHOLD_MS, normalizeRoomNumber } = require('./iot.config');

/**
 * In-memory store for real-time IoT device heartbeats
 * Map<roomKey, timestampMs>
 */
const deviceLastSeen = {};

/**
 * In-memory store for latest physical slot events and sequence tracking
 * Map<cleanRoom, { seq: number, status: string, userId: number|null, timestamp: number }>
 */
const slotPhysicalEvents = {};

/**
 * In-memory store for deduplicating transport retry security alerts
 * Map<key, timestampMs>
 */
const recentSecurityAlerts = {};

/**
 * Record a heartbeat / activity timestamp for one or more room identifiers.
 * Updates both clean (normalized) and raw string keys.
 *
 * @param {Array<string|number>|string|number} rooms
 * @param {number} [timestamp]
 */
function recordDeviceSeen(rooms, timestamp = Date.now()) {
    const roomList = Array.isArray(rooms) ? rooms : [rooms];
    for (const r of roomList) {
        if (r === undefined || r === null) continue;
        const clean = normalizeRoomNumber(r);
        const raw = String(r);
        deviceLastSeen[clean] = timestamp;
        deviceLastSeen[raw] = timestamp;
    }
}

/**
 * Get the latest known timestamp (in epoch milliseconds) combining
 * the in-memory device heartbeat and the database Last_Seen timestamp.
 *
 * @param {string|number} roomNumber
 * @param {string|Date|null} [dbLastSeen]
 * @returns {number} Latest epoch timestamp (or 0 if never seen)
 */
function getLatestSeenTimestamp(roomNumber, dbLastSeen) {
    const clean = normalizeRoomNumber(roomNumber);
    const raw = String(roomNumber || '');
    const memTime = deviceLastSeen[clean] || deviceLastSeen[raw] || 0;
    const dbTime = dbLastSeen ? new Date(dbLastSeen).getTime() : 0;
    return Math.max(memTime, dbTime);
}

/**
 * Determine if an IoT device associated with a room is currently online.
 *
 * @param {string|number} roomNumber
 * @param {string|Date|null} [dbLastSeen]
 * @returns {boolean}
 */
function isDeviceOnline(roomNumber, dbLastSeen) {
    const now = Date.now();
    const latest = getLatestSeenTimestamp(roomNumber, dbLastSeen);
    return latest > 0 && (now - latest) <= OFFLINE_THRESHOLD_MS;
}

/**
 * Get the ISO string representation of the last seen timestamp.
 *
 * @param {string|number} roomNumber
 * @param {string|Date|null} [dbLastSeen]
 * @returns {string|null} ISO 8601 string or null
 */
function getLastSeen(roomNumber, dbLastSeen) {
    const latest = getLatestSeenTimestamp(roomNumber, dbLastSeen);
    return latest > 0 ? new Date(latest).toISOString() : null;
}

/**
 * Record the latest physical key event and monotonic sequence for a room slot.
 *
 * @param {string|number} roomNumber
 * @param {object} eventData
 * @param {number|null} [eventData.seq]
 * @param {string} eventData.status - 'Present' or 'Absent'
 * @param {number|null} [eventData.userId]
 * @param {number} [eventData.timestamp]
 */
function recordSlotPhysicalEvent(roomNumber, { seq = null, status, userId = null, timestamp = Date.now() }) {
    const clean = normalizeRoomNumber(roomNumber);
    const existing = slotPhysicalEvents[clean] || {};
    const parsedSeq = (seq !== null && seq !== undefined && !isNaN(Number(seq)))
        ? Number(seq)
        : (existing.seq !== undefined ? existing.seq + 1 : 1);

    slotPhysicalEvents[clean] = {
        seq: parsedSeq,
        status,
        userId: userId !== undefined ? userId : (existing.userId || null),
        timestamp
    };
}

/**
 * Get the last recorded physical event details for a room.
 *
 * @param {string|number} roomNumber
 * @returns {object|null}
 */
function getSlotPhysicalEvent(roomNumber) {
    const clean = normalizeRoomNumber(roomNumber);
    return slotPhysicalEvents[clean] || null;
}

/**
 * Check if a security alert is a duplicate retry within a given time window.
 *
 * @param {string|number} roomNumber
 * @param {string} alertType
 * @param {number} [windowMs=5000]
 * @returns {boolean}
 */
function isDuplicateSecurityAlert(roomNumber, alertType, windowMs = 5000) {
    const clean = normalizeRoomNumber(roomNumber);
    const key = `${clean}:${alertType}`;
    const now = Date.now();
    const lastAlert = recentSecurityAlerts[key];
    if (lastAlert && (now - lastAlert) < windowMs) {
        return true;
    }
    recentSecurityAlerts[key] = now;
    return false;
}

/**
 * Direct access to in-memory state dictionary (primarily for testing/debugging)
 */
function getDeviceLastSeenMap() {
    return { ...deviceLastSeen };
}

/**
 * Clear in-memory state (useful in test harnesses)
 */
function clearDeviceLastSeen() {
    for (const key of Object.keys(deviceLastSeen)) {
        delete deviceLastSeen[key];
    }
    for (const key of Object.keys(slotPhysicalEvents)) {
        delete slotPhysicalEvents[key];
    }
    for (const key of Object.keys(recentSecurityAlerts)) {
        delete recentSecurityAlerts[key];
    }
}

module.exports = {
    recordDeviceSeen,
    getLatestSeenTimestamp,
    isDeviceOnline,
    getLastSeen,
    recordSlotPhysicalEvent,
    getSlotPhysicalEvent,
    isDuplicateSecurityAlert,
    getDeviceLastSeenMap,
    clearDeviceLastSeen
};
