'use strict';

/**
 * services/keyAuthorizationService.js
 * Business logic for advance laboratory key reservation requests,
 * conflict prevention, Dept Head approvals, and pickup verification.
 */

const db = require('../database/connection');
const keyAuthRepo = require('../repositories/key-authorization.repository');
const labRepo = require('../repositories/laboratory.repository');
const auditService = require('./auditService');
const emailService = require('./email/email.service');
const appConfig = require('../config/app.config');
const { KEY_TRANSFER_ROLES, IT_HEAD_ROLES, IT_DEPT_HEAD_EXCLUSIVE_ROLES } = require('../middleware/auth');
const scheduleRepo = require('../repositories/schedule.repository');
const AcademicTerm = require('../js/utils/academic-term');

function getPhilippineTimeContext(target = null) {
    const d = target ? new Date(target) : new Date();
    const day = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        weekday: 'long'
    }).format(d);
    const time = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Manila',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
    }).format(d);
    const dateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila'
    }).format(d);
    return { day, time, dateStr, date: d };
}

/**
 * Computes maximum allowed reservation date (Saturday of next week).
 * Academic weeks run Monday through Saturday.
 */
function getMaxAllowedReservationDate() {
    const now = new Date();
    const day = now.getDay(); // 0 is Sun, 1 is Mon, ..., 6 is Sat
    const daysToThisSaturday = day === 0 ? 6 : (6 - day);
    const daysToNextSaturday = daysToThisSaturday + 7;
    const maxDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToNextSaturday);
    const y = maxDate.getFullYear();
    const m = String(maxDate.getMonth() + 1).padStart(2, '0');
    const d = String(maxDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getTodayDateString() {
    return getPhilippineTimeContext().dateStr;
}

/**
 * Submit an advance reservation request to borrow an additional laboratory key.
 */
async function requestAdditionalKey(userId, userRole, userName, roomId, reason, reservationDate = null, startTime = null, endTime = null, req = null, options = {}) {
    if (!userId) {
        return { status: 401, error: 'Authentication required' };
    }

    if (!KEY_TRANSFER_ROLES.includes(userRole)) {
        return {
            status: 403,
            error: 'Forbidden: Only Faculty and Department Heads may request key authorizations.'
        };
    }

    const parsedRoomId = Number(roomId);
    if (!Number.isInteger(parsedRoomId) || parsedRoomId <= 0) {
        return { status: 400, error: 'Valid laboratory Room ID is required.' };
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
        return { status: 400, error: 'Please provide a justification reason (at least 5 characters).' };
    }

    const cleanReason = reason.trim().substring(0, 500);

    // Verify target room exists
    const [rooms] = await db.query('SELECT Room_ID, Room_Number, Building FROM laboratories WHERE Room_ID = ?', [parsedRoomId]);
    if (rooms.length === 0) {
        return { status: 404, error: 'Target laboratory room not found.' };
    }
    const targetRoom = rooms[0];

    // Check if user currently holds 2 or more physical keys
    const [activeKeys] = await labRepo.findActiveKeysByUserId(userId);
    if (activeKeys && activeKeys.length >= 2) {
        return {
            status: 400,
            error: 'Key limit reached: You cannot hold more than 2 keys simultaneously under any circumstance.'
        };
    }

    // Check if user already holds THIS specific room key right now
    const holdsThisKey = (activeKeys || []).some(k => k.Room_ID === parsedRoomId);
    if (holdsThisKey) {
        return { status: 400, error: `You already hold the physical key for Room ${targetRoom.Room_Number}.` };
    }

    const todayStr = getTodayDateString();
    const maxDateStr = getMaxAllowedReservationDate();

    // Validate Reservation Date
    let cleanDate = todayStr;
    if (reservationDate) {
        const rawDate = String(reservationDate).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
            return { status: 400, error: 'Invalid reservation date format. Please use YYYY-MM-DD.' };
        }
        cleanDate = rawDate;
        const [yr, mo, da] = cleanDate.split('-').map(Number);
        const dateObj = new Date(yr, mo - 1, da);
        if (isNaN(dateObj.getTime())) {
            return { status: 400, error: 'Invalid reservation date provided.' };
        }
        if (dateObj.getDay() === 0) {
            return { status: 400, error: 'Reservations are only available Monday through Saturday. Sunday classes are not held.' };
        }
        if (cleanDate < todayStr) {
            return { status: 400, error: 'Reservation date cannot be in the past.' };
        }
        if (cleanDate > maxDateStr) {
            return { status: 400, error: `Reservation date cannot exceed next week's Saturday (${maxDateStr}).` };
        }
    }

    // Validate Reservation Time Window
    let cleanStartTime = null;
    let cleanEndTime = null;
    let calculatedDuration = 120;

    if (startTime && endTime) {
        const sMatch = String(startTime).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        const eMatch = String(endTime).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (!sMatch || !eMatch) {
            return { status: 400, error: 'Invalid time format. Please provide valid start and end times (HH:MM).' };
        }
        const sHour = parseInt(sMatch[1], 10);
        const sMin = parseInt(sMatch[2], 10);
        const eHour = parseInt(eMatch[1], 10);
        const eMin = parseInt(eMatch[2], 10);

        if (sHour < 7 || sHour > 20 || eHour < 7 || (eHour === 21 && eMin > 0) || eHour > 21) {
            return { status: 400, error: 'Reservations must be within campus laboratory hours (7:00 AM – 9:00 PM).' };
        }

        const startTotalMin = sHour * 60 + sMin;
        const endTotalMin = eHour * 60 + eMin;

        if (endTotalMin <= startTotalMin) {
            return { status: 400, error: 'Reservation end time must be after start time.' };
        }

        calculatedDuration = endTotalMin - startTotalMin;
        if (calculatedDuration < 30) {
            return { status: 400, error: 'Reservation duration must be at least 30 minutes.' };
        }
        if (calculatedDuration > 360) {
            return { status: 400, error: 'Reservation duration cannot exceed 6 hours.' };
        }

        cleanStartTime = `${String(sHour).padStart(2, '0')}:${String(sMin).padStart(2, '0')}:00`;
        cleanEndTime = `${String(eHour).padStart(2, '0')}:${String(eMin).padStart(2, '0')}:00`;

        if (cleanDate === todayStr) {
            const now = new Date();
            const currentTotalMin = now.getHours() * 60 + now.getMinutes();
            // Allow up to 15 min buffer
            if (startTotalMin + 15 < currentTotalMin) {
                return { status: 400, error: 'Reservation start time cannot be in the past for today.' };
            }
        }
    } else {
        const now = new Date();
        const sHour = now.getHours();
        const sMin = now.getMinutes();
        cleanStartTime = `${String(sHour).padStart(2, '0')}:${String(sMin).padStart(2, '0')}:00`;
        const endTotal = sHour * 60 + sMin + 120;
        const eH = Math.min(21, Math.floor(endTotal / 60));
        const eM = endTotal % 60;
        cleanEndTime = `${String(eH).padStart(2, '0')}:${String(eM).padStart(2, '0')}:00`;
        calculatedDuration = 120;
    }

    // Authoritative check: Prevent reservation request if professor has an official class schedule
    // for this room that overlaps the requested reservation date and time window
    const [yr, mo, da] = cleanDate.split('-').map(Number);
    const resDateMidday = new Date(Date.UTC(yr, mo - 1, da, 4, 0, 0)); // Midday in Asia/Manila (+08:00)
    const resDayOfWeek = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', weekday: 'long' }).format(resDateMidday);
    const resTerm = AcademicTerm.getActiveTerm(resDateMidday);

    const [targetSchedConflicts] = await scheduleRepo.findOfficialScheduleConflictsForUser(
        userId,
        parsedRoomId,
        resDayOfWeek,
        cleanStartTime,
        cleanEndTime,
        resTerm ? resTerm.academicYear : null,
        resTerm ? resTerm.semester : null
    );

    if (targetSchedConflicts && targetSchedConflicts.length > 0) {
        const cSched = targetSchedConflicts[0];
        const sStr = String(cSched.Start_Time).slice(0, 5);
        const eStr = String(cSched.End_Time).slice(0, 5);
        return {
            status: 409,
            error: `You already have an official class schedule for Room ${targetRoom.Room_Number} on ${cleanDate} (${sStr} – ${eStr}). You can take your assigned room's key directly through the standard process without requesting a second key.`
        };
    }

    const connection = await db.getConnection();
    let requestId = null;
    try {
        await connection.beginTransaction();

        // Lock user row to serialize concurrent reservation requests for this user
        await scheduleRepo.lockUserForUpdate(userId, connection);

        // Re-verify in transaction: user key limit
        const [activeKeysInTx] = await labRepo.findActiveKeysByUserId(userId, connection);
        if (activeKeysInTx && activeKeysInTx.length >= 2) {
            await connection.rollback();
            return {
                status: 400,
                error: 'Key limit reached: You cannot hold more than 2 keys simultaneously under any circumstance.'
            };
        }

        // Check for conflicting reservations for this room and time window
        const [conflicts] = await keyAuthRepo.findConflictingReservations(parsedRoomId, cleanDate, cleanStartTime, cleanEndTime, null, connection);
        if (conflicts && conflicts.length > 0) {
            await connection.rollback();
            const c = conflicts[0];
            const sStr = String(c.Start_Time).slice(0, 5);
            const eStr = String(c.End_Time).slice(0, 5);
            return {
                status: 409,
                error: `Room ${targetRoom.Room_Number} is already reserved by ${c.Requester_Name} on ${cleanDate} (${sStr} – ${eStr}). Please choose another room or time slot.`
            };
        }

        // Check if user already has an active PENDING request for this room on the same date
        const [userPending] = await keyAuthRepo.findPendingByUserId(userId, connection);
        const dupPending = (userPending || []).find(r => r.Room_ID === parsedRoomId && String(r.Reservation_Date).slice(0, 10) === cleanDate);
        if (dupPending) {
            await connection.rollback();
            return {
                status: 409,
                error: `You already have a pending key reservation for Room ${targetRoom.Room_Number} on ${cleanDate} awaiting Department Head review.`
            };
        }

        // Insert reservation request
        const [result] = await keyAuthRepo.createRequest(
            userId,
            parsedRoomId,
            cleanReason,
            cleanDate,
            cleanStartTime,
            cleanEndTime,
            connection
        );
        requestId = result.insertId;

        await connection.commit();
    } catch (txErr) {
        await connection.rollback();
        throw txErr;
    } finally {
        connection.release();
    }

    await auditService.logSecurityEvent({
        req,
        action: 'KEY_AUTHORIZATION_REQUESTED',
        resourceType: 'LAB_KEY',
        resourceId: requestId,
        details: {
            userId,
            userName,
            roomId: parsedRoomId,
            roomNumber: targetRoom.Room_Number,
            reservationDate: cleanDate,
            startTime: cleanStartTime,
            endTime: cleanEndTime,
            durationMinutes: calculatedDuration,
            reason: cleanReason
        },
        result: 'SUCCESS'
    });

    // Asynchronously dispatch urgent notification email to IT Department Head(s)
    setImmediate(async () => {
        try {
            const [deptHeads] = await db.query(
                "SELECT User_ID, Name, Email FROM users WHERE Role IN ('IT Dept. Head', 'IT Head', 'IT Dept Head', 'Department Head')"
            );
            if (deptHeads && deptHeads.length > 0) {
                const heldStr = (activeKeys && activeKeys.length > 0)
                    ? activeKeys.map(k => `Room ${k.Room_Number}`).join(', ')
                    : 'None';
                const reviewLink = `${appConfig.APP_URL}/it-head-dashboard.html`;
                const dateDisplay = `${cleanDate} (${cleanStartTime.slice(0, 5)} – ${cleanEndTime.slice(0, 5)})`;

                for (const head of deptHeads) {
                    if (head.Email) {
                        await emailService.sendKeyAuthorizationEmail(head.Email, head.Name, {
                            requesterName: userName || 'Faculty Member',
                            requesterRole: userRole || 'Faculty',
                            requestedRoom: targetRoom.Room_Number,
                            heldRooms: heldStr,
                            reason: cleanReason,
                            reviewLink,
                            requestedAt: dateDisplay
                        });
                    }
                }
            }
        } catch (e) {
            console.error('[KeyAuthService] Failed to dispatch Dept Head email notification:', e.message);
        }
    });

    return {
        status: 201,
        message: `Advance reservation request for Room ${targetRoom.Room_Number} on ${cleanDate} (${cleanStartTime.slice(0, 5)} – ${cleanEndTime.slice(0, 5)}) submitted successfully to the Department Head.`,
        data: {
            requestId,
            roomId: parsedRoomId,
            roomNumber: targetRoom.Room_Number,
            reservationDate: cleanDate,
            startTime: cleanStartTime,
            endTime: cleanEndTime,
            durationMinutes: calculatedDuration,
            reason: cleanReason,
            status: 'PENDING'
        }
    };
}

