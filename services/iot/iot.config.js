'use strict';

/**
 * IoT System Configuration & Constants
 */
const OFFLINE_THRESHOLD_MS = 15 * 1000; // 15 seconds (3 missed 5-second heartbeats)
const CLAIM_EXPIRATION_MS = 15 * 60 * 1000; // 15 minutes claim validity window
const DEFAULT_HARDWARE_ROOMS = ['203', '204']; // Default physical key box slots

/**
 * Authoritative room number normalization.
 * Normalizes room identifiers by trimming and removing any leading "RM" / "RM " prefix.
 * e.g. "RM 203" -> "203", "RM204" -> "204", "203" -> "203"
 *
 * @param {string|number} roomNumber
 * @returns {string} Clean numeric/alphanumeric room string
 */
function normalizeRoomNumber(roomNumber) {
    return String(roomNumber || '').trim().replace(/^RM\s*/i, '');
}

/**
 * Generates an array containing both clean and raw variations of room identifiers,
 * ensuring dictionary lookups and database queries match whichever format was used.
 *
 * @param {Array<string|number>|string|number} roomInputs
 * @returns {string[]} Array of distinct room key strings
 */
function getRoomKeyVariations(roomInputs) {
    const inputs = Array.isArray(roomInputs) ? roomInputs : [roomInputs];
    const keySet = new Set();

    for (const item of inputs) {
        if (item === undefined || item === null) continue;
        const raw = String(item).trim();
        if (!raw) continue;
        const clean = normalizeRoomNumber(raw);
        keySet.add(clean);
        keySet.add(raw);
    }

    return Array.from(keySet);
}

module.exports = {
    OFFLINE_THRESHOLD_MS,
    CLAIM_EXPIRATION_MS,
    DEFAULT_HARDWARE_ROOMS,
    normalizeRoomNumber,
    getRoomKeyVariations
};
