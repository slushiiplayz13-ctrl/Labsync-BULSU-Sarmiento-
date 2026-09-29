'use strict';

const { wrapEmailHtml, ctaButton, warningBox, fallbackLinkBox } = require('./shell');

/**
 * Escapes HTML characters for safe rendering in email templates.
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
 * Renders HTML email sent to Department Head when a faculty member requests an additional key.
 *
 * @param {string} recipientName - Department Head's name
 * @param {object} data
 * @param {string} data.requesterName - Name of the faculty member requesting
 * @param {string} [data.requesterRole='Faculty'] - Role of the requester
 * @param {string} data.requestedRoom - Room number being requested
 * @param {string} [data.heldRooms='None'] - Rooms currently held by the faculty
 * @param {string} data.reason - Justification reason provided by faculty
 * @param {string} data.reviewLink - URL to review/approve in LabSync
 * @param {string} [data.requestedAt] - Timestamp of request
 * @returns {{ subject: string, html: string }}
 */
function renderKeyAuthorizationRequestEmail(recipientName, data) {
    const requesterName = escapeHtml(data.requesterName || 'Faculty Member');
    const requesterRole = escapeHtml(data.requesterRole || 'Faculty');
    const requestedRoom = escapeHtml(data.requestedRoom || 'Laboratory');
    const heldRooms = escapeHtml(data.heldRooms || 'None');
    const reason = escapeHtml(data.reason || 'No specific reason provided.');
    const reviewLink = data.reviewLink || '#';
    const timeDisplay = data.requestedAt ? escapeHtml(data.requestedAt) : 'Just now';

    const bodyHtml = `
        <!-- Urgent Pill Badge -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto 16px auto;">
            <tr>
                <td style="background-color: #FEF3C7; border: 1px solid #FCD34D; border-radius: 99px; padding: 4px 14px; text-align: center;">
                    <span style="font-size: 11.5px; font-weight: 800; color: #B45309; text-transform: uppercase; letter-spacing: 0.5px;">
                        ⚠️ Action Required • 2nd Key Request
                    </span>
                </td>
            </tr>
        </table>

        <h2 class="text-title" style="margin-top: 0; margin-bottom: 12px; font-size: 21px; font-weight: 800; color: #0F172A; text-align: center; letter-spacing: -0.4px;">
            Key Authorization Request
        </h2>

        <p class="text-secondary" style="margin-top: 0; margin-bottom: 22px; font-size: 14.5px; color: #475569; text-align: center; line-height: 1.5;">
            Hello <strong>${escapeHtml(recipientName)}</strong>, a faculty member has requested your approval to withdraw an additional laboratory key.
        </p>

        <!-- Structured Request Details Card -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
               style="background-color: #F8FAFC; border: 1.5px solid #E2E8F0; border-radius: 14px; margin-bottom: 22px; overflow: hidden;">
            <tr>
                <td style="padding: 16px 18px; border-bottom: 1px solid #E2E8F0;">
                    <span style="font-size: 11.5px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.4px; display: block; margin-bottom: 4px;">
                        Requesting Faculty Member
                    </span>
                    <strong style="font-size: 15px; color: #0F172A;">${requesterName}</strong>
                    <span style="font-size: 12px; color: #64748B; margin-left: 6px;">(${requesterRole})</span>
                </td>
            </tr>
            <tr>
                <td style="padding: 14px 18px; border-bottom: 1px solid #E2E8F0; background-color: #FFFFFF;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                            <td width="50%" style="vertical-align: top; padding-right: 8px;">
                                <span style="font-size: 11px; font-weight: 700; color: #D97706; text-transform: uppercase; display: block; margin-bottom: 2px;">
                                    Currently Holding
                                </span>
                                <strong style="font-size: 14px; color: #B45309;">${heldRooms}</strong>
                            </td>
                            <td width="50%" style="vertical-align: top; padding-left: 8px; border-left: 1px solid #F1F5F9;">
                                <span style="font-size: 11px; font-weight: 700; color: #0284C7; text-transform: uppercase; display: block; margin-bottom: 2px;">
                                    Requested 2nd Key
                                </span>
                                <strong style="font-size: 14px; color: #0369A1;">Room ${requestedRoom}</strong>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
            <tr>
                <td style="padding: 16px 18px; background-color: #F8FAFC; border-bottom: 1px solid #E2E8F0;">
                    <span style="font-size: 11.5px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.4px; display: block; margin-bottom: 6px;">
                        Faculty Justification
                    </span>
                    <div style="background-color: #FFFFFF; border-left: 3.5px solid #0EA5C9; border-radius: 4px; padding: 10px 14px; font-size: 13.5px; color: #1E293B; line-height: 1.5; font-style: italic;">
                        "${reason}"
                    </div>
                </td>
            </tr>
            <tr>
                <td style="padding: 10px 18px; background-color: #F1F5F9; font-size: 11.5px; color: #64748B; text-align: right;">
                    Submitted: <strong>${timeDisplay}</strong>
                </td>
            </tr>
        </table>

        ${ctaButton('Review & Authorize in LabSync', reviewLink)}

        ${warningBox(
            '🔒 Single-Key Policy & Security Control',
            'By default, faculty are strictly limited to holding <strong>1 key</strong>. Approving this request grants an exception allowing custody of <strong>2 keys simultaneously</strong> for a 120-minute class interval.'
        )}

        ${fallbackLinkBox(reviewLink)}

        <hr class="divider-line" style="border: 0; border-top: 1px solid #F1F5F9; margin: 30px 0 20px 0;">
        <p class="text-secondary" style="margin-bottom: 0; font-size: 13.5px; color: #64748B; line-height: 1.5; text-align: center;">
            This is an automated priority notice dispatched by the <strong>LabSync Real-Time Key Accountability System</strong>.<br>
            BulSU Sarmiento Campus — Information Technology Department
        </p>
    `;

    return {
        subject: `[LabSync Urgent] 2nd Key Request: Prof. ${data.requesterName} (Room ${data.requestedRoom})`,
        html: wrapEmailHtml(bodyHtml)
    };
}

