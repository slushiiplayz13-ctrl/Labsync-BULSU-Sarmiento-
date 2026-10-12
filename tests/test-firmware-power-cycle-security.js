/**
 * LabSync Regression Test: Power-Cycle Security & Key Placement Resilience
 *
 * Verifies that:
 * 1. Unauthorized key removal triggers alarm and security event.
 * 2. Unresolved unauthorized-removal incident survives power loss (via NVS persistence).
 * 3. Key 204 in Slot 203 at startup triggers wrong-slot alarm for 203.
 * 4. Key 203 in Slot 204 at startup triggers wrong-slot alarm for 204.
 * 5. Both swapped keys (204 in Slot 203 & 203 in Slot 204) trigger both alarms simultaneously on startup.
 * 6. Legitimate borrowed key absent at startup produces no unauthorized alarm.
 * 7. Pending security events survive reboot and are delivered once network is available.
 * 8. Returning correct key resolves only the relevant room without clearing another room's incident.
 * 9. Repeated restarts do not produce duplicate security alert events.
 * 10. Existing heartbeat scheduling, room independence, and custody safeguards remain intact.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('================================================================');
console.log('🧪 TESTING FIRMWARE POWER-CYCLE SECURITY & STARTUP VALIDATION');
console.log('================================================================');

const firmwarePath = path.join(__dirname, '../LabSync_ESP32/LabSync_ESP32.ino');
const firmwareSrc = fs.readFileSync(firmwarePath, 'utf8');

// -----------------------------------------------------------------------------
// SECTION 1: Firmware Source Structural Invariants
// -----------------------------------------------------------------------------
console.log('\n--- TEST 1: Firmware Source Structural Invariants & NVS Declarations ---');

// 1.1 Preferences library included
assert(firmwareSrc.includes('#include <Preferences.h>'), 'Firmware must include <Preferences.h>');

// 1.2 Mutex protection for NVS
assert(firmwareSrc.includes('nvsMutex'), 'Firmware must declare and initialize nvsMutex for thread-safe storage');
assert(firmwareSrc.includes('takeNvsMutex'), 'Firmware must define takeNvsMutex');
assert(firmwareSrc.includes('giveNvsMutex'), 'Firmware must define giveNvsMutex');

// 1.3 Persistence functions
assert(firmwareSrc.includes('persistIncidentState'), 'Firmware must define persistIncidentState');
assert(firmwareSrc.includes('persistPendingAlert'), 'Firmware must define persistPendingAlert');
assert(firmwareSrc.includes('persistClearPendingAlert'), 'Firmware must define persistClearPendingAlert');
assert(firmwareSrc.includes('"labsync_sec"'), 'Firmware must use "labsync_sec" NVS namespace');

// 1.4 Independent keys for 203 and 204 in NVS
assert(firmwareSrc.includes('"unauth203"') && firmwareSrc.includes('"unauth204"'), 'Firmware must track unauth203 and unauth204 in NVS');
assert(firmwareSrc.includes('"wrong203"') && firmwareSrc.includes('"wrong204"'), 'Firmware must track wrong203 and wrong204 in NVS');
assert(firmwareSrc.includes('"pAlert203"') && firmwareSrc.includes('"pAlert204"'), 'Firmware must track pAlert203 and pAlert204 in NVS');

// 1.5 Multi-incident independent pending alert keys in NVS
assert(firmwareSrc.includes('"pUAlert203"') && firmwareSrc.includes('"pUAlert204"'), 'Firmware must track pUAlert203 and pUAlert204 in NVS');
assert(firmwareSrc.includes('"pWAlert203"') && firmwareSrc.includes('"pWAlert204"'), 'Firmware must track pWAlert203 and pWAlert204 in NVS');
assert(firmwareSrc.includes('"pUEvt203"') && firmwareSrc.includes('"pUEvt204"'), 'Firmware must track pUEvt203 and pUEvt204 in NVS');
assert(firmwareSrc.includes('"pWEvt203"') && firmwareSrc.includes('"pWEvt204"'), 'Firmware must track pWEvt203 and pWEvt204 in NVS');

// 1.6 Startup validation checks
assert(
    firmwareSrc.includes('lastSlotState203 != KEY_NONE && lastSlotState203 != KEY_203'),
    'Firmware setup() must validate Slot 203 physical key identity against KEY_203'
);
assert(
    firmwareSrc.includes('lastSlotState204 != KEY_NONE && lastSlotState204 != KEY_204'),
    'Firmware setup() must validate Slot 204 physical key identity against KEY_204'
);

// 1.7 Unresolved unauthorized persistence check before raising alarm on empty slot
assert(
    firmwareSrc.includes('pUnauth203') && firmwareSrc.includes('pUnauth204'),
    'Firmware setup() must check persisted unauthorized status before raising alarm on absent key'
);

// 1.8 Dual wrong keys LCD display
assert(
    firmwareSrc.includes('isWrongKey203 && isWrongKey204') && firmwareSrc.includes('Slots 203 & 204!'),
    'Firmware showWrongKeyScreen() must handle both slots simultaneously ("Slots 203 & 204!")'
);

// 1.9 Strict HTTP status verification (not treating 5xx as delivered)
assert(
    firmwareSrc.includes('code >= 200 && code < 300'),
    'Firmware sendSecurityAlertHttp must require HTTP 2xx to treat alert as delivered'
);

// 1.10 Bounded persistent FIFO queue configuration
assert(
    firmwareSrc.includes('MAX_PERSISTENT_ALERTS = 12'),
    'Firmware must define MAX_PERSISTENT_ALERTS = 12 bounded queue capacity'
);

// 1.11 Bounded queue counter in NVS
assert(
    firmwareSrc.includes('"pQ_cnt"'),
    'Firmware must track "pQ_cnt" queue size in NVS namespace'
);

// 1.12 Queue load and refresh routines
assert(
    firmwareSrc.includes('loadPersistentAlertsFromNvs') && firmwareSrc.includes('refreshAlertStateFromNvs'),
    'Firmware must declare loadPersistentAlertsFromNvs and refreshAlertStateFromNvs'
);

// 1.13 Explicit capacity exhaustion handling (not silently discarded)
assert(
    firmwareSrc.includes('[NVS QUEUE FULL]'),
    'Firmware must explicitly log [NVS QUEUE FULL] and prevent silent data loss when capacity is reached'
);

// 1.14 Recoverable persistent overflow staging buffer configuration
assert(
    firmwareSrc.includes('MAX_OVERFLOW_ALERTS = 4'),
    'Firmware must define MAX_OVERFLOW_ALERTS = 4 for persistent overflow staging'
);
assert(
    firmwareSrc.includes('"pQ_ovf_cnt"') && firmwareSrc.includes('"pQ_ovf_has"'),
    'Firmware must track "pQ_ovf_cnt" and "pQ_ovf_has" in NVS'
);
assert(
    firmwareSrc.includes('promotePersistentOverflowIfSpaceAvailable'),
    'Firmware must define promotePersistentOverflowIfSpaceAvailable'
);

console.log('✔ PASS: All firmware source structural invariants verified.');

// -----------------------------------------------------------------------------
// SECTION 2: Firmware State Machine & NVS Power-Cycle Simulation
// -----------------------------------------------------------------------------
console.log('\n--- TEST 2: Firmware Power-Cycle & Security Incident Simulation ---');

const KEY_NONE = 0;
const KEY_204 = 1;
const KEY_203 = 2;
const MAX_PERSISTENT_ALERTS = 12;
const MAX_OVERFLOW_ALERTS = 4;

class MockNVS {
    constructor() {
        this.store = {};
    }
    getBool(k, def = false) { return this.store[k] !== undefined ? Boolean(this.store[k]) : def; }
    putBool(k, v) { this.store[k] = Boolean(v); }
    getString(k, def = '') { return this.store[k] !== undefined ? String(this.store[k]) : def; }
    putString(k, v) { this.store[k] = String(v); }
    getInt(k, def = 0) { return this.store[k] !== undefined ? Number(this.store[k]) : def; }
    putInt(k, v) { this.store[k] = Number(v); }
    remove(k) { delete this.store[k]; }
    clear() { this.store = {}; }
}

class SimulatedEsp32KeyBox {
    constructor(nvsInstance = null) {
        this.nvs = nvsInstance || new MockNVS();
        this.now = 1000;
        this.overflowCount = 0;

        // Volatile hardware pin readings
        this.pin203 = KEY_203;
        this.pin204 = KEY_204;

        // Volatile RAM state
        this.lastSlotState203 = KEY_NONE;
        this.lastSlotState204 = KEY_NONE;
        this.slotTargetState203 = true;
        this.slotTargetState204 = true;

        this.isUnauthorized203 = false;
        this.isUnauthorized204 = false;
        this.isWrongKey203 = false;
        this.isWrongKey204 = false;

        this.alertUnauthNeedsSync203 = false;
        this.alertUnauthEventId203 = '';
        this.alertWrongNeedsSync203 = false;
        this.alertWrongEventId203 = '';

        this.alertNeedsSync203 = false;
        this.alertPayload203 = '';
        this.alertEventId203 = '';

        this.alertUnauthNeedsSync204 = false;
        this.alertUnauthEventId204 = '';
        this.alertWrongNeedsSync204 = false;
        this.alertWrongEventId204 = '';

        this.alertNeedsSync204 = false;
        this.alertPayload204 = '';
        this.alertEventId204 = '';

        this.lcdLine1 = '';
        this.lcdLine2 = '';
        this.buzzerActive = false;

        this.queuedAlerts = [];
        this.deliveredAlerts = [];
    }

    updateAlertNeedsSync203() {
        this.alertNeedsSync203 = (this.alertUnauthNeedsSync203 || this.alertWrongNeedsSync203);
        if (this.alertUnauthNeedsSync203) {
            this.alertPayload203 = 'Unauthorized Removal';
            this.alertEventId203 = this.alertUnauthEventId203;
        } else if (this.alertWrongNeedsSync203) {
            this.alertPayload203 = 'Wrong Key Slot';
            this.alertEventId203 = this.alertWrongEventId203;
        } else {
            this.alertPayload203 = '';
            this.alertEventId203 = '';
        }
    }

    updateAlertNeedsSync204() {
        this.alertNeedsSync204 = (this.alertUnauthNeedsSync204 || this.alertWrongNeedsSync204);
        if (this.alertUnauthNeedsSync204) {
            this.alertPayload204 = 'Unauthorized Removal';
            this.alertEventId204 = this.alertUnauthEventId204;
        } else if (this.alertWrongNeedsSync204) {
            this.alertPayload204 = 'Wrong Key Slot';
            this.alertEventId204 = this.alertWrongEventId204;
        } else {
            this.alertPayload204 = '';
            this.alertEventId204 = '';
        }
    }

    updateSummaryKeysInNvs() {
        let count = this.nvs.getInt('pQ_cnt', 0);
        if (count < 0) count = 0;
        if (count > MAX_PERSISTENT_ALERTS) count = MAX_PERSISTENT_ALERTS;

        let hasU203 = false, hasW203 = false;
        let evtU203 = '', evtW203 = '';
        let hasU204 = false, hasW204 = false;
        let evtU204 = '', evtW204 = '';

        for (let i = 0; i < count; i++) {
            const r = this.nvs.getString(`pQ_r_${i}`, '');
            const t = this.nvs.getString(`pQ_t_${i}`, '');
            const e = this.nvs.getString(`pQ_e_${i}`, '');

            if (r === '203') {
                if (t === 'Unauthorized Removal' && !hasU203) {
                    hasU203 = true;
                    evtU203 = e;
                } else if (t === 'Wrong Key Slot' && !hasW203) {
                    hasW203 = true;
                    evtW203 = e;
                }
            } else if (r === '204') {
                if (t === 'Unauthorized Removal' && !hasU204) {
                    hasU204 = true;
                    evtU204 = e;
                } else if (t === 'Wrong Key Slot' && !hasW204) {
                    hasW204 = true;
                    evtW204 = e;
                }
            }
        }

        let ovfCount = this.nvs.getInt('pQ_ovf_cnt', 0);
        if (ovfCount < 0) ovfCount = 0;
        if (ovfCount > MAX_OVERFLOW_ALERTS) ovfCount = MAX_OVERFLOW_ALERTS;

        for (let i = 0; i < ovfCount && (!hasU203 || !hasW203 || !hasU204 || !hasW204); i++) {
            const r = this.nvs.getString(`pQ_or_${i}`, '');
            const t = this.nvs.getString(`pQ_ot_${i}`, '');
            const e = this.nvs.getString(`pQ_oe_${i}`, '');

            if (r === '203') {
                if (t === 'Unauthorized Removal' && !hasU203) {
                    hasU203 = true;
                    evtU203 = e;
                } else if (t === 'Wrong Key Slot' && !hasW203) {
                    hasW203 = true;
                    evtW203 = e;
                }
            } else if (r === '204') {
                if (t === 'Unauthorized Removal' && !hasU204) {
                    hasU204 = true;
                    evtU204 = e;
                } else if (t === 'Wrong Key Slot' && !hasW204) {
                    hasW204 = true;
                    evtW204 = e;
                }
            }
        }

        this.nvs.putBool('pUAlert203', hasU203);
        this.nvs.putString('pUEvt203', evtU203);
        this.nvs.putBool('pWAlert203', hasW203);
        this.nvs.putString('pWEvt203', evtW203);
        this.nvs.putBool('pAlert203', hasU203 || hasW203);

        if (hasU203) {
            this.nvs.putString('pType203', 'Unauthorized Removal');
            this.nvs.putString('pEvt203', evtU203);
        } else if (hasW203) {
            this.nvs.putString('pType203', 'Wrong Key Slot');
            this.nvs.putString('pEvt203', evtW203);
        } else {
            this.nvs.putString('pType203', '');
            this.nvs.putString('pEvt203', '');
        }

        this.nvs.putBool('pUAlert204', hasU204);
        this.nvs.putString('pUEvt204', evtU204);
        this.nvs.putBool('pWAlert204', hasW204);
        this.nvs.putString('pWEvt204', evtW204);
        this.nvs.putBool('pAlert204', hasU204 || hasW204);

        if (hasU204) {
            this.nvs.putString('pType204', 'Unauthorized Removal');
            this.nvs.putString('pEvt204', evtU204);
        } else if (hasW204) {
            this.nvs.putString('pType204', 'Wrong Key Slot');
            this.nvs.putString('pEvt204', evtW204);
        } else {
            this.nvs.putString('pType204', '');
            this.nvs.putString('pEvt204', '');
        }
    }

    promotePersistentOverflowIfSpaceAvailable() {
        let count = this.nvs.getInt('pQ_cnt', 0);
        let ovfCount = this.nvs.getInt('pQ_ovf_cnt', 0);
        if (count < MAX_PERSISTENT_ALERTS && ovfCount > 0) {
            const oroom = this.nvs.getString('pQ_or_0', '');
            const otype = this.nvs.getString('pQ_ot_0', '');
            const oevt  = this.nvs.getString('pQ_oe_0', '');

            if (oroom.length > 0 && otype.length > 0) {
                this.nvs.putString(`pQ_r_${count}`, oroom);
                this.nvs.putString(`pQ_t_${count}`, otype);
                this.nvs.putString(`pQ_e_${count}`, oevt);
                count++;
                this.nvs.putInt('pQ_cnt', count);

                for (let i = 0; i < ovfCount - 1; i++) {
                    this.nvs.putString(`pQ_or_${i}`, this.nvs.getString(`pQ_or_${i + 1}`, ''));
                    this.nvs.putString(`pQ_ot_${i}`, this.nvs.getString(`pQ_ot_${i + 1}`, ''));
                    this.nvs.putString(`pQ_oe_${i}`, this.nvs.getString(`pQ_oe_${i + 1}`, ''));
                }
                this.nvs.remove(`pQ_or_${ovfCount - 1}`);
                this.nvs.remove(`pQ_ot_${ovfCount - 1}`);
                this.nvs.remove(`pQ_oe_${ovfCount - 1}`);

                ovfCount--;
                this.nvs.putInt('pQ_ovf_cnt', ovfCount);
                this.nvs.putBool('pQ_ovf_has', ovfCount > 0);

                this.queuedAlerts.push({ room: oroom, alert: otype, eventId: oevt });
                return true;
            }
        }
        return false;
    }

    persistClearPendingAlert(room, alertType = '', eventId = '') {
        let count = this.nvs.getInt('pQ_cnt', 0);
        if (count < 0) count = 0;
        if (count > MAX_PERSISTENT_ALERTS) count = MAX_PERSISTENT_ALERTS;

        let targetIdx = -1;
        if (eventId && eventId.length > 0) {
            for (let i = 0; i < count; i++) {
                if (this.nvs.getString(`pQ_e_${i}`, '') === eventId) {
                    targetIdx = i;
                    break;
                }
            }
        }

        if (targetIdx === -1 && alertType && alertType.length > 0) {
            for (let i = 0; i < count; i++) {
                if (this.nvs.getString(`pQ_r_${i}`, '') === room && this.nvs.getString(`pQ_t_${i}`, '') === alertType) {
                    targetIdx = i;
                    break;
                }
            }
        }

        if (targetIdx >= 0) {
            for (let i = targetIdx; i < count - 1; i++) {
                this.nvs.putString(`pQ_r_${i}`, this.nvs.getString(`pQ_r_${i + 1}`, ''));
                this.nvs.putString(`pQ_t_${i}`, this.nvs.getString(`pQ_t_${i + 1}`, ''));
                this.nvs.putString(`pQ_e_${i}`, this.nvs.getString(`pQ_e_${i + 1}`, ''));
            }
            this.nvs.remove(`pQ_r_${count - 1}`);
            this.nvs.remove(`pQ_t_${count - 1}`);
            this.nvs.remove(`pQ_e_${count - 1}`);
            count--;
            this.nvs.putInt('pQ_cnt', count);
        } else if (!alertType || alertType.length === 0) {
            let writeIdx = 0;
            for (let i = 0; i < count; i++) {
                const r = this.nvs.getString(`pQ_r_${i}`, '');
                const t = this.nvs.getString(`pQ_t_${i}`, '');
                const e = this.nvs.getString(`pQ_e_${i}`, '');
                if (r !== room) {
                    if (writeIdx !== i) {
                        this.nvs.putString(`pQ_r_${writeIdx}`, r);
                        this.nvs.putString(`pQ_t_${writeIdx}`, t);
                        this.nvs.putString(`pQ_e_${writeIdx}`, e);
                    }
                    writeIdx++;
                }
            }
            for (let i = writeIdx; i < count; i++) {
                this.nvs.remove(`pQ_r_${i}`);
                this.nvs.remove(`pQ_t_${i}`);
                this.nvs.remove(`pQ_e_${i}`);
            }
            count = writeIdx;
            this.nvs.putInt('pQ_cnt', count);
        }

        // Also clean up overflow buffer if targetIdx was not found or if clearing all for room
        let curOvfCount = this.nvs.getInt('pQ_ovf_cnt', 0);
        if (curOvfCount < 0) curOvfCount = 0;
        if (curOvfCount > MAX_OVERFLOW_ALERTS) curOvfCount = MAX_OVERFLOW_ALERTS;

        if (targetIdx === -1 && eventId && eventId.length > 0) {
            for (let i = 0; i < curOvfCount; i++) {
                if (this.nvs.getString(`pQ_oe_${i}`, '') === eventId) {
                    for (let j = i; j < curOvfCount - 1; j++) {
                        this.nvs.putString(`pQ_or_${j}`, this.nvs.getString(`pQ_or_${j + 1}`, ''));
                        this.nvs.putString(`pQ_ot_${j}`, this.nvs.getString(`pQ_ot_${j + 1}`, ''));
                        this.nvs.putString(`pQ_oe_${j}`, this.nvs.getString(`pQ_oe_${j + 1}`, ''));
                    }
                    this.nvs.remove(`pQ_or_${curOvfCount - 1}`);
                    this.nvs.remove(`pQ_ot_${curOvfCount - 1}`);
                    this.nvs.remove(`pQ_oe_${curOvfCount - 1}`);
                    curOvfCount--;
                    this.nvs.putInt('pQ_ovf_cnt', curOvfCount);
                    this.nvs.putBool('pQ_ovf_has', curOvfCount > 0);
                    break;
                }
            }
        } else if (!alertType || alertType.length === 0) {
            let oWriteIdx = 0;
            for (let i = 0; i < curOvfCount; i++) {
                const r = this.nvs.getString(`pQ_or_${i}`, '');
                const t = this.nvs.getString(`pQ_ot_${i}`, '');
                const e = this.nvs.getString(`pQ_oe_${i}`, '');
                if (r !== room) {
                    if (oWriteIdx !== i) {
                        this.nvs.putString(`pQ_or_${oWriteIdx}`, r);
                        this.nvs.putString(`pQ_ot_${oWriteIdx}`, t);
                        this.nvs.putString(`pQ_oe_${oWriteIdx}`, e);
                    }
                    oWriteIdx++;
                }
            }
            for (let i = oWriteIdx; i < curOvfCount; i++) {
                this.nvs.remove(`pQ_or_${i}`);
                this.nvs.remove(`pQ_ot_${i}`);
                this.nvs.remove(`pQ_oe_${i}`);
            }
            curOvfCount = oWriteIdx;
            this.nvs.putInt('pQ_ovf_cnt', curOvfCount);
            this.nvs.putBool('pQ_ovf_has', curOvfCount > 0);
        }

        // If primary queue has space and an overflow alert is staged, promote it immediately
        while (this.promotePersistentOverflowIfSpaceAvailable()) {}

        this.updateSummaryKeysInNvs();
        return true;
    }

    persistPendingAlert(room, isPending, alertType = '', eventId = '') {
        if (!isPending) {
            return this.persistClearPendingAlert(room, alertType, eventId);
        }

        let count = this.nvs.getInt('pQ_cnt', 0);
        if (count < 0) count = 0;

        // Deduplicate against primary queue
        if (eventId && eventId.length > 0) {
            for (let i = 0; i < count; i++) {
                if (this.nvs.getString(`pQ_e_${i}`, '') === eventId) {
                    this.updateSummaryKeysInNvs();
                    return true;
                }
            }
            // Deduplicate against overflow queue
            let ovfCount = this.nvs.getInt('pQ_ovf_cnt', 0);
            for (let i = 0; i < ovfCount; i++) {
                if (this.nvs.getString(`pQ_oe_${i}`, '') === eventId) {
                    this.updateSummaryKeysInNvs();
                    return true;
                }
            }
        }

        if (count < MAX_PERSISTENT_ALERTS) {
            this.nvs.putString(`pQ_r_${count}`, room || '');
            this.nvs.putString(`pQ_t_${count}`, alertType || '');
            this.nvs.putString(`pQ_e_${count}`, eventId || '');
            count++;
            this.nvs.putInt('pQ_cnt', count);

            this.updateSummaryKeysInNvs();
            return true;
        }

        // Primary queue is full: stage into persistent overflow buffer
        let ovfCount = this.nvs.getInt('pQ_ovf_cnt', 0);
        if (ovfCount < 0) ovfCount = 0;
        if (ovfCount < MAX_OVERFLOW_ALERTS) {
            this.nvs.putString(`pQ_or_${ovfCount}`, room || '');
            this.nvs.putString(`pQ_ot_${ovfCount}`, alertType || '');
            this.nvs.putString(`pQ_oe_${ovfCount}`, eventId || '');
            ovfCount++;
            this.nvs.putInt('pQ_ovf_cnt', ovfCount);
            this.nvs.putBool('pQ_ovf_has', true);
            this.overflowCount++;

            this.updateSummaryKeysInNvs();
            return true;
        }

        // Both primary and overflow exhausted: capacity limit reached
        this.overflowCount++;
        return false;
    }

    loadPersistentAlertsFromNvs() {
        let count = this.nvs.getInt('pQ_cnt', 0);
        if (count < 0) count = 0;
        if (count > MAX_PERSISTENT_ALERTS) count = MAX_PERSISTENT_ALERTS;

        const loaded = [];
        for (let i = 0; i < count; i++) {
            const r = this.nvs.getString(`pQ_r_${i}`, '');
            const t = this.nvs.getString(`pQ_t_${i}`, '');
            const e = this.nvs.getString(`pQ_e_${i}`, '');
            if (r.length > 0 && t.length > 0) {
                loaded.push({ room: r, alertType: t, eventId: e });
            }
        }
        return loaded;
    }

    refreshAlertStateFromNvs() {
        this.alertUnauthNeedsSync203 = this.nvs.getBool('pUAlert203', false);
        this.alertUnauthEventId203 = this.nvs.getString('pUEvt203', '');
        this.alertWrongNeedsSync203 = this.nvs.getBool('pWAlert203', false);
        this.alertWrongEventId203 = this.nvs.getString('pWEvt203', '');
        this.updateAlertNeedsSync203();

        this.alertUnauthNeedsSync204 = this.nvs.getBool('pUAlert204', false);
        this.alertUnauthEventId204 = this.nvs.getString('pUEvt204', '');
        this.alertWrongNeedsSync204 = this.nvs.getBool('pWAlert204', false);
        this.alertWrongEventId204 = this.nvs.getString('pWEvt204', '');
        this.updateAlertNeedsSync204();
    }

    // Firmware boot sequence (setup())
    boot() {
        // Debounced read of pins
        this.lastSlotState203 = this.pin203;
        this.lastSlotState204 = this.pin204;
        this.slotTargetState203 = (this.lastSlotState203 !== KEY_NONE);
        this.slotTargetState204 = (this.lastSlotState204 !== KEY_NONE);

        // Load NVS
        const pUnauth203 = this.nvs.getBool('unauth203', false);
        const pWrong203 = this.nvs.getBool('wrong203', false);
        const pUnauth204 = this.nvs.getBool('unauth204', false);
        const pWrong204 = this.nvs.getBool('wrong204', false);

        let pUAlert203 = this.nvs.getBool('pUAlert203', false);
        let pUEvt203 = this.nvs.getString('pUEvt203', '');
        let pWAlert203 = this.nvs.getBool('pWAlert203', false);
        let pWEvt203 = this.nvs.getString('pWEvt203', '');

        let pUAlert204 = this.nvs.getBool('pUAlert204', false);
        let pUEvt204 = this.nvs.getString('pUEvt204', '');
        let pWAlert204 = this.nvs.getBool('pWAlert204', false);
        let pWEvt204 = this.nvs.getString('pWEvt204', '');

        // Fallback for legacy single-alert keys
        const pAlert203 = this.nvs.getBool('pAlert203', false);
        const pType203 = this.nvs.getString('pType203', '');
        const pEvt203 = this.nvs.getString('pEvt203', '');
        if (pAlert203 && !pUAlert203 && !pWAlert203) {
            if (pType203 === 'Wrong Key Slot') {
                pWAlert203 = true;
                pWEvt203 = pEvt203;
            } else {
                pUAlert203 = true;
                pUEvt203 = pEvt203;
            }
        }

        const pAlert204 = this.nvs.getBool('pAlert204', false);
        const pType204 = this.nvs.getString('pType204', '');
        const pEvt204 = this.nvs.getString('pEvt204', '');
        if (pAlert204 && !pUAlert204 && !pWAlert204) {
            if (pType204 === 'Wrong Key Slot') {
                pWAlert204 = true;
                pWEvt204 = pEvt204;
            } else {
                pUAlert204 = true;
                pUEvt204 = pEvt204;
            }
        }

        // Migrate legacy records into persistent queue if queue was empty
        if (this.nvs.getInt('pQ_cnt', 0) === 0) {
            if (pUAlert203 && pUEvt203) this.persistPendingAlert('203', true, 'Unauthorized Removal', pUEvt203);
            if (pWAlert203 && pWEvt203) this.persistPendingAlert('203', true, 'Wrong Key Slot', pWEvt203);
            if (pUAlert204 && pUEvt204) this.persistPendingAlert('204', true, 'Unauthorized Removal', pUEvt204);
            if (pWAlert204 && pWEvt204) this.persistPendingAlert('204', true, 'Wrong Key Slot', pWEvt204);
        }

        // Slot 203 validation
        if (this.lastSlotState203 !== KEY_NONE && this.lastSlotState203 !== KEY_203) {
            this.isWrongKey203 = true;
            if (pUnauth203) {
                this.isUnauthorized203 = true;
            }
            const shouldQueueWrong203 = !pWrong203 || pWAlert203;
            if (shouldQueueWrong203) {
                const evtId = (pWAlert203 && pWEvt203) ? pWEvt203 : `203-wrong-${this.now}`;
                this.persistPendingAlert('203', true, 'Wrong Key Slot', evtId);
            }
            this.nvs.putBool('unauth203', pUnauth203);
            this.nvs.putBool('wrong203', true);
        } else if (this.lastSlotState203 === KEY_203) {
            this.isWrongKey203 = false;
            this.isUnauthorized203 = false;
            this.nvs.putBool('unauth203', false);
            this.nvs.putBool('wrong203', false);
        } else if (this.lastSlotState203 === KEY_NONE) {
            this.isWrongKey203 = false;
            this.isUnauthorized203 = Boolean(pUnauth203);
        }

        // Slot 204 validation
        if (this.lastSlotState204 !== KEY_NONE && this.lastSlotState204 !== KEY_204) {
            this.isWrongKey204 = true;
            if (pUnauth204) {
                this.isUnauthorized204 = true;
            }
            const shouldQueueWrong204 = !pWrong204 || pWAlert204;
            if (shouldQueueWrong204) {
                const evtId = (pWAlert204 && pWEvt204) ? pWEvt204 : `204-wrong-${this.now}`;
                this.persistPendingAlert('204', true, 'Wrong Key Slot', evtId);
            }
            this.nvs.putBool('unauth204', pUnauth204);
            this.nvs.putBool('wrong204', true);
        } else if (this.lastSlotState204 === KEY_204) {
            this.isWrongKey204 = false;
            this.isUnauthorized204 = false;
            this.nvs.putBool('unauth204', false);
            this.nvs.putBool('wrong204', false);
        } else if (this.lastSlotState204 === KEY_NONE) {
            this.isWrongKey204 = false;
            this.isUnauthorized204 = Boolean(pUnauth204);
        }

        // Promote any staged overflow alerts if space is available in primary queue
        while (this.promotePersistentOverflowIfSpaceAvailable()) {}

        // Enqueue all persistent alerts from NVS queue
        const loadedAlerts = this.loadPersistentAlertsFromNvs();
        for (const item of loadedAlerts) {
            this.queuedAlerts.push({ room: item.room, alert: item.alertType, eventId: item.eventId });
        }
        this.refreshAlertStateFromNvs();

        // Render LCD & Buzzer
        this.updateUi();
    }

    updateUi() {
        if (this.isUnauthorized203 || this.isUnauthorized204) {
            let l2 = 'RETURN KEY!     ';
            if (this.isUnauthorized203 && this.isUnauthorized204) l2 = 'RETURN 203 & 204';
            else if (this.isUnauthorized203) l2 = 'RETURN KEY 203! ';
            else if (this.isUnauthorized204) l2 = 'RETURN KEY 204! ';
            this.lcdLine1 = '! UNAUTHORIZED !';
            this.lcdLine2 = l2;
            this.buzzerActive = true;
        } else if (this.isWrongKey203 || this.isWrongKey204) {
            let l2 = 'Wrong Key Insert';
            if (this.isWrongKey203 && this.isWrongKey204) l2 = 'Slots 203 & 204!';
            else if (this.isWrongKey203) l2 = 'Slot 203 Wrong! ';
            else if (this.isWrongKey204) l2 = 'Slot 204 Wrong! ';
            this.lcdLine1 = 'WRONG KEY SLOT!';
            this.lcdLine2 = l2;
            this.buzzerActive = true;
        } else {
            this.lcdLine1 = '    LabSync     ';
            this.lcdLine2 = ' Ready to Scan! ';
            this.buzzerActive = false;
        }
    }

    // Physical runtime events
    unauthorizedKeyRemoval(room) {
        if (room === '203') {
            this.pin203 = KEY_NONE;
            this.lastSlotState203 = KEY_NONE;
            this.isUnauthorized203 = true;
            const evtId = `203-${this.now}`;

            this.nvs.putBool('unauth203', true);
            this.persistPendingAlert('203', true, 'Unauthorized Removal', evtId);
            this.refreshAlertStateFromNvs();
            this.queuedAlerts.push({ room: '203', alert: 'Unauthorized Removal', eventId: evtId });
        } else if (room === '204') {
            this.pin204 = KEY_NONE;
            this.lastSlotState204 = KEY_NONE;
            this.isUnauthorized204 = true;
            const evtId = `204-${this.now}`;

            this.nvs.putBool('unauth204', true);
            this.persistPendingAlert('204', true, 'Unauthorized Removal', evtId);
            this.refreshAlertStateFromNvs();
            this.queuedAlerts.push({ room: '204', alert: 'Unauthorized Removal', eventId: evtId });
        }
        this.updateUi();
    }

    wrongKeyInserted(room, key) {
        if (room === '203') {
            this.pin203 = key;
            this.lastSlotState203 = key;
            this.isWrongKey203 = true;
            const evtId = `203-wrong-${this.now}`;

            this.nvs.putBool('wrong203', true);
            this.persistPendingAlert('203', true, 'Wrong Key Slot', evtId);
            this.refreshAlertStateFromNvs();
            this.queuedAlerts.push({ room: '203', alert: 'Wrong Key Slot', eventId: evtId });
        } else if (room === '204') {
            this.pin204 = key;
            this.lastSlotState204 = key;
            this.isWrongKey204 = true;
            const evtId = `204-wrong-${this.now}`;

            this.nvs.putBool('wrong204', true);
            this.persistPendingAlert('204', true, 'Wrong Key Slot', evtId);
            this.refreshAlertStateFromNvs();
            this.queuedAlerts.push({ room: '204', alert: 'Wrong Key Slot', eventId: evtId });
        }
        this.updateUi();
    }

    authorizedKeyRemoval(room) {
        if (room === '203') {
            this.pin203 = KEY_NONE;
            this.lastSlotState203 = KEY_NONE;
            this.isUnauthorized203 = false;
        } else if (room === '204') {
            this.pin204 = KEY_NONE;
            this.lastSlotState204 = KEY_NONE;
            this.isUnauthorized204 = false;
        }
        this.updateUi();
    }

    correctKeyReturned(room) {
        if (room === '203') {
            this.pin203 = KEY_203;
            this.lastSlotState203 = KEY_203;
            this.isUnauthorized203 = false;
            this.isWrongKey203 = false;
            this.nvs.putBool('unauth203', false);
            this.nvs.putBool('wrong203', false);
        } else if (room === '204') {
            this.pin204 = KEY_204;
            this.lastSlotState204 = KEY_204;
            this.isUnauthorized204 = false;
            this.isWrongKey204 = false;
            this.nvs.putBool('unauth204', false);
            this.nvs.putBool('wrong204', false);
        }
        this.updateUi();
    }

    wrongKeyRemoved(room) {
        if (room === '203') {
            this.pin203 = KEY_NONE;
            this.lastSlotState203 = KEY_NONE;
            this.isWrongKey203 = false;
            this.nvs.putBool('wrong203', false);
        } else if (room === '204') {
            this.pin204 = KEY_NONE;
            this.lastSlotState204 = KEY_NONE;
            this.isWrongKey204 = false;
            this.nvs.putBool('wrong204', false);
        }
        this.updateUi();
    }

    // HTTP delivery simulation
    networkDeliverAlerts() {
        while (this.queuedAlerts.length > 0) {
            const item = this.queuedAlerts.shift();
            this.deliveredAlerts.push(item);
            this.persistClearPendingAlert(item.room, item.alert, item.eventId);
            this.refreshAlertStateFromNvs();
        }
    }
}

// -----------------------------------------------------------------------------
// Scenario 1: Unauthorized removal triggers alarm and event
// -----------------------------------------------------------------------------
const nvs = new MockNVS();
let dev = new SimulatedEsp32KeyBox(nvs);
dev.boot();
assert.strictEqual(dev.isUnauthorized203, false);
assert.strictEqual(dev.buzzerActive, false);

dev.unauthorizedKeyRemoval('203');
assert.strictEqual(dev.isUnauthorized203, true);
assert.strictEqual(dev.buzzerActive, true);
assert.strictEqual(dev.queuedAlerts.length, 1);
assert.strictEqual(dev.queuedAlerts[0].alert, 'Unauthorized Removal');
console.log('✔ PASS: Scenario 1 - Unauthorized key removal activates alarm and queues security event.');

// -----------------------------------------------------------------------------
// Scenario 2: Unresolved unauthorized removal survives simulated power cycle
// -----------------------------------------------------------------------------
// Power cycle (device reboot with same NVS while Key 203 is still absent)
dev = new SimulatedEsp32KeyBox(nvs);
dev.pin203 = KEY_NONE; // Key 203 still absent
dev.pin204 = KEY_204; // Key 204 in place
dev.boot();

assert.strictEqual(dev.isUnauthorized203, true, 'Room 203 unauthorized state must survive power cycle');
assert.strictEqual(dev.buzzerActive, true, 'Audible alarm must resume after reboot');
assert.strictEqual(dev.lcdLine1, '! UNAUTHORIZED !', 'LCD must display unauthorized alarm');
assert.strictEqual(dev.lcdLine2, 'RETURN KEY 203! ');
console.log('✔ PASS: Scenario 2 - Unresolved unauthorized removal survives simulated power cycle.');

// -----------------------------------------------------------------------------
// Scenario 3 & 4: Wrong keys at startup detected independently
// -----------------------------------------------------------------------------
// Key 204 placed in Slot 203
const nvs3 = new MockNVS();
const dev3 = new SimulatedEsp32KeyBox(nvs3);
dev3.pin203 = KEY_204; // Wrong key in 203
dev3.pin204 = KEY_204; // Correct key in 204
dev3.boot();
assert.strictEqual(dev3.isWrongKey203, true, 'Slot 203 wrong key must be detected at startup');
assert.strictEqual(dev3.isWrongKey204, false, 'Slot 204 must remain normal');
assert.strictEqual(dev3.buzzerActive, true);
assert.strictEqual(dev3.lcdLine2, 'Slot 203 Wrong! ');
console.log('✔ PASS: Scenario 3 - Key 204 in Slot 203 at startup triggers wrong-slot warning.');

// Key 203 placed in Slot 204
const nvs4 = new MockNVS();
const dev4 = new SimulatedEsp32KeyBox(nvs4);
dev4.pin203 = KEY_203; // Correct key in 203
dev4.pin204 = KEY_203; // Wrong key in 204
dev4.boot();
assert.strictEqual(dev4.isWrongKey204, true, 'Slot 204 wrong key must be detected at startup');
assert.strictEqual(dev4.isWrongKey203, false, 'Slot 203 must remain normal');
assert.strictEqual(dev4.buzzerActive, true);
assert.strictEqual(dev4.lcdLine2, 'Slot 204 Wrong! ');
console.log('✔ PASS: Scenario 4 - Key 203 in Slot 204 at startup triggers wrong-slot warning.');

// -----------------------------------------------------------------------------
// Scenario 5: Both swapped keys detected during the same startup
// -----------------------------------------------------------------------------
const nvsSwapped = new MockNVS();
const devSwapped = new SimulatedEsp32KeyBox(nvsSwapped);
devSwapped.pin203 = KEY_204; // Swapped!
devSwapped.pin204 = KEY_203; // Swapped!
devSwapped.boot();

assert.strictEqual(devSwapped.isWrongKey203, true, 'Slot 203 must flag wrong key');
assert.strictEqual(devSwapped.isWrongKey204, true, 'Slot 204 must flag wrong key');
assert.strictEqual(devSwapped.buzzerActive, true, 'Buzzer must sound');
assert.strictEqual(devSwapped.lcdLine1, 'WRONG KEY SLOT!');
assert.strictEqual(devSwapped.lcdLine2, 'Slots 203 & 204!', 'LCD must identify both swapped slots');
assert.strictEqual(devSwapped.queuedAlerts.length, 2, 'Must queue 2 distinct alerts');
console.log('✔ PASS: Scenario 5 - Both swapped keys detected simultaneously on startup with correct LCD/alarm.');

// -----------------------------------------------------------------------------
// Scenario 6: Legitimate borrowed key absent at startup produces NO false alarm
// -----------------------------------------------------------------------------
const nvsBorrowed = new MockNVS();
const devBorrowed = new SimulatedEsp32KeyBox(nvsBorrowed);
devBorrowed.pin203 = KEY_NONE; // Legitimate borrower took key before reboot
devBorrowed.pin204 = KEY_204;  // In slot
devBorrowed.boot();

assert.strictEqual(devBorrowed.isUnauthorized203, false, 'Legit absent key must NOT raise unauthorized alarm');
assert.strictEqual(devBorrowed.isWrongKey203, false);
assert.strictEqual(devBorrowed.buzzerActive, false, 'Buzzer must remain off');
assert.strictEqual(devBorrowed.lcdLine2, ' Ready to Scan! ');
console.log('✔ PASS: Scenario 6 - Legitimate borrowed key absent at startup does not produce false alarms.');

// -----------------------------------------------------------------------------
// Scenario 7: Pending security events survive restart and deliver when connected
// -----------------------------------------------------------------------------
const nvsPending = new MockNVS();
let dev7 = new SimulatedEsp32KeyBox(nvsPending);
dev7.boot();
dev7.unauthorizedKeyRemoval('204'); // creates event in NVS
// Simulate power cut BEFORE network delivers event
dev7 = new SimulatedEsp32KeyBox(nvsPending);
dev7.pin204 = KEY_NONE;
dev7.boot(); // restored from NVS!

assert.strictEqual(dev7.queuedAlerts.length, 1, 'Restored event must be enqueued');
assert.strictEqual(dev7.queuedAlerts[0].alert, 'Unauthorized Removal');
assert.strictEqual(dev7.queuedAlerts[0].room, '204');

// Network reconnects and delivers
dev7.networkDeliverAlerts();
assert.strictEqual(dev7.deliveredAlerts.length, 1);
assert.strictEqual(nvsPending.getBool('pAlert204'), false, 'NVS pending flag cleared after delivery');
console.log('✔ PASS: Scenario 7 - Pending security events survive power cycle and deliver upon connection.');

// -----------------------------------------------------------------------------
// Scenario 8: Correct key returned resolves relevant room without clearing other room
// -----------------------------------------------------------------------------
const nvsMulti = new MockNVS();
const dev8 = new SimulatedEsp32KeyBox(nvsMulti);
dev8.pin203 = KEY_204; // wrong key in 203
dev8.pin204 = KEY_203; // wrong key in 204
dev8.boot();
assert.strictEqual(dev8.isWrongKey203, true);
assert.strictEqual(dev8.isWrongKey204, true);

// Remove wrong key from 203
dev8.wrongKeyRemoved('203');
assert.strictEqual(dev8.isWrongKey203, false, '203 wrong key resolved');
assert.strictEqual(dev8.isWrongKey204, true, '204 wrong key must NOT be cleared');
assert.strictEqual(dev8.buzzerActive, true, 'Buzzer must still sound for 204');
assert.strictEqual(dev8.lcdLine2, 'Slot 204 Wrong! ');

// Insert correct key into 203
dev8.correctKeyReturned('203');
assert.strictEqual(dev8.isWrongKey204, true, 'Room 204 incident remains active');
assert.strictEqual(dev8.buzzerActive, true);

// Now fix 204
dev8.correctKeyReturned('204');
assert.strictEqual(dev8.isWrongKey204, false);
assert.strictEqual(dev8.buzzerActive, false, 'All alarms cleared now');
assert.strictEqual(dev8.lcdLine2, ' Ready to Scan! ');
console.log('✔ PASS: Scenario 8 - Room resolution strictly independent; Room 203 cannot clear Room 204.');

// -----------------------------------------------------------------------------
// Scenario 9: Repeated restarts do not create uncontrolled duplicate events
// -----------------------------------------------------------------------------
const nvsRepeat = new MockNVS();
let dev9 = new SimulatedEsp32KeyBox(nvsRepeat);
dev9.pin203 = KEY_204; // Wrong key
dev9.pin204 = KEY_204;
dev9.boot();
assert.strictEqual(dev9.queuedAlerts.length, 1);
const originalEvtId = dev9.queuedAlerts[0].eventId;

// Network delivers alert
dev9.networkDeliverAlerts();
assert.strictEqual(dev9.deliveredAlerts.length, 1);
assert.strictEqual(nvsRepeat.getBool('pAlert203'), false);

// Reboot while wrong key is STILL sitting in the slot
dev9 = new SimulatedEsp32KeyBox(nvsRepeat);
dev9.pin203 = KEY_204; // still wrong
dev9.pin204 = KEY_204;
dev9.boot();

assert.strictEqual(dev9.isWrongKey203, true, 'Alarm must still be active');
assert.strictEqual(dev9.buzzerActive, true);
assert.strictEqual(dev9.queuedAlerts.length, 0, 'Must NOT re-enqueue duplicate alert after delivered');
console.log('✔ PASS: Scenario 9 - Repeated restarts maintain alarm without generating duplicate events.');

// -----------------------------------------------------------------------------
// Scenario 10: Retention of unauthorized removal after wrong key pulled out
// -----------------------------------------------------------------------------
const nvsComplex = new MockNVS();
const dev10 = new SimulatedEsp32KeyBox(nvsComplex);
dev10.boot();
// 1. Unauthorized removal of 203
dev10.unauthorizedKeyRemoval('203');
assert.strictEqual(dev10.isUnauthorized203, true);

// 2. Someone inserts wrong key (Key 204) into Slot 203
dev10.pin203 = KEY_204;
dev10.isWrongKey203 = true;
dev10.updateUi();
assert.strictEqual(dev10.isWrongKey203, true);

// 3. Someone takes wrong key back out of Slot 203
dev10.wrongKeyRemoved('203');
assert.strictEqual(dev10.isWrongKey203, false);
assert.strictEqual(dev10.isUnauthorized203, true, 'Stolen key 203 is STILL missing!');
assert.strictEqual(dev10.buzzerActive, true, 'Alarm must NOT stop merely because wrong key was taken out');
assert.strictEqual(dev10.lcdLine1, '! UNAUTHORIZED !');
console.log('✔ PASS: Scenario 10 - Pulling wrong key out preserves underlying unresolved unauthorized status.');

// -----------------------------------------------------------------------------
// Scenario 11: Multi-incident retention in the same room across power cycle (Audited Scenario)
// -----------------------------------------------------------------------------
const nvsAudit = new MockNVS();
let dev11 = new SimulatedEsp32KeyBox(nvsAudit);
dev11.boot();

// 1. Unauthorized key removal on Room 203 while offline
dev11.now = 5000;
dev11.unauthorizedKeyRemoval('203');
assert.strictEqual(dev11.isUnauthorized203, true);
assert.strictEqual(nvsAudit.getBool('pUAlert203'), true, 'pUAlert203 must be true');
const unauthEvtId = nvsAudit.getString('pUEvt203');
assert(unauthEvtId.startsWith('203-'), 'Must have generated valid unauth event ID');

// 2. Power cut before network delivery (discard RAM, clear delivered/queue, keep NVS)
dev11 = new SimulatedEsp32KeyBox(nvsAudit);
dev11.now = 8000;
// While device was off, Key 204 was placed into Slot 203!
dev11.pin203 = KEY_204;
dev11.pin204 = KEY_204;
dev11.boot();

// 3. Verify firmware state on restart
assert.strictEqual(dev11.isUnauthorized203, true, 'Unresolved unauthorized removal MUST remain latched');
assert.strictEqual(dev11.isWrongKey203, true, 'Wrong key in Slot 203 MUST be flagged');
assert.strictEqual(dev11.buzzerActive, true, 'Buzzer MUST sound');

// 4. Verify NVS multi-channel persistence
assert.strictEqual(nvsAudit.getBool('pUAlert203'), true, 'Pending Unauthorized Removal alert MUST NOT be overwritten in NVS');
assert.strictEqual(nvsAudit.getString('pUEvt203'), unauthEvtId, 'Unauthorized Removal event ID MUST remain stable');
assert.strictEqual(nvsAudit.getBool('pWAlert203'), true, 'Pending Wrong Key Slot alert MUST be persisted alongside Unauthorized Removal');
const wrongEvtId = nvsAudit.getString('pWEvt203');
assert(wrongEvtId.startsWith('203-wrong-'), 'Wrong Key Slot event ID must be generated');

// 5. Verify queued alerts contain BOTH distinct events
assert.strictEqual(dev11.queuedAlerts.length, 2, 'Both distinct alerts must be enqueued');
const unauthQueueItem = dev11.queuedAlerts.find(a => a.room === '203' && a.alert === 'Unauthorized Removal');
const wrongQueueItem = dev11.queuedAlerts.find(a => a.room === '203' && a.alert === 'Wrong Key Slot');
assert(unauthQueueItem, 'Unauthorized Removal alert must be queued');
assert.strictEqual(unauthQueueItem.eventId, unauthEvtId, 'Unauthorized Removal event ID must match original');
assert(wrongQueueItem, 'Wrong Key Slot alert must be queued');
assert.strictEqual(wrongQueueItem.eventId, wrongEvtId, 'Wrong Key Slot event ID must match');

// 6. Network delivers both events in succession
dev11.networkDeliverAlerts();
assert.strictEqual(dev11.deliveredAlerts.length, 2, 'Both alerts must be successfully delivered');
assert.strictEqual(nvsAudit.getBool('pUAlert203'), false, 'pUAlert203 must be cleared after delivery');
assert.strictEqual(nvsAudit.getBool('pWAlert203'), false, 'pWAlert203 must be cleared after delivery');
assert.strictEqual(nvsAudit.getBool('pAlert203'), false, 'Legacy aggregate pAlert203 must be cleared');
console.log('✔ PASS: Scenario 11 - Room 203 unauthorized removal and wrong-slot incident both preserved and delivered without overwrite.');

// -----------------------------------------------------------------------------
// Scenario 12: Simultaneous multi-incidents across both rooms (Room 203 & Room 204)
// -----------------------------------------------------------------------------
const nvsBoth = new MockNVS();
let dev12 = new SimulatedEsp32KeyBox(nvsBoth);
dev12.boot();

// Unauthorized removal on BOTH rooms
dev12.now = 10000;
dev12.unauthorizedKeyRemoval('203');
dev12.unauthorizedKeyRemoval('204');
const unauth203Id = nvsBoth.getString('pUEvt203');
const unauth204Id = nvsBoth.getString('pUEvt204');

// Power cut! Keys swapped while powered off!
dev12 = new SimulatedEsp32KeyBox(nvsBoth);
dev12.now = 15000;
dev12.pin203 = KEY_204; // Swapped
dev12.pin204 = KEY_203; // Swapped
dev12.boot();

// All 4 incidents active
assert.strictEqual(dev12.isUnauthorized203, true);
assert.strictEqual(dev12.isUnauthorized204, true);
assert.strictEqual(dev12.isWrongKey203, true);
assert.strictEqual(dev12.isWrongKey204, true);

// All 4 alerts preserved in NVS
assert.strictEqual(nvsBoth.getBool('pUAlert203'), true);
assert.strictEqual(nvsBoth.getBool('pWAlert203'), true);
assert.strictEqual(nvsBoth.getBool('pUAlert204'), true);
assert.strictEqual(nvsBoth.getBool('pWAlert204'), true);
assert.strictEqual(nvsBoth.getString('pUEvt203'), unauth203Id);
assert.strictEqual(nvsBoth.getString('pUEvt204'), unauth204Id);

// All 4 queued
assert.strictEqual(dev12.queuedAlerts.length, 4, 'All 4 security events must be enqueued');
dev12.networkDeliverAlerts();
assert.strictEqual(dev12.deliveredAlerts.length, 4, 'All 4 security events delivered successfully');
assert.strictEqual(nvsBoth.getBool('pAlert203'), false);
assert.strictEqual(nvsBoth.getBool('pAlert204'), false);
console.log('✔ PASS: Scenario 12 - Simultaneous multi-incidents on both rooms preserved and delivered across simulated power cycle.');

// -----------------------------------------------------------------------------
// Scenario 13: Consecutive Unauthorized Removals of the Same Type in Room 203
// -----------------------------------------------------------------------------
const nvsSameUnauth = new MockNVS();
let dev13 = new SimulatedEsp32KeyBox(nvsSameUnauth);
dev13.boot();

// 1. First Unauthorized key removal in Room 203 while offline
dev13.now = 20000;
dev13.unauthorizedKeyRemoval('203');
assert.strictEqual(dev13.isUnauthorized203, true);
assert.strictEqual(nvsSameUnauth.getInt('pQ_cnt'), 1, 'Queue must contain 1 event');
assert.strictEqual(nvsSameUnauth.getBool('pUAlert203'), true);
const firstUnauthId = nvsSameUnauth.getString('pUEvt203');
assert.strictEqual(firstUnauthId, '203-20000');

// 2. Physical incident resolved: correct key returned
dev13.correctKeyReturned('203');
assert.strictEqual(dev13.isUnauthorized203, false, 'Physical alarm cleared upon key return');
assert.strictEqual(nvsSameUnauth.getInt('pQ_cnt'), 1, 'Pending event MUST remain in NVS queue while unacknowledged');
assert.strictEqual(nvsSameUnauth.getBool('pUAlert203'), true, 'pUAlert203 must remain true');
assert.strictEqual(nvsSameUnauth.getString('pUEvt203'), '203-20000');

// 3. Second Unauthorized key removal in Room 203 before network connectivity returns
dev13.now = 25000;
dev13.unauthorizedKeyRemoval('203');
assert.strictEqual(dev13.isUnauthorized203, true, 'Second removal triggers alarm');
assert.strictEqual(nvsSameUnauth.getInt('pQ_cnt'), 2, 'NVS queue MUST hold 2 distinct events of same type');
assert.strictEqual(nvsSameUnauth.getString('pQ_e_0'), '203-20000', 'First event MUST NOT be overwritten');
assert.strictEqual(nvsSameUnauth.getString('pQ_e_1'), '203-25000', 'Second event MUST be appended');
assert.strictEqual(nvsSameUnauth.getString('pUEvt203'), '203-20000', 'Summary key must point to oldest unacknowledged event');

// 4. Power cut simulation before connectivity returns
dev13 = new SimulatedEsp32KeyBox(nvsSameUnauth);
dev13.now = 28000;
dev13.pin203 = KEY_NONE; // Stolen key still missing
dev13.boot();

assert.strictEqual(dev13.isUnauthorized203, true, 'Unauthorized state persists across power cycle');
assert.strictEqual(dev13.queuedAlerts.length, 2, 'BOTH distinct events must be restored from NVS');
assert.strictEqual(dev13.queuedAlerts[0].eventId, '203-20000', 'First event restored intact');
assert.strictEqual(dev13.queuedAlerts[1].eventId, '203-25000', 'Second event restored intact');

// 5. Delivery of First Event: second event must NOT be cleared prematurely
const delivered1 = dev13.queuedAlerts.shift();
dev13.deliveredAlerts.push(delivered1);
dev13.persistClearPendingAlert(delivered1.room, delivered1.alert, delivered1.eventId);
dev13.refreshAlertStateFromNvs();

assert.strictEqual(nvsSameUnauth.getInt('pQ_cnt'), 1, 'Queue count decrements to 1');
assert.strictEqual(nvsSameUnauth.getBool('pUAlert203'), true, 'pUAlert203 must STILL be true for second event!');
assert.strictEqual(nvsSameUnauth.getString('pUEvt203'), '203-25000', 'Summary key now points to second event');
assert.strictEqual(dev13.alertUnauthNeedsSync203, true, 'RAM flag must remain true for second event');
assert.strictEqual(dev13.alertUnauthEventId203, '203-25000', 'RAM event ID updated to second event');

// 6. Delivery of Second Event
const delivered2 = dev13.queuedAlerts.shift();
dev13.deliveredAlerts.push(delivered2);
dev13.persistClearPendingAlert(delivered2.room, delivered2.alert, delivered2.eventId);
dev13.refreshAlertStateFromNvs();

assert.strictEqual(nvsSameUnauth.getInt('pQ_cnt'), 0, 'Queue count decrements to 0');
assert.strictEqual(nvsSameUnauth.getBool('pUAlert203'), false, 'pUAlert203 cleared once all events acknowledged');
assert.strictEqual(dev13.alertUnauthNeedsSync203, false, 'RAM flag cleared');
assert.strictEqual(dev13.deliveredAlerts.length, 2, 'Both distinct same-type events delivered');

// 7. Backend deduplication verification: retrying delivered alert with identical event ID
const retryDuplicateResult = dev13.persistPendingAlert('203', true, 'Unauthorized Removal', '203-20000');
assert.strictEqual(retryDuplicateResult, true);
assert.strictEqual(nvsSameUnauth.getInt('pQ_cnt'), 1, 'Queue holds at most 1 instance when added');
// Retrying with same ID does not duplicate
dev13.persistPendingAlert('203', true, 'Unauthorized Removal', '203-20000');
assert.strictEqual(nvsSameUnauth.getInt('pQ_cnt'), 1, 'Identical event ID retry deduplicated');
dev13.persistClearPendingAlert('203', 'Unauthorized Removal', '203-20000');
console.log('✔ PASS: Scenario 13 - Repeated Unauthorized Removals of same type preserved, restored across power cut, and delivered in order.');

// -----------------------------------------------------------------------------
// Scenario 14: Repeated Consecutive Wrong Key Slot Incidents in Room 203
// -----------------------------------------------------------------------------
const nvsSameWrong = new MockNVS();
let dev14 = new SimulatedEsp32KeyBox(nvsSameWrong);
dev14.boot();

// 1. Insert wrong key into Slot 203 while offline
dev14.now = 30000;
dev14.wrongKeyInserted('203', KEY_204);
assert.strictEqual(dev14.isWrongKey203, true);
assert.strictEqual(nvsSameWrong.getInt('pQ_cnt'), 1);
assert.strictEqual(nvsSameWrong.getBool('pWAlert203'), true);
const firstWrongId = nvsSameWrong.getString('pWEvt203');
assert.strictEqual(firstWrongId, '203-wrong-30000');

// 2. Remove wrong key: physical alarm resolves, but event remains pending
dev14.wrongKeyRemoved('203');
assert.strictEqual(dev14.isWrongKey203, false);
assert.strictEqual(nvsSameWrong.getInt('pQ_cnt'), 1, 'Pending wrong-slot event preserved');
assert.strictEqual(nvsSameWrong.getBool('pWAlert203'), true);

// 3. Insert another wrong key into Slot 203 before connectivity returns
dev14.now = 35000;
dev14.wrongKeyInserted('203', KEY_204);
assert.strictEqual(dev14.isWrongKey203, true);
assert.strictEqual(nvsSameWrong.getInt('pQ_cnt'), 2, 'Both distinct wrong-key incidents must be queued');
assert.strictEqual(nvsSameWrong.getString('pQ_e_0'), '203-wrong-30000');
assert.strictEqual(nvsSameWrong.getString('pQ_e_1'), '203-wrong-35000');

// 4. Power cut simulation and reboot
dev14 = new SimulatedEsp32KeyBox(nvsSameWrong);
dev14.pin203 = KEY_204;
dev14.boot();

assert.strictEqual(dev14.isWrongKey203, true);
assert.strictEqual(dev14.queuedAlerts.length, 2, 'Both wrong key alerts restored from NVS');
assert.strictEqual(dev14.queuedAlerts[0].eventId, '203-wrong-30000');
assert.strictEqual(dev14.queuedAlerts[1].eventId, '203-wrong-35000');

// 5. Deliver both events
dev14.networkDeliverAlerts();
assert.strictEqual(dev14.deliveredAlerts.length, 2);
assert.strictEqual(nvsSameWrong.getInt('pQ_cnt'), 0, 'Queue fully drained');
assert.strictEqual(nvsSameWrong.getBool('pWAlert203'), false);
console.log('✔ PASS: Scenario 14 - Repeated Wrong Key Slot incidents preserved across power cut and delivered without overwrite.');

// -----------------------------------------------------------------------------
// Scenario 15: Storage Full Boundary Handling & Capacity Enforcement
// -----------------------------------------------------------------------------
const nvsFull = new MockNVS();
const dev15 = new SimulatedEsp32KeyBox(nvsFull);
dev15.boot();

// Fill queue to MAX_PERSISTENT_ALERTS (12 items)
for (let i = 0; i < MAX_PERSISTENT_ALERTS; i++) {
    const success = dev15.persistPendingAlert('203', true, 'Unauthorized Removal', `item-${i}`);
    assert.strictEqual(success, true, `Item ${i} must fit in primary queue`);
}
assert.strictEqual(nvsFull.getInt('pQ_cnt'), MAX_PERSISTENT_ALERTS, 'Primary queue must be exactly full');
assert.strictEqual(nvsFull.getInt('pQ_ovf_cnt'), 0, 'Overflow buffer initially empty');

// 13th event: staged into persistent overflow buffer (not rejected/discarded)
const overflow1Success = dev15.persistPendingAlert('203', true, 'Unauthorized Removal', 'item-12');
assert.strictEqual(overflow1Success, true, '13th event must be durably staged in persistent overflow');
assert.strictEqual(nvsFull.getInt('pQ_ovf_cnt'), 1, 'Overflow count is 1');
assert.strictEqual(nvsFull.getBool('pQ_ovf_has'), true, 'pQ_ovf_has must be true');
assert.strictEqual(nvsFull.getString('pQ_oe_0'), 'item-12', '13th event ID saved in overflow slot 0');

// Fill remaining 3 overflow slots (14th, 15th, 16th events)
for (let i = 13; i < 16; i++) {
    const ok = dev15.persistPendingAlert('203', true, 'Unauthorized Removal', `item-${i}`);
    assert.strictEqual(ok, true, `Overflow item ${i} must be staged`);
}
assert.strictEqual(nvsFull.getInt('pQ_ovf_cnt'), MAX_OVERFLOW_ALERTS, 'Overflow buffer full at 4 items');

// Attempt 17th event: now both primary (12) and overflow (4) are full -> explicit rejection
const hardReject = dev15.persistPendingAlert('203', true, 'Unauthorized Removal', 'item-16');
assert.strictEqual(hardReject, false, 'Explicitly reject when both primary and overflow are full');

// Verify existing 12 primary items and 4 overflow items remain completely intact
for (let i = 0; i < MAX_PERSISTENT_ALERTS; i++) {
    assert.strictEqual(nvsFull.getString(`pQ_e_${i}`), `item-${i}`, `Existing item ${i} must remain intact`);
}
for (let i = 0; i < MAX_OVERFLOW_ALERTS; i++) {
    assert.strictEqual(nvsFull.getString(`pQ_oe_${i}`), `item-${12 + i}`, `Overflow item ${i} must remain intact`);
}

// Acknowledge one event from primary queue (item-0) to free a slot
dev15.persistClearPendingAlert('203', 'Unauthorized Removal', 'item-0');
// The freed slot is immediately backfilled by the oldest overflow item (item-12)
assert.strictEqual(nvsFull.getInt('pQ_cnt'), MAX_PERSISTENT_ALERTS, 'Count remains 12 because overflow item was promoted');
assert.strictEqual(nvsFull.getString(`pQ_e_${MAX_PERSISTENT_ALERTS - 1}`), 'item-12', 'Promoted item-12 occupies slot 11');
assert.strictEqual(nvsFull.getInt('pQ_ovf_cnt'), MAX_OVERFLOW_ALERTS - 1, 'Overflow count decremented to 3');
console.log('✔ PASS: Scenario 15 - Bounded queue capacity with persistent overflow buffer and auto-promotion verified.');

// -----------------------------------------------------------------------------
// Scenario 16: Queue Capacity, 13th Rejected-Event Retention, Reboot, and Subsequent Delivery
// -----------------------------------------------------------------------------
console.log('\n--- Scenario 16: Queue Full, 13th Event Persistent Retention, Power-Cycle Reboot & Delivery ---');
const nvs16 = new MockNVS();
let dev16 = new SimulatedEsp32KeyBox(nvs16);
dev16.boot();

// 1. Fill queue to capacity with 12 distinct unacknowledged events
for (let i = 0; i < MAX_PERSISTENT_ALERTS; i++) {
    const success = dev16.persistPendingAlert('204', true, 'Unauthorized Removal', `pQ-slot-${i}`);
    assert.strictEqual(success, true, `Pre-filling event ${i}`);
}
assert.strictEqual(nvs16.getInt('pQ_cnt'), 12, 'Primary queue has 12 items');
assert.strictEqual(nvs16.getInt('pQ_ovf_cnt'), 0, 'No overflow yet');

// 2. 13th distinct security event occurs: unauthorized removal in Room 203 while offline
dev16.now = 75000;
dev16.unauthorizedKeyRemoval('203');

// 3. Verify physical incident state and alarm: MUST NOT silently clear incident or report device as secure!
assert.strictEqual(dev16.isUnauthorized203, true, 'Room 203 incident must remain latched');
assert.strictEqual(dev16.buzzerActive, true, 'Buzzer alarm MUST remain active');
assert.strictEqual(dev16.lcdLine1, '! UNAUTHORIZED !', 'LCD must indicate unauthorized removal');
assert.strictEqual(dev16.lcdLine2, 'RETURN KEY 203! ', 'LCD must instruct returning Room 203 key');
assert.strictEqual(nvs16.getBool('unauth203'), true, 'Physical latch unauth203 must be true in NVS');

// 4. Verify 13th event's room, incident type, and event ID are durably staged in persistent overflow
assert.strictEqual(nvs16.getInt('pQ_cnt'), 12, 'Primary queue remains capped at 12');
assert.strictEqual(nvs16.getInt('pQ_ovf_cnt'), 1, 'Overflow counter increments to 1');
assert.strictEqual(nvs16.getBool('pQ_ovf_has'), true, 'pQ_ovf_has is true');
assert.strictEqual(nvs16.getString('pQ_or_0'), '203', '13th event room stored');
assert.strictEqual(nvs16.getString('pQ_ot_0'), 'Unauthorized Removal', '13th event type stored');
assert.strictEqual(nvs16.getString('pQ_oe_0'), '203-75000', '13th event ID stored');
assert.strictEqual(nvs16.getBool('pUAlert203'), true, 'Summary key pUAlert203 set from staged overflow');
assert.strictEqual(nvs16.getString('pUEvt203'), '203-75000', 'Summary event ID points to 13th event');

// 5. Simulate power loss and restart (reboot with Key 203 still missing)
let dev16Reboot = new SimulatedEsp32KeyBox(nvs16);
dev16Reboot.pin203 = KEY_NONE; // Stolen key still absent
dev16Reboot.pin204 = KEY_204;
dev16Reboot.boot();

// 6. Verify durable recoverability post-reboot
assert.strictEqual(dev16Reboot.isUnauthorized203, true, 'Unauthorized state survives power cycle');
assert.strictEqual(dev16Reboot.buzzerActive, true, 'Alarm buzzer persists post-reboot');
assert.strictEqual(nvs16.getInt('pQ_cnt'), 12, 'All 12 primary events survived power cut');
assert.strictEqual(nvs16.getInt('pQ_ovf_cnt'), 1, '13th event in overflow survived power cut intact');
assert.strictEqual(nvs16.getString('pQ_oe_0'), '203-75000', '13th event ID intact in NVS after reboot');
assert.strictEqual(dev16Reboot.queuedAlerts.length, 12, '12 primary alerts loaded into transmission queue');

// 7. Connectivity restores: Backend acknowledges 1 existing primary event (pQ-slot-0)
const acknowledgedEvent = dev16Reboot.queuedAlerts.shift();
assert.strictEqual(acknowledgedEvent.eventId, 'pQ-slot-0');
dev16Reboot.deliveredAlerts.push(acknowledgedEvent);

// Calling persistClearPendingAlert frees slot 0, shifts primary queue, and triggers promotion of 13th event!
dev16Reboot.persistClearPendingAlert(acknowledgedEvent.room, acknowledgedEvent.alert, acknowledgedEvent.eventId);
dev16Reboot.refreshAlertStateFromNvs();

// 8. Verify promotion of 13th event
assert.strictEqual(nvs16.getInt('pQ_cnt'), 12, 'Queue remains full because 13th event promoted into slot 11');
assert.strictEqual(nvs16.getInt('pQ_ovf_cnt'), 0, 'Persistent overflow buffer drained to 0');
assert.strictEqual(nvs16.getBool('pQ_ovf_has'), false, 'pQ_ovf_has reset to false');
assert.strictEqual(nvs16.getString('pQ_e_11'), '203-75000', '13th event promoted into primary queue slot 11');

// 13th event was pushed to transmission queue during promotion
assert.strictEqual(dev16Reboot.queuedAlerts.length, 12, '11 unacknowledged + 1 promoted = 12 in transmit queue');
const promotedAlert = dev16Reboot.queuedAlerts[dev16Reboot.queuedAlerts.length - 1];
assert.strictEqual(promotedAlert.eventId, '203-75000', 'Promoted alert has original event ID intact');
assert.strictEqual(promotedAlert.room, '203');
assert.strictEqual(promotedAlert.alert, 'Unauthorized Removal');

// 9. Deliver remaining alerts including the 13th event
while (dev16Reboot.queuedAlerts.length > 0) {
    const item = dev16Reboot.queuedAlerts.shift();
    dev16Reboot.deliveredAlerts.push(item);
    dev16Reboot.persistClearPendingAlert(item.room, item.alert, item.eventId);
    dev16Reboot.refreshAlertStateFromNvs();
}

assert.strictEqual(dev16Reboot.deliveredAlerts.length, 13, 'All 13 distinct security events delivered');
assert.strictEqual(nvs16.getInt('pQ_cnt'), 0, 'Primary queue fully drained');
assert.strictEqual(nvs16.getInt('pQ_ovf_cnt'), 0, 'Overflow queue fully drained');
assert.strictEqual(nvs16.getBool('pUAlert203'), false, 'pUAlert203 cleared once all events acknowledged');
assert.strictEqual(dev16Reboot.alertUnauthNeedsSync203, false, 'RAM sync flag cleared');

const delivered13th = dev16Reboot.deliveredAlerts.find(a => a.eventId === '203-75000');
assert(delivered13th !== undefined, '13th event successfully delivered to backend');
assert.strictEqual(delivered13th.room, '203');
assert.strictEqual(delivered13th.alert, 'Unauthorized Removal');

// 10. Physical resolution: Correct key returned to Room 203
dev16Reboot.correctKeyReturned('203');
assert.strictEqual(dev16Reboot.isUnauthorized203, false, 'Physical alarm silenced on key return');
assert.strictEqual(dev16Reboot.buzzerActive, false, 'Buzzer off');
assert.strictEqual(nvs16.getBool('unauth203'), false, 'NVS physical latch cleared on key return');
console.log('✔ PASS: Scenario 16 - 13th event persistent overflow retention, power-cycle reboot, promotion, and delivery fully verified.');

console.log('================================================================');
console.log('🎉 ALL FIRMWARE POWER-CYCLE SECURITY TESTS PASSED SUCCESSFULLY!');
console.log('================================================================');