function toLocalDateString(d) {
    if (!d) return null;
    if (typeof d === 'string') return d.split('T')[0];
    if (d instanceof Date) {
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(d);
    }
    return String(d).split('T')[0];
}

/**
 * Get active/latest key authorization status for the logged-in faculty.
 */
async function getFacultyRequestStatus(userId, options = {}) {
    if (!userId) {
        return { status: 401, error: 'Authentication required' };
    }

    const phNow = getPhilippineTimeContext((options && options.referenceTime) || null);

    // Lazy cleanup of expired approved requests
    try {
        await keyAuthRepo.expireOldApprovedRequests(phNow.dateStr, phNow.time);
    } catch (e) {
        console.error('[KeyAuthService] Expiration cleanup failed:', e.message);
    }

    const [rows] = await keyAuthRepo.findLatestRequestForFaculty(userId);
    let request = (rows && rows.length > 0) ? rows[0] : null;

    // Retrieve active held keys context
    const [heldKeys] = await labRepo.findActiveKeysByUserId(userId);
    const heldCount = (heldKeys || []).length;
    const heldList = (heldKeys || []).map(k => ({ Room_ID: k.Room_ID, Room_Number: k.Room_Number }));

    // Retrieve active official scheduled rooms in Philippine Time
    const activeTerm = AcademicTerm.getActiveTerm(phNow.date);
    const [activeSchedRows] = await scheduleRepo.findActiveOfficialScheduleForUser(
        userId,
        null,
        phNow.day,
        phNow.time,
        activeTerm ? activeTerm.academicYear : null,
        activeTerm ? activeTerm.semester : null
    );
    const activeScheduledRooms = (activeSchedRows || []).map(s => ({
        Room_ID: s.Room_ID,
        Room_Number: s.Room_Number,
        Building: s.Building,
        Start_Time: String(s.Start_Time).slice(0, 5),
        End_Time: String(s.End_Time).slice(0, 5),
        Subject_Name: s.Subject_Name
    }));

    if (request) {
        request.heldCount = heldCount;
        request.heldRooms = heldList;
        request.activeScheduledRooms = activeScheduledRooms;

        if (request.Reservation_Date && request.Start_Time && request.End_Time) {
            const resDateStr = toLocalDateString(request.Reservation_Date);
            const startTimeStr = String(request.Start_Time).slice(0, 5);
            const endTimeStr = String(request.End_Time).slice(0, 5);

            request.Reservation_Date_Str = resDateStr;
            request.Start_Time_Str = startTimeStr;
            request.End_Time_Str = endTimeStr;

            const cleanStart = startTimeStr.length === 5 ? startTimeStr + ':00' : startTimeStr;
            const cleanEnd = endTimeStr.length === 5 ? endTimeStr + ':00' : endTimeStr;

            const pickupStart = new Date(`${resDateStr}T${cleanStart}+08:00`);
            const pickupEnd = new Date(`${resDateStr}T${cleanEnd}+08:00`);

            const now = phNow.date;
            request.isPickupReady = (request.Status === 'APPROVED' && now >= pickupStart && now < pickupEnd);
            request.isFutureReservation = (request.Status === 'APPROVED' && now < pickupStart);
            request.isExpired = (now >= pickupEnd && request.Status !== 'CLAIMED' && request.Status !== 'COMPLETED');
            request.Pickup_Opens_At = pickupStart.toISOString();

            if (request.isExpired && request.Status === 'PENDING') {
                request.Status = 'EXPIRED';
            }

            const remainingMs = pickupEnd.getTime() - now.getTime();
            request.Minutes_Remaining = remainingMs > 0 ? Math.floor(remainingMs / (60 * 1000)) : 0;
        } else {
            const now = phNow.date;
            const isExpired = request.Expires_At ? (now >= new Date(request.Expires_At)) : false;
            request.isExpired = (isExpired && request.Status !== 'CLAIMED' && request.Status !== 'COMPLETED');
            request.isPickupReady = (request.Status === 'APPROVED' && !isExpired);
            request.isFutureReservation = false;

            if (request.Expires_At) {
                const remainingMs = new Date(request.Expires_At).getTime() - now.getTime();
                request.Minutes_Remaining = remainingMs > 0 ? Math.floor(remainingMs / (60 * 1000)) : 0;
            }
        }

        return {
            status: 200,
            data: request
        };
    }

    return {
        status: 200,
        data: {
            Status: null,
            heldCount,
            heldRooms: heldList,
            activeScheduledRooms
        }
    };
}

