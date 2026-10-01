'use strict';

/**
 * services/email/templates/key-reminder.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Transactional email template for automatic key return / transfer reminders.
 * Dispatched to the actual current key holder when a scheduled class reaches
 * End_Time + 15 minutes and the key is still borrowed.
 */

const { APP_URL } = require('../../../config/app.config');
const { wrapEmailHtml, ctaButton, warningBox } = require('./shell');

/**
 * Safely escapes HTML special characters.
 * @param {string|null|undefined} str
 * @returns {string}
 */
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Formats a 24-hour time string (e.g. '07:00:00' or '10:00') into 12-hour format ('7:00 AM', '10:00 AM').
 * @param {string} timeStr
 * @returns {string}
 */
function formatTime12Hour(timeStr) {
    if (!timeStr) return '';
    const parts = String(timeStr).split(':');
    if (parts.length < 2) return String(timeStr);
    let hour = parseInt(parts[0], 10);
    const minute = parts[1];
    if (isNaN(hour)) return String(timeStr);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12;
    if (hour === 0) hour = 12;
    return `${hour}:${minute} ${ampm}`;
}

/**
 * Renders the Key Return Reminder email HTML.
 *
 * @param {object} params
 * @param {string} params.recipientName - Name of current key holder
 * @param {string} params.roomNumber - Laboratory room number (e.g. '203')
 * @param {string} [params.building] - Building name (e.g. 'Bldg. E')
 * @param {string} [params.subjectName] - Scheduled subject name
 * @param {string} [params.section] - Class section
 * @param {string} params.scheduledStartTime - e.g. '07:00:00'
 * @param {string} params.scheduledEndTime - e.g. '10:00:00'
 * @param {string} params.reminderDeadline - e.g. '10:15:00' or Date
 * @param {string} [params.scheduledFacultyName] - Scheduled professor name
 * @param {string} [params.keyStatus='Borrowed'] - Current key status
 * @returns {{ subject: string, html: string }}
 */