/**
 * Renders HTML email sent to faculty member when Department Head approves or declines their request.
 *
 * @param {string} recipientName - Faculty member's name
 * @param {object} data
 * @param {string} data.status - 'APPROVED' or 'REJECTED'
 * @param {string} data.roomNumber - Laboratory room number
 * @param {string} [data.approverName] - Name of Department Head
 * @param {number} [data.durationMinutes=120] - Granted duration
 * @param {string} [data.rejectionReason] - Reason if declined
 * @param {string} data.actionLink - Direct link to room status or key transfer
 * @returns {{ subject: string, html: string }}
 */
function renderKeyAuthorizationOutcomeEmail(recipientName, data) {
    const isApproved = String(data.status).toUpperCase() === 'APPROVED';
    const roomNumber = escapeHtml(data.roomNumber || 'Laboratory');
    const approverName = escapeHtml(data.approverName || 'Department Head');
    const actionLink = data.actionLink || '#';

    let badgeColor = isApproved ? '#D1FAE5' : '#FEE2E2';
    let badgeTextColor = isApproved ? '#065F46' : '#991B1B';
    let badgeBorder = isApproved ? '#A7F3D0' : '#FECACA';
    let badgeText = isApproved ? '✓ APPROVED BY DEPT. HEAD' : '✕ REQUEST DECLINED';

    const bodyHtml = `
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto 16px auto;">
            <tr>
                <td style="background-color: ${badgeColor}; border: 1px solid ${badgeBorder}; border-radius: 99px; padding: 4px 14px; text-align: center;">
                    <span style="font-size: 11.5px; font-weight: 800; color: ${badgeTextColor}; text-transform: uppercase; letter-spacing: 0.5px;">
                        ${badgeText}
                    </span>
                </td>
            </tr>
        </table>

        <h2 class="text-title" style="margin-top: 0; margin-bottom: 12px; font-size: 21px; font-weight: 800; color: #0F172A; text-align: center;">
            ${isApproved ? `Key Request Approved for Room ${roomNumber}` : `Key Request Declined for Room ${roomNumber}`}
        </h2>

        <p class="text-secondary" style="margin-top: 0; margin-bottom: 22px; font-size: 14.5px; color: #475569; text-align: center; line-height: 1.6;">
            Hello <strong>${escapeHtml(recipientName)}</strong>, Department Head <strong>${approverName}</strong> has reviewed your request for the <strong>Room ${roomNumber}</strong> key.
        </p>

        ${isApproved ? `
            <div style="background-color: #ECFDF5; border: 1.5px solid #A7F3D0; border-radius: 14px; padding: 18px 20px; margin-bottom: 24px; text-align: center;">
                <p style="margin: 0 0 8px 0; font-size: 14.5px; color: #065F46; font-weight: 700;">
                    ✓ You are authorized to withdraw this 2nd laboratory key!
                </p>
                <p style="margin: 0; font-size: 13px; color: #047857; line-height: 1.5;">
                    Your authorization is active for <strong>${data.durationMinutes || 120} minutes</strong>. You may scan the key QR fob with your phone or withdraw it directly at the physical IoT Key Dock.
                </p>
            </div>
            ${ctaButton('View Key & Room Status', actionLink)}
        ` : `
            <div style="background-color: #FEF2F2; border: 1.5px solid #FECACA; border-radius: 14px; padding: 18px 20px; margin-bottom: 24px;">
                <p style="margin: 0 0 6px 0; font-size: 13.5px; color: #991B1B; font-weight: 700;">
                    Reason for decline:
                </p>
                <p style="margin: 0; font-size: 13.5px; color: #7F1D1D; line-height: 1.5; font-style: italic;">
                    "${escapeHtml(data.rejectionReason || 'No specific reason was provided by the Department Head.')}"
                </p>
            </div>
            ${ctaButton('Go to Faculty Dashboard', actionLink)}
        `}

        ${fallbackLinkBox(actionLink)}

        <hr class="divider-line" style="border: 0; border-top: 1px solid #F1F5F9; margin: 30px 0 20px 0;">
        <p class="text-secondary" style="margin-bottom: 0; font-size: 13.5px; color: #64748B; line-height: 1.5; text-align: center;">
            BulSU Sarmiento Campus • IT Department Laboratory Management
        </p>
    `;

    return {
        subject: isApproved
            ? `[LabSync Approved] 2nd Key Request for Room ${data.roomNumber} Approved`
            : `[LabSync Notice] 2nd Key Request for Room ${data.roomNumber} Declined`,
        html: wrapEmailHtml(bodyHtml)
    };
}

module.exports = {
    renderKeyAuthorizationRequestEmail,
    renderKeyAuthorizationOutcomeEmail
};