/**
 * Get all pending key authorization requests for the Department Head dashboard.
 * Supports optional filtering by status ('pending', 'approved', 'all').
 */
async function getPendingRequestsForDeptHead(userId, userRole, filter = 'pending', options = {}) {
    if (!userId) {
        return { status: 401, error: 'Authentication required' };
    }

    if (!IT_DEPT_HEAD_EXCLUSIVE_ROLES.includes(userRole)) {
        return { status: 403, error: 'Forbidden: Only authorized department administrators can review key requests.' };
    }

    const phNow = getPhilippineTimeContext((options && options.referenceTime) || null);

    try {
        await keyAuthRepo.expireOldApprovedRequests(phNow.dateStr, phNow.time);
    } catch (e) {
        console.error('[KeyAuthService] Expiration cleanup failed:', e.message);
    }

    const cleanFilter = String(filter || 'pending').trim().toLowerCase();
    if (cleanFilter === 'approved') {
        const [approved] = await keyAuthRepo.findAllApprovedForDeptHead();
        return {
            status: 200,
            data: approved
        };
    }

    if (cleanFilter === 'all') {
        const [allReqs] = await keyAuthRepo.findAllForDeptHead();
        return {
            status: 200,
            data: allReqs
        };
    }

    const [pending] = await keyAuthRepo.findAllPendingForDeptHead();

    return {
        status: 200,
        data: pending
    };
}

