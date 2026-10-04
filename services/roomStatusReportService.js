'use strict';

/**
 * services/roomStatusReportService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates official Room Status Activity Log PDF Reports for Department Head.
 * 
 * Complies with LabSync institutional reporting standards:
 * - Read-only representation of real occupancy_log database activity
 * - Protected role authorization: Department Head only
 * - Flexible period selection (Today, Yesterday, Today + Yesterday, Custom Range)
 * - Safe parameterized SQL filtering and input validation
 * - Dynamic pagination, institutional header, and clean table layout
 * ─────────────────────────────────────────────────────────────────────────────
 */

const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const occupancyRepository = require('../repositories/occupancy.repository');

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const SHORT_MONTH_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/**
 * Formats a Date or 'YYYY-MM-DD' string into human-readable long date: e.g. 'October 4, 2026'
 * @param {Date|string} dateInput
 * @returns {string}
 */
function formatLongDate(dateInput) {
    if (!dateInput) return '';
    let d;
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
        const [year, month, day] = dateInput.trim().split('-').map(Number);
        d = new Date(year, month - 1, day);
    } else {
        d = new Date(dateInput);
    }
    if (isNaN(d.getTime())) return String(dateInput);
    return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * Formats a Date or 'YYYY-MM-DD' string into compact short date: e.g. 'Oct 4, 2026'
 * @param {Date|string} dateInput
 * @returns {string}
 */