function renderKeyReturnReminderEmail({
    recipientName,
    roomNumber,
    building = 'IT Building',
    subjectName = 'Scheduled Class',
    section = '',
    scheduledStartTime,
    scheduledEndTime,
    reminderDeadline,
    scheduledFacultyName = '',
    keyStatus = 'Borrowed'
}) {
    const safeRecipient = escapeHtml(recipientName || 'Faculty Member');
    const safeRoom = escapeHtml(roomNumber || 'Laboratory');
    const safeBuilding = escapeHtml(building || '');
    const safeSubject = escapeHtml(subjectName || 'Scheduled Class');
    const safeSection = escapeHtml(section || '');
    const safeScheduledProf = escapeHtml(scheduledFacultyName || 'Scheduled Faculty');

    const formattedStart = formatTime12Hour(scheduledStartTime);
    const formattedEnd = formatTime12Hour(scheduledEndTime);
    const formattedDeadline = (reminderDeadline instanceof Date)
        ? formatTime12Hour(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false }).format(reminderDeadline))
        : formatTime12Hour(reminderDeadline);

    const subject = `LabSync Key Return Reminder — Room ${roomNumber}`;

    const scheduledTimeDisplay = (formattedStart && formattedEnd)
        ? `${formattedStart} – ${formattedEnd}`
        : (formattedEnd || 'Scheduled Class Time');

    const transferUrl = `${APP_URL}/key-transfer.html`;

    const bodyHtml = `
        <!-- Status Pill Badge -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto 16px auto;">
            <tr>
                <td style="background-color: #FEF3C7; border: 1px solid #FCD34D; border-radius: 99px; padding: 5px 16px; text-align: center;">
                    <span style="font-size: 11.5px; font-weight: 800; color: #B45309; text-transform: uppercase; letter-spacing: 0.5px;">
                        ⚠️ Action Required • Key Return Reminder
                    </span>
                </td>
            </tr>
        </table>

        <h2 class="text-title" style="margin-top: 0; margin-bottom: 12px; font-size: 22px; font-weight: 800; color: #0F172A; text-align: center; letter-spacing: -0.4px;">
            Laboratory Key Return Reminder
        </h2>

        <p class="text-secondary" style="margin-top: 0; margin-bottom: 24px; font-size: 15px; color: #475569; text-align: center; line-height: 1.55;">
            Hello <strong>${safeRecipient}</strong>, your laboratory key for <strong>Room ${safeRoom}</strong>${safeBuilding ? ` (${safeBuilding})` : ''} is still recorded under your custody.
        </p>

        <!-- Summary Information Card -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="box-credential"
               style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 14px; margin-bottom: 24px; overflow: hidden;">
            <tr>
                <td style="padding: 20px 24px;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 14px; line-height: 1.6;">
                        <tr>
                            <td class="field-label" style="padding: 7px 0; color: #64748B; font-weight: 600; width: 42%;">Laboratory Room:</td>
                            <td class="text-title" style="padding: 7px 0; color: #0F172A; font-weight: 700; text-align: right;">Room ${safeRoom} ${safeBuilding ? `(${safeBuilding})` : ''}</td>
                        </tr>
                        <tr>
                            <td class="field-label" style="padding: 7px 0; color: #64748B; font-weight: 600;">Scheduled Class:</td>
                            <td class="text-body" style="padding: 7px 0; color: #1E293B; font-weight: 600; text-align: right;">${safeSubject}${safeSection ? ` (${safeSection})` : ''}</td>
                        </tr>
                        <tr>
                            <td class="field-label" style="padding: 7px 0; color: #64748B; font-weight: 600;">Scheduled Class Time:</td>
                            <td class="text-body" style="padding: 7px 0; color: #1E293B; font-weight: 600; text-align: right;">${escapeHtml(scheduledTimeDisplay)}</td>
                        </tr>
                        ${safeScheduledProf ? `
                        <tr>
                            <td class="field-label" style="padding: 7px 0; color: #64748B; font-weight: 600;">Scheduled Faculty:</td>
                            <td class="text-body" style="padding: 7px 0; color: #1E293B; font-weight: 600; text-align: right;">${safeScheduledProf}</td>
                        </tr>
                        ` : ''}
                        <tr>
                            <td class="field-label" style="padding: 7px 0; color: #64748B; font-weight: 600;">Schedule End Time:</td>
                            <td class="text-body" style="padding: 7px 0; color: #1E293B; font-weight: 700; text-align: right;">${escapeHtml(formattedEnd)}</td>
                        </tr>
                        <tr>
                            <td class="field-label" style="padding: 7px 0; color: #64748B; font-weight: 600;">15-Min Grace Period End:</td>
                            <td style="padding: 7px 0; color: #DC2626; font-weight: 800; text-align: right;">${escapeHtml(formattedDeadline)}</td>
                        </tr>
                        <tr>
                            <td class="field-label" style="padding: 7px 0; color: #64748B; font-weight: 600; border-top: 1px dashed #CBD5E1;">Current Key Status:</td>
                            <td style="padding: 7px 0; color: #D97706; font-weight: 800; text-align: right; border-top: 1px dashed #CBD5E1;">${escapeHtml(keyStatus)}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>

        <!-- Notice Box -->
        ${warningBox(
            'Action Required — Return or Transfer Key',
            `The scheduled class associated with Room ${safeRoom} ended at <strong>${escapeHtml(formattedEnd)}</strong>, and the 15-minute grace period ended at <strong>${escapeHtml(formattedDeadline)}</strong>. Please return the physical key to the IoT key box immediately, or transfer custody to the incoming faculty member using the authorized LabSync QR transfer process.`
        )}

        <!-- Quick Access Button -->
        ${ctaButton('Transfer Key Custody', transferUrl)}

        <p class="text-secondary" style="font-size: 13px; color: #64748B; text-align: center; margin: 20px 0 0 0; line-height: 1.5;">
            If you have already returned the key to the IoT key box, please ignore this notice. Key dock telemetry syncs automatically.
        </p>
    `;

    return {
        subject,
        html: wrapEmailHtml(bodyHtml)
    };
}

module.exports = {
    renderKeyReturnReminderEmail,
    formatTime12Hour
};