/**
 * Get approved key authorization requests for the Department Head dashboard.
 */
async function getApprovedRequestsForDeptHead(userId, userRole) {
    return getPendingRequestsForDeptHead(userId, userRole, 'approved');
}

/**
 * Approve a pending key authorization request.
 */
async function approveRequest(requestId, approvedBy, userRole, durationMinutes = null, req = null, options = {}) {
    if (!approvedBy) {
        return { status: 401, error: 'Authentication required' };
    }

    if (!IT_DEPT_HEAD_EXCLUSIVE_ROLES.includes(userRole)) {
        return { status: 403, error: 'Forbidden: Only authorized department administrators can approve key requests.' };
    }

    const parsedRequestId = Number(requestId);
    if (!Number.isInteger(parsedRequestId) || parsedRequestId <= 0) {
        return { status: 400, error: 'Valid Request ID is required.' };
    }

    const connection = await db.getConnection();
    let requestInfo = null;
    let expiresAt = null;
    let finalDuration = 120;

    try {
        await connection.beginTransaction();

        const [rows] = await keyAuthRepo.findByIdForUpdate(parsedRequestId, connection);
        if (rows.length === 0) {
            await connection.rollback();
            return { status: 404, error: 'Key request record not found.' };
        }

        requestInfo = rows[0];

        if (requestInfo.Status !== 'PENDING') {
            await connection.rollback();
            return {
                status: 400,
                error: `Cannot approve request: Current status is '${requestInfo.Status}'.`
            };
        }

        const now = (options && options.referenceTime) ? new Date(options.referenceTime) : new Date();

        // Set expiresAt to the reservation date and end time in Philippine Time (+08:00)
        if (requestInfo.Reservation_Date && requestInfo.End_Time) {
            const dateStr = toLocalDateString(requestInfo.Reservation_Date);
            const cleanEndTime = String(requestInfo.End_Time).trim();
            const cleanEnd = cleanEndTime.length === 5 ? cleanEndTime + ':00' : cleanEndTime;
            expiresAt = new Date(`${dateStr}T${cleanEnd}+08:00`);

            if (requestInfo.Duration_Minutes) {
                finalDuration = requestInfo.Duration_Minutes;
            }

            // An approval made after the reservation has already ended must not revive that expired pickup window
            if (expiresAt <= now) {
                await connection.query("UPDATE key_authorization_requests SET Status = 'EXPIRED' WHERE Request_ID = ?", [parsedRequestId]);
                await connection.commit();
                return {
                    status: 400,
                    error: 'Cannot approve request: The scheduled reservation window has already ended.'
                };
            }
        } else {
            const parsedDuration = Math.max(15, Math.min(1440, Number(durationMinutes) || 120));
            finalDuration = parsedDuration;
            expiresAt = new Date(now.getTime() + parsedDuration * 60 * 1000);
        }

        await keyAuthRepo.approveRequest(parsedRequestId, approvedBy, finalDuration, expiresAt, connection);
        await connection.commit();
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }

    await auditService.logSecurityEvent({
        req,
        action: 'KEY_AUTHORIZATION_APPROVED',
        resourceType: 'LAB_KEY',
        resourceId: parsedRequestId,
        details: {
            requestId: parsedRequestId,
            approvedBy,
            requesterId: requestInfo.User_ID,
            requesterName: requestInfo.Requester_Name,
            roomId: requestInfo.Room_ID,
            roomNumber: requestInfo.Room_Number,
            reservationDate: requestInfo.Reservation_Date,
            durationMinutes: finalDuration,
            expiresAt: expiresAt ? expiresAt.toISOString() : null
        },
        result: 'SUCCESS'
    });

    // Asynchronously notify faculty member of approval
    setImmediate(async () => {
        try {
            const [facultyRows] = await db.query('SELECT Name, Email FROM users WHERE User_ID = ?', [requestInfo.User_ID]);
            const [approverRows] = await db.query('SELECT Name FROM users WHERE User_ID = ?', [approvedBy]);
            if (facultyRows && facultyRows.length > 0 && facultyRows[0].Email) {
                await emailService.sendKeyAuthorizationOutcomeEmail(facultyRows[0].Email, facultyRows[0].Name, {
                    status: 'APPROVED',
                    roomNumber: requestInfo.Room_Number,
                    approverName: (approverRows && approverRows.length > 0) ? approverRows[0].Name : 'IT Department Head',
                    durationMinutes: finalDuration,
                    actionLink: `${appConfig.APP_URL}/room-status.html`
                });
            }
        } catch (e) {
            console.error('[KeyAuthService] Failed to dispatch approval email to faculty:', e.message);
        }
    });

    return {
        status: 200,
        message: `Key request for Room ${requestInfo.Room_Number} approved for ${requestInfo.Requester_Name}.`,
        data: {
            requestId: parsedRequestId,
            status: 'APPROVED',
            durationMinutes: finalDuration,
            expiresAt: expiresAt ? expiresAt.toISOString() : null
        }
    };
}