function formatShortDate(dateInput) {
    if (!dateInput) return '';
    let d;
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
        const [year, month, day] = dateInput.trim().split('-').map(Number);
        d = new Date(year, month - 1, day);
    } else {
        d = new Date(dateInput);
    }
    if (isNaN(d.getTime())) return String(dateInput);
    return `${SHORT_MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * Formats start and end dates into a compact range:
 * - Same day: 'Oct 4, 2026'
 * - Same month & year: 'Oct 3 – 4, 2026'
 * - Different months, same year: 'Sep 30 – Oct 1, 2026'
 * - Different years: 'Dec 31, 2025 – Jan 1, 2026'
 * @param {string} startDateStr - YYYY-MM-DD
 * @param {string} endDateStr - YYYY-MM-DD
 * @returns {string}
 */
function formatShortDateRange(startDateStr, endDateStr) {
    if (!startDateStr && !endDateStr) return '';
    if (!endDateStr || startDateStr === endDateStr) return formatShortDate(startDateStr);
    if (!startDateStr) return formatShortDate(endDateStr);

    const [sY, sM, sD] = startDateStr.split('-').map(Number);
    const [eY, eM, eD] = endDateStr.split('-').map(Number);
    const sDate = new Date(sY, sM - 1, sD);
    const eDate = new Date(eY, eM - 1, eD);

    if (sY === eY && sM === eM) {
        return `${SHORT_MONTH_NAMES[sDate.getMonth()]} ${sD} – ${eD}, ${sY}`;
    }
    if (sY === eY) {
        return `${SHORT_MONTH_NAMES[sDate.getMonth()]} ${sD} – ${SHORT_MONTH_NAMES[eDate.getMonth()]} ${eD}, ${sY}`;
    }
    return `${SHORT_MONTH_NAMES[sDate.getMonth()]} ${sD}, ${sY} – ${SHORT_MONTH_NAMES[eDate.getMonth()]} ${eD}, ${eY}`;
}

/**
 * Formats a Date object to YYYY-MM-DD in local time
 * @param {Date} d
 * @returns {string}
 */
function formatIsoLocalDate(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Resolves reporting period dates and labels.
 * 
 * Supports:
 * - 'today'
 * - 'yesterday'
 * - 'both' / 'today_yesterday'
 * - 'custom' (with startDate and endDate)
 * 
 * @param {object} params
 * @param {string} [params.period]
 * @param {string} [params.startDate]
 * @param {string} [params.endDate]
 * @returns {{ startDateTime: string, endDateTime: string, periodLabel: string, startDateStr: string, endDateStr: string, periodType: string }}
 */
function resolvePeriodDates({ period = 'today', startDate, endDate }) {
    const normPeriod = String(period || 'today').trim().toLowerCase();
    const now = new Date();

    let startD, endD;
    let periodType = normPeriod;

    if (normPeriod === 'today') {
        startD = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        endD = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    } else if (normPeriod === 'yesterday') {
        const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        startD = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0);
        endD = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59);
    } else if (normPeriod === 'both' || normPeriod === 'today_yesterday' || normPeriod === 'today+yesterday') {
        periodType = 'both';
        const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        startD = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0);
        endD = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    } else if (normPeriod === 'custom' || (startDate && endDate)) {
        periodType = 'custom';
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!startDate || !endDate) {
            const err = new Error('Both start date and end date are required for a custom date range.');
            err.statusCode = 400;
            throw err;
        }

        const cleanStart = String(startDate).trim();
        const cleanEnd = String(endDate).trim();

        if (!dateRegex.test(cleanStart) || !dateRegex.test(cleanEnd)) {
            const err = new Error('Dates must be in valid YYYY-MM-DD format.');
            err.statusCode = 400;
            throw err;
        }

        const [sY, sM, sDay] = cleanStart.split('-').map(Number);
        const [eY, eM, eDay] = cleanEnd.split('-').map(Number);

        const parsedStart = new Date(sY, sM - 1, sDay, 0, 0, 0);
        const parsedEnd = new Date(eY, eM - 1, eDay, 23, 59, 59);

        if (isNaN(parsedStart.getTime()) || parsedStart.getDate() !== sDay || parsedStart.getMonth() !== (sM - 1)) {
            const err = new Error(`Invalid start date: ${cleanStart}`);
            err.statusCode = 400;
            throw err;
        }

        if (isNaN(parsedEnd.getTime()) || parsedEnd.getDate() !== eDay || parsedEnd.getMonth() !== (eM - 1)) {
            const err = new Error(`Invalid end date: ${cleanEnd}`);
            err.statusCode = 400;
            throw err;
        }

        if (cleanStart > cleanEnd) {
            const err = new Error('End date cannot be earlier than start date.');
            err.statusCode = 400;
            throw err;
        }

        startD = parsedStart;
        endD = parsedEnd;
    } else {
        const err = new Error(`Unsupported reporting period: '${period}'. Valid options: 'today', 'yesterday', 'both', or 'custom'.`);
        err.statusCode = 400;
        throw err;
    }

    const startDateStr = formatIsoLocalDate(startD);
    const endDateStr = formatIsoLocalDate(endD);

    const startDateTime = `${startDateStr} 00:00:00`;
    const endDateTime = `${endDateStr} 23:59:59`;

    let periodLabel = '';
    if (periodType === 'today') {
        periodLabel = `Today (${formatShortDate(startDateStr)})`;
    } else if (periodType === 'yesterday') {
        periodLabel = `Yesterday (${formatShortDate(startDateStr)})`;
    } else if (periodType === 'both') {
        periodLabel = `Today + Yesterday (${formatShortDateRange(startDateStr, endDateStr)})`;
    } else {
        periodLabel = formatShortDateRange(startDateStr, endDateStr);
    }

    return {
        startDateTime,
        endDateTime,
        periodLabel,
        startDateStr,
        endDateStr,
        periodType
    };
}

/**
 * Validates and normalizes room number filter.
 * 
 * @param {string|null} roomNumber
 * @returns {Promise<{ roomFilter: string|null, roomFilterLabel: string }>}
 */
async function resolveRoomFilter(roomNumber) {
    if (!roomNumber || String(roomNumber).trim().toLowerCase() === 'all') {
        return {
            roomFilter: null,
            roomFilterLabel: 'All Rooms'
        };
    }

    const cleanRoom = String(roomNumber).trim();
    const [availableRooms] = await occupancyRepository.getAvailableRoomsForReport();
    const matched = availableRooms.find(r => String(r.Room_Number).trim() === cleanRoom);

    if (!matched) {
        const err = new Error(`Invalid room filter '${cleanRoom}'. Valid rooms: All Rooms, ${availableRooms.map(r => `Room ${r.Room_Number}`).join(', ')}.`);
        err.statusCode = 400;
        throw err;
    }

    return {
        roomFilter: matched.Room_Number,
        roomFilterLabel: `Room ${matched.Room_Number}`
    };
}

/**
 * Generates a clean, safe filename for the PDF download.
 * e.g. LabSync_Room_Status_Report_2026-10-04.pdf
 * or LabSync_Room_Status_Report_2026-10-01_to_2026-10-04.pdf
 * 
 * @param {object} params
 * @param {string} params.startDateStr
 * @param {string} params.endDateStr
 * @param {string|null} [params.roomFilter]
 * @returns {string}
 */
function generateReportFilename({ startDateStr, endDateStr, roomFilter = null }) {
    const roomPart = roomFilter ? `_Room_${roomFilter}` : '';
    let datePart = startDateStr;
    if (startDateStr !== endDateStr) {
        datePart = `${startDateStr}_to_${endDateStr}`;
    }
    const raw = `LabSync_Room_Status_Report${roomPart}_${datePart}.pdf`;
    return raw.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
}

/**
 * Fetches and formats real room status activity logs for the report.
 * 
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getRoomStatusActivityReportData({ period, startDate, endDate, roomNumber }) {
    const { startDateTime, endDateTime, periodLabel, startDateStr, endDateStr, periodType } =
        resolvePeriodDates({ period, startDate, endDate });

    const { roomFilter, roomFilterLabel } = await resolveRoomFilter(roomNumber);

    const [rows] = await occupancyRepository.findActivityLogsForReport({
        startDateTime,
        endDateTime,
        roomNumber: roomFilter,
        excludeIntermediateQr: true
    });

    const records = rows.map(row => {
        let statusLabel = 'Activity Logged';
        let authMethod = 'Key Box';
        let details = 'Room key custody event';

        const rawAuth = String(row.raw_auth_method || '').trim();
        const rawAuthLower = rawAuth.toLowerCase();

        if (rawAuth === 'Key Taken' || rawAuthLower === 'taken') {
            if (row.session_type === 'In Session') {
                statusLabel = 'In Session (Key Taken)';
                details = 'Scheduled Class Session';
            } else {
                statusLabel = 'Key Borrowed';
                details = 'Ad-hoc Lab Borrowing';
            }
            authMethod = 'Key Box';
        } else if (rawAuth === 'Key Returned' || rawAuth === 'KEY_RETURN' || rawAuthLower === 'returned') {
            statusLabel = 'Key Returned';
            authMethod = 'Key Box';
            details = row.user_id ? 'Key returned to slot' : 'Alarm cleared / Key restored';
        } else if (rawAuth === 'Key Transfer' || rawAuth === 'KEY_TRANSFER' || rawAuthLower.includes('transfer')) {
            statusLabel = 'Key Transferred';
            authMethod = 'System Transfer';
            details = 'Custody transferred between faculty';
        } else if (rawAuth === 'UNAUTHORIZED' || rawAuthLower.includes('unauthorized')) {
            statusLabel = 'Unauthorized Access';
            authMethod = 'Sensor Alert';
            details = 'Key removed without authorization';
        } else if (rawAuth === 'WRONG_SLOT' || rawAuthLower.includes('wrong')) {
            statusLabel = 'Wrong Key Slot';
            authMethod = 'Key Box Sensor';
            details = 'Key inserted into incorrect slot';
        } else {
            statusLabel = rawAuth || 'Activity Logged';
            authMethod = rawAuth ? rawAuth.replace(/RFID\s*\/?\s*/gi, '').trim() || 'Key Box' : 'Key Box';
            details = 'Room activity recorded';
        }

        // Ensure "RFID" is never displayed under authMethod
        authMethod = authMethod.replace(/RFID\s*\/?\s*/gi, '').trim() || 'Key Box';

        // Person / Actor Formatting
        let person = row.actor_name || 'System';
        if (row.actor_name === 'Unidentified Person') {
            person = 'Unidentified Person';
        } else if (row.user_id && row.user_name) {
            person = (row.user_role === 'Faculty' ? `Prof. ${row.user_name}` : row.user_name);
        }

        return {
            date: row.log_date,
            time: row.log_time,
            room: `RM ${row.room_number}`,
            roomNumber: row.room_number,
            status: statusLabel,
            user: person,
            role: row.actor_role || 'N/A',
            authMethod: authMethod,
            details: details,
            rawAuthMethod: rawAuth
        };
    });

    const filename = generateReportFilename({ startDateStr, endDateStr, roomFilter });

    return {
        records,
        periodLabel,
        roomFilterLabel,
        startDateStr,
        endDateStr,
        periodType,
        filename,
        roomFilter
    };
}

/**
 * Builds an official PDF Document stream for Room Status Activity Log.
 * 
 * @param {object} params
 * @param {Array} params.records
 * @param {string} params.periodLabel
 * @param {string} params.roomFilterLabel
 * @param {string} [params.generatedBy='Department Head']
 * @returns {Promise<Buffer>}
 */
async function buildRoomStatusReportPDF({
    records,
    periodLabel,
    roomFilterLabel,
    generatedBy = 'Department Head'
}) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 30, bottom: 20, left: 36, right: 36 },
                bufferPages: true,
                autoFirstPage: true,
                info: {
                    Title: 'LabSync - Room Status Activity Log Report',
                    Author: 'Bulacan State University - Sarmiento Campus',
                    Subject: 'Room Status Activity Log Report'
                }
            });

            const chunks = [];
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            const pageWidth = 595.28;
            const pageHeight = 841.89;
            const leftMargin = 36;
            const rightMargin = 36;
            const usableWidth = pageWidth - leftMargin - rightMargin; // 523.28 pt
            const bottomLimit = 795; // threshold before page break to leave space for footer

            // Column Width Definitions (Sum = 523.28 pt)
            const cols = [
                { name: 'Date', width: 50, align: 'left' },
                { name: 'Time', width: 44, align: 'left' },
                { name: 'Room', width: 38, align: 'center' },
                { name: 'Status / Event', width: 86, align: 'left' },
                { name: 'User / Person', width: 88, align: 'left' },
                { name: 'Role', width: 52, align: 'left' },
                { name: 'Auth Method', width: 60, align: 'left' },
                { name: 'Details', width: 105.28, align: 'left' }
            ];

            const bulsuLogoPath = path.join(__dirname, '../assets/bsu-sarmiento-logo.png');
            const labsyncLogoPath = path.join(__dirname, '../assets/LabSync (Logo Only).png');

            function drawHeader() {
                const headerTopY = 30;
                const logoSize = 46;

                // Symmetrically positioned square circular logos flanking the centered institutional text
                const bsuLogoX = 94;
                const labsyncX = 455;

                if (fs.existsSync(bulsuLogoPath)) {
                    try {
                        doc.image(bulsuLogoPath, bsuLogoX, headerTopY, {
                            width: logoSize,
                            height: logoSize
                        });
                    } catch (e) {}
                }

                if (fs.existsSync(labsyncLogoPath)) {
                    try {
                        doc.image(labsyncLogoPath, labsyncX, headerTopY, {
                            width: logoSize,
                            height: logoSize
                        });
                    } catch (e) {}
                }

                // Centered Institutional Branding
                doc.font('Helvetica-Bold')
                   .fontSize(11.5)
                   .fillColor('#0F172A')
                   .text('BULACAN STATE UNIVERSITY', leftMargin, headerTopY + 1, { align: 'center', width: usableWidth });

                doc.font('Helvetica')
                   .fontSize(8)
                   .fillColor('#475569')
                   .text('SARMIENTO CAMPUS · CITY OF SAN JOSE DEL MONTE, BULACAN', leftMargin, headerTopY + 15, { align: 'center', width: usableWidth });

                doc.font('Helvetica-Bold')
                   .fontSize(8.5)
                   .fillColor('#0284C7')
                   .text('IT LABORATORY ROOMS', leftMargin, headerTopY + 26, { align: 'center', width: usableWidth });

                doc.font('Helvetica-Bold')
                   .fontSize(12.5)
                   .fillColor('#0F172A')
                   .text('ROOM STATUS ACTIVITY LOG REPORT', leftMargin, headerTopY + 39, { align: 'center', width: usableWidth });

                // Accent divider line (shifted down for clean breathing room)
                const dividerY = headerTopY + 64;
                doc.strokeColor('#0284C7')
                   .lineWidth(1.75)
                   .moveTo(leftMargin, dividerY)
                   .lineTo(pageWidth - rightMargin, dividerY)
                   .stroke();

                return dividerY + 12;
            }

            function drawMetadataCard(startY) {
                const cardHeight = 44;
                const cardY = startY;

                // Rounded background box with clean border and fill
                doc.roundedRect(leftMargin, cardY, usableWidth, cardHeight, 6)
                   .lineWidth(0.75)
                   .fillAndStroke('#F8FAFC', '#E2E8F0');

                const midX = leftMargin + (usableWidth / 2);
                const colPad = 12;
                const colWidth = (usableWidth / 2) - colPad - 8;
                const leftLabelWidth = 78;
                const rightLabelWidth = 68;
                const row1Y = cardY + 9;
                const row2Y = cardY + 25;

                const now = new Date();
                const nowFormatted = `${formatShortDate(now)}, ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;

                // Left Column: Reporting Period & Room Filter
                doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748B')
                   .text('Reporting Period:', leftMargin + colPad, row1Y);
                doc.font('Helvetica-Bold').fontSize(8).fillColor('#0F172A')
                   .text(periodLabel, leftMargin + colPad + leftLabelWidth, row1Y, {
                       width: colWidth - leftLabelWidth,
                       lineBreak: false,
                       ellipsis: true
                   });

                doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748B')
                   .text('Room Filter:', leftMargin + colPad, row2Y);
                doc.font('Helvetica-Bold').fontSize(8).fillColor('#0F172A')
                   .text(roomFilterLabel, leftMargin + colPad + leftLabelWidth, row2Y, {
                       width: colWidth - leftLabelWidth,
                       lineBreak: false,
                       ellipsis: true
                   });

                // Right Column: Generated Date & Generated By
                doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748B')
                   .text('Generated At:', midX + colPad, row1Y);
                doc.font('Helvetica').fontSize(8).fillColor('#0F172A')
                   .text(nowFormatted, midX + colPad + rightLabelWidth, row1Y, {
                       width: colWidth - rightLabelWidth,
                       lineBreak: false,
                       ellipsis: true
                   });

                doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748B')
                   .text('Generated By:', midX + colPad, row2Y);
                doc.font('Helvetica').fontSize(8).fillColor('#0F172A')
                   .text(generatedBy, midX + colPad + rightLabelWidth, row2Y, {
                       width: colWidth - rightLabelWidth,
                       lineBreak: false,
                       ellipsis: true
                   });

                return cardY + cardHeight + 12;
            }

            function drawTableHeader(y) {
                const headerHeight = 22;

                // Header background
                doc.rect(leftMargin, y, usableWidth, headerHeight)
                   .fillColor('#0F172A')
                   .fill();

                let currentX = leftMargin;
                doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#FFFFFF');

                cols.forEach(col => {
                    doc.text(col.name, currentX + 4, y + 7, {
                        width: col.width - 8,
                        align: col.align
                    });
                    currentX += col.width;
                });

                return y + headerHeight;
            }

            // Draw Initial Page Elements
            let currentY = drawHeader();
            currentY = drawMetadataCard(currentY);
            currentY = drawTableHeader(currentY);

            // Draw Table Rows
            if (records.length === 0) {
                // Empty State Box
                const emptyBoxHeight = 64;
                doc.rect(leftMargin, currentY, usableWidth, emptyBoxHeight)
                   .fillColor('#F8FAFC')
                   .fillAndStroke('#E2E8F0');

                doc.font('Helvetica-Bold')
                   .fontSize(9.5)
                   .fillColor('#64748B')
                   .text('No room status activity records were found for the selected period.', leftMargin, currentY + 18, {
                       align: 'center',
                       width: usableWidth
                   });

                doc.font('Helvetica')
                   .fontSize(8)
                   .fillColor('#94A3B8')
                   .text('There is no recorded room occupancy or key activity matching the selected criteria.', leftMargin, currentY + 34, {
                       align: 'center',
                       width: usableWidth
                   });

                currentY += emptyBoxHeight;
            } else {
                records.forEach((rec, idx) => {
                    // Pre-calculate dynamic row height based on text wrapping
                    doc.font('Helvetica-Bold').fontSize(7);
                    const statusHeight = doc.heightOfString(rec.status, { width: cols[3].width - 8 });
                    doc.font('Helvetica').fontSize(7);
                    const userHeight = doc.heightOfString(rec.user, { width: cols[4].width - 8 });
                    doc.font('Helvetica').fontSize(6.8);
                    const detailsHeight = doc.heightOfString(rec.details, { width: cols[7].width - 8 });
                    const roleHeight = doc.heightOfString(rec.role, { width: cols[5].width - 8 });
                    const authHeight = doc.heightOfString(rec.authMethod, { width: cols[6].width - 8 });

                    const maxHeight = Math.max(statusHeight, userHeight, detailsHeight, roleHeight, authHeight, 9);
                    const rowHeight = Math.max(maxHeight + 8, 18); // Minimum 18pt row height for clean vertical rhythm

                    // Page break handling
                    if (currentY + rowHeight > bottomLimit) {
                        doc.addPage();
                        currentY = drawHeader();
                        currentY = drawTableHeader(currentY);
                    }

                    // Alternating background
                    const bg = (idx % 2 === 0) ? '#FFFFFF' : '#F8FAFC';
                    doc.rect(leftMargin, currentY, usableWidth, rowHeight)
                       .fillColor(bg)
                       .fill();

                    // Bottom border
                    doc.strokeColor('#E2E8F0')
                       .lineWidth(0.5)
                       .moveTo(leftMargin, currentY + rowHeight)
                       .lineTo(pageWidth - rightMargin, currentY + rowHeight)
                       .stroke();

                    // Render Cell Values
                    let currentX = leftMargin;
                    const textY = currentY + 5;

                    // 1. Date
                    doc.font('Helvetica').fontSize(7).fillColor('#334155')
                       .text(rec.date, currentX + 4, textY, { width: cols[0].width - 8, align: cols[0].align });
                    currentX += cols[0].width;

                    // 2. Time
                    doc.font('Helvetica').fontSize(7).fillColor('#334155')
                       .text(rec.time, currentX + 4, textY, { width: cols[1].width - 8, align: cols[1].align });
                    currentX += cols[1].width;

                    // 3. Room
                    doc.font('Helvetica-Bold').fontSize(7.2).fillColor('#0F172A')
                       .text(rec.room, currentX + 2, textY, { width: cols[2].width - 4, align: cols[2].align });
                    currentX += cols[2].width;

                    // 4. Status / Event with subtle semantic coloring
                    let statusColor = '#0F172A';
                    if (rec.status.includes('Returned')) statusColor = '#059669'; // Emerald Green
                    else if (rec.status.includes('Taken') || rec.status.includes('Borrowed')) statusColor = '#D97706'; // Warm Amber
                    else if (rec.status.includes('Unauthorized') || rec.status.includes('Wrong')) statusColor = '#DC2626'; // Crimson Red
                    else if (rec.status.includes('Transfer')) statusColor = '#2563EB'; // Royal Blue

                    doc.font('Helvetica-Bold').fontSize(7).fillColor(statusColor)
                       .text(rec.status, currentX + 4, textY, { width: cols[3].width - 8, align: cols[3].align });
                    currentX += cols[3].width;

                    // 5. User / Person
                    doc.font('Helvetica').fontSize(7).fillColor('#0F172A')
                       .text(rec.user, currentX + 4, textY, { width: cols[4].width - 8, align: cols[4].align });
                    currentX += cols[4].width;

                    // 6. Role
                    doc.font('Helvetica').fontSize(6.8).fillColor('#475569')
                       .text(rec.role, currentX + 4, textY, { width: cols[5].width - 8, align: cols[5].align });
                    currentX += cols[5].width;

                    // 7. Auth Method
                    doc.font('Helvetica').fontSize(6.8).fillColor('#475569')
                       .text(rec.authMethod, currentX + 4, textY, { width: cols[6].width - 8, align: cols[6].align });
                    currentX += cols[6].width;

                    // 8. Details
                    doc.font('Helvetica').fontSize(6.8).fillColor('#64748B')
                       .text(rec.details, currentX + 4, textY, { width: cols[7].width - 8, align: cols[7].align });

                    currentY += rowHeight;
                });
            }

            // Post-Process Footers (Page X of Y) on all buffered pages
            const pages = doc.bufferedPageRange();
            const totalPages = pages.count;

            for (let i = 0; i < totalPages; i++) {
                doc.switchToPage(i);
                const savedBottomMargin = doc.page.margins.bottom;
                doc.page.margins.bottom = 0; // prevent accidental page breaks during footer rendering

                const footerLineY = 804;
                const footerTextY = 810;

                // Footer top line
                doc.strokeColor('#CBD5E1')
                   .lineWidth(0.5)
                   .moveTo(leftMargin, footerLineY)
                   .lineTo(pageWidth - rightMargin, footerLineY)
                   .stroke();

                doc.font('Helvetica')
                   .fontSize(7)
                   .fillColor('#64748B')
                   .text('Bulacan State University – Sarmiento Campus · IT Laboratory Monitoring System · Official Record', leftMargin, footerTextY, {
                       width: usableWidth - 100,
                       align: 'left',
                       lineBreak: false
                   });

                doc.font('Helvetica')
                   .fontSize(7)
                   .fillColor('#64748B')
                   .text(`Page ${i + 1} of ${totalPages}`, pageWidth - rightMargin - 90, footerTextY, {
                       width: 90,
                       align: 'right',
                       lineBreak: false
                   });

                doc.page.margins.bottom = savedBottomMargin;
            }

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = {
    resolvePeriodDates,
    resolveRoomFilter,
    generateReportFilename,
    getRoomStatusActivityReportData,
    buildRoomStatusReportPDF,
    formatLongDate
};