/**
 * Decline/reject a pending key authorization request.
 */
async function rejectRequest(requestId, approvedBy, userRole, rejectionReason = null, req = null) {
    if (!approvedBy) {
        return { status: 401, error: 'Authentication required' };
    }

    if (!IT_DEPT_HEAD_EXCLUSIVE_ROLES.includes(userRole)) {
        return { status: 403, error: 'Forbidden: Only authorized department administrators can decline key requests.' };
    }

    const parsedRequestId = Number(requestId);
    if (!Number.isInteger(parsedRequestId) || parsedRequestId <= 0) {
        return { status: 400, error: 'Valid Request ID is required.' };
    }

    const cleanReason = (rejectionReason && typeof rejectionReason === 'string' && rejectionReason.trim())
        ? rejectionReason.trim().substring(0, 500)
        : 'Declined by Department Head.';

    const connection = await db.getConnection();
    let requestInfo = null;

    try {
        await connection.beginTransaction();

        const [rows] = await keyAuthRepo.findByIdForUpdate(parsedRequestId, connection);
        if (rows.length === 0) {
            await connection.rollback();
            return { status: 404, error: 'Key request record not found.' };
        }

        requestInfo = rows[0];

        if (requestInfo.Status !== 'PENDING') {
            await connection.rollback();
            return {
                status: 400,
                error: `Cannot decline request: Current status is '${requestInfo.Status}'.`
            };
        }

        await keyAuthRepo.rejectRequest(parsedRequestId, approvedBy, cleanReason, connection);
        await connection.commit();
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }

    await auditService.logSecurityEvent({
        req,
        action: 'KEY_AUTHORIZATION_REJECTED',
        resourceType: 'LAB_KEY',
        resourceId: parsedRequestId,
        details: {
            requestId: parsedRequestId,
            approvedBy,
            requesterId: requestInfo.User_ID,
            requesterName: requestInfo.Requester_Name,
            roomId: requestInfo.Room_ID,
            roomNumber: requestInfo.Room_Number,
            reason: cleanReason
        },
        result: 'SUCCESS'
    });

    // Asynchronously notify faculty member of rejection
    setImmediate(async () => {
        try {
            const [facultyRows] = await db.query('SELECT Name, Email FROM users WHERE User_ID = ?', [requestInfo.User_ID]);
            const [approverRows] = await db.query('SELECT Name FROM users WHERE User_ID = ?', [approvedBy]);
            if (facultyRows && facultyRows.length > 0 && facultyRows[0].Email) {
                await emailService.sendKeyAuthorizationOutcomeEmail(facultyRows[0].Email, facultyRows[0].Name, {
                    status: 'REJECTED',
                    roomNumber: requestInfo.Room_Number,
                    approverName: (approverRows && approverRows.length > 0) ? approverRows[0].Name : 'IT Department Head',
                    rejectionReason: cleanReason,
                    actionLink: `${appConfig.APP_URL}/index.html`
                });
            }
        } catch (e) {
            console.error('[KeyAuthService] Failed to dispatch decline email to faculty:', e.message);
        }
    });

    return {
        status: 200,
        message: `Key request for Room ${requestInfo.Room_Number} declined.`,
        data: {
            requestId: parsedRequestId,
            status: 'REJECTED',
            rejectionReason: cleanReason
        }
    };
}

/**
 * Cancel a pending or approved key reservation request.
 */
async function cancelRequest(requestId, userId, userRole, req = null) {
    if (!userId) {
        return { status: 401, error: 'Authentication required' };
    }

    const parsedRequestId = Number(requestId);
    if (!Number.isInteger(parsedRequestId) || parsedRequestId <= 0) {
        return { status: 400, error: 'Valid Request ID is required.' };
    }

    const [rows] = await keyAuthRepo.findById(parsedRequestId);
    if (!rows || rows.length === 0) {
        return { status: 404, error: 'Reservation request not found.' };
    }

    const requestInfo = rows[0];
    if (requestInfo.User_ID !== userId && !IT_DEPT_HEAD_EXCLUSIVE_ROLES.includes(userRole)) {
        return { status: 403, error: 'You are not authorized to cancel this reservation.' };
    }

    if (requestInfo.Status === 'CLAIMED' || requestInfo.Status === 'COMPLETED') {
        return { status: 400, error: 'Cannot cancel a reservation that has already been claimed or completed.' };
    }

    await keyAuthRepo.cancelRequest(parsedRequestId, requestInfo.User_ID);

    await auditService.logSecurityEvent({
        req,
        action: 'KEY_RESERVATION_CANCELLED',
        resourceType: 'LAB_KEY',
        resourceId: parsedRequestId,
        details: {
            requestId: parsedRequestId,
            userId,
            roomId: requestInfo.Room_ID,
            roomNumber: requestInfo.Room_Number
        },
        result: 'SUCCESS'
    });

    return {
        status: 200,
        message: `Reservation for Room ${requestInfo.Room_Number} has been cancelled.`
    };
}

/**
 * Check if a user has an active, approved authorization to claim a specific room's key.
 */
async function checkActiveApproval(userId, roomId, executor = db) {
    if (!userId || !roomId) return null;
    const ph = getPhilippineTimeContext();
    const [rows] = await keyAuthRepo.findActiveApprovedByUserIdAndRoom(userId, roomId, executor, ph.dateStr, ph.time);
    return (rows && rows.length > 0) ? rows[0] : null;
}

/**
 * Check if a user has an active, approved authorization to claim by room number.
 */
async function checkActiveApprovalByRoomNumber(userId, roomNumber, executor = db) {
    if (!userId || !roomNumber) return null;
    const ph = getPhilippineTimeContext();
    const [rows] = await keyAuthRepo.findActiveApprovedByUserIdAndRoomNumber(userId, roomNumber, executor, ph.dateStr, ph.time);
    return (rows && rows.length > 0) ? rows[0] : null;
}

/**
 * Get room availability & conflict status for a specific date and time window.
 */
async function getRoomAvailability(reservationDate, startTime, endTime, userId = null, options = {}) {
    const todayStr = getTodayDateString();
    let cleanDate = reservationDate ? String(reservationDate).trim() : todayStr;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
        cleanDate = todayStr;
    }

    let cleanStartTime = startTime ? String(startTime).trim() : '08:00:00';
    if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(cleanStartTime)) cleanStartTime = '08:00:00';
    if (cleanStartTime.length === 5) cleanStartTime += ':00';

    let cleanEndTime = endTime ? String(endTime).trim() : '10:00:00';
    if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(cleanEndTime)) cleanEndTime = '10:00:00';
    if (cleanEndTime.length === 5) cleanEndTime += ':00';

    const [conflicts] = await keyAuthRepo.findAllRoomConflicts(cleanDate, cleanStartTime, cleanEndTime);

    const rooms = {};
    (conflicts || []).forEach(row => {
        const rId = row.Room_ID;
        const isReserved = row.Status === 'APPROVED' || row.Status === 'CLAIMED';
        // Priority: If already marked RESERVED, keep RESERVED. Otherwise if PENDING, upgrade to RESERVED if this row is approved/claimed.
        if (!rooms[rId] || isReserved) {
            rooms[rId] = {
                roomId: rId,
                roomNumber: row.Room_Number,
                building: row.Building,
                status: isReserved ? 'RESERVED' : 'PENDING',
                label: isReserved ? 'Reserved' : 'Pending',
                badgeClass: isReserved ? 'is-reserved-badge' : 'is-pending-badge',
                requesterName: row.Requester_Name,
                startTime: String(row.Start_Time).slice(0, 5),
                endTime: String(row.End_Time).slice(0, 5),
                requestId: row.Request_ID
            };
        }
    });

    if (userId) {
        const [yr, mo, da] = cleanDate.split('-').map(Number);
        const resDateMidday = new Date(Date.UTC(yr, mo - 1, da, 4, 0, 0));
        const resDayOfWeek = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', weekday: 'long' }).format(resDateMidday);
        const resTerm = AcademicTerm.getActiveTerm(resDateMidday);

        // Check if the user has an official schedule in any room during the target reservation window
        const [userScheds] = await scheduleRepo.findUserOfficialSchedulesOnDay(
            userId,
            resDayOfWeek,
            cleanStartTime,
            cleanEndTime,
            resTerm ? resTerm.academicYear : null,
            resTerm ? resTerm.semester : null
        );

        (userScheds || []).forEach(row => {
            const rId = row.Room_ID;
            rooms[rId] = {
                roomId: rId,
                roomNumber: row.Room_Number,
                building: row.Building,
                status: 'SCHEDULED',
                label: 'Assigned Schedule',
                badgeClass: 'is-scheduled-badge',
                requesterName: 'Your Scheduled Class',
                startTime: String(row.Start_Time).slice(0, 5),
                endTime: String(row.End_Time).slice(0, 5),
                isScheduled: true
            };
        });
    }

    return {
        status: 200,
        data: {
            date: cleanDate,
            startTime: cleanStartTime.slice(0, 5),
            endTime: cleanEndTime.slice(0, 5),
            rooms
        }
    };
}

module.exports = {
    getMaxAllowedReservationDate,
    getTodayDateString,
    requestAdditionalKey,
    getFacultyRequestStatus,
    getPendingRequestsForDeptHead,
    getApprovedRequestsForDeptHead,
    approveRequest,
    rejectRequest,
    cancelRequest,
    checkActiveApproval,
    checkActiveApprovalByRoomNumber,
    getRoomAvailability,
    getPhilippineTimeContext
};
