'use strict';

/**
 * services/keyAuthorizationService.js
 * Business logic for requesting, reviewing, approving, and managing
 * multi-key authorization workflows between Faculty and IT Department Head.
 */

const db = require('../database/connection');
const keyAuthRepo = require('../repositories/key-authorization.repository');
const labRepo = require('../repositories/laboratory.repository');
const auditService = require('./auditService');
const emailService = require('./email/email.service');
const appConfig = require('../config/app.config');
const { KEY_TRANSFER_ROLES } = require('../middleware/auth');

/**
 * Submit a request to borrow an additional laboratory key.
 */
async function requestAdditionalKey(userId, userRole, userName, roomId, reason, req = null) {
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

    // Verify room exists
    const [rooms] = await db.query('SELECT Room_ID, Room_Number, Building FROM laboratories WHERE Room_ID = ?', [parsedRoomId]);
    if (rooms.length === 0) {
        return { status: 404, error: 'Target laboratory room not found.' };
    }
    const targetRoom = rooms[0];

    // Check if user already holds 2 or more keys
    const [activeKeys] = await labRepo.findActiveKeysByUserId(userId);
    if (activeKeys && activeKeys.length >= 2) {
        return {
            status: 400,
            error: 'Key limit reached: You cannot hold more than 2 keys simultaneously under any circumstance.'
        };
    }

    // Check if user already holds THIS specific room key
    const holdsThisKey = (activeKeys || []).some(k => k.Room_ID === parsedRoomId);
    if (holdsThisKey) {
        return { status: 400, error: `You already hold the key for Room ${targetRoom.Room_Number}.` };
    }

    // Check if user already has an active PENDING request
    const [pendingRequests] = await keyAuthRepo.findPendingByUserId(userId);
    if (pendingRequests && pendingRequests.length > 0) {
        return {
            status: 409,
            error: `You already have a pending key request for Room ${pendingRequests[0].Room_Number} awaiting Department Head review.`
        };
    }

    // Check if user already has an active APPROVED authorization for this room
    const [existingApproved] = await keyAuthRepo.findActiveApprovedByUserIdAndRoom(userId, parsedRoomId);
    if (existingApproved && existingApproved.length > 0) {
        return {
            status: 200,
            message: `You already have an active approval for Room ${targetRoom.Room_Number}. You may claim the key now.`,
            data: { alreadyApproved: true, requestId: existingApproved[0].Request_ID }
        };
    }

    // Insert request
    const [result] = await keyAuthRepo.createRequest(userId, parsedRoomId, cleanReason);
    const requestId = result.insertId;

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
            reason: cleanReason
        },
        result: 'SUCCESS'
    });

    // Asynchronously dispatch urgent notification email to IT Department Head(s)
    setImmediate(async () => {
        try {
            const [deptHeads] = await db.query(
                "SELECT User_ID, Name, Email FROM users WHERE Role IN ('IT Dept. Head', 'IT Head')"
            );
            if (deptHeads && deptHeads.length > 0) {
                const heldStr = (activeKeys && activeKeys.length > 0)
                    ? activeKeys.map(k => `Room ${k.Room_Number}`).join(', ')
                    : 'None';
                const reviewLink = `${appConfig.APP_URL}/it-head-dashboard.html`;

                for (const head of deptHeads) {
                    if (head.Email) {
                        await emailService.sendKeyAuthorizationEmail(head.Email, head.Name, {
                            requesterName: userName || 'Faculty Member',
                            requesterRole: userRole || 'Faculty',
                            requestedRoom: targetRoom.Room_Number,
                            heldRooms: heldStr,
                            reason: cleanReason,
                            reviewLink,
                            requestedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
        message: `Key request for Room ${targetRoom.Room_Number} submitted successfully to the Department Head.`,
        data: {
            requestId,
            roomId: parsedRoomId,
            roomNumber: targetRoom.Room_Number,
            reason: cleanReason,
            status: 'PENDING'
        }
    };
}

/**
 * Get active/latest key authorization status for the logged-in faculty.
 */
async function getFacultyRequestStatus(userId) {
    if (!userId) {
        return { status: 401, error: 'Authentication required' };
    }

    // Lazy cleanup of expired approved requests
    try {
        await keyAuthRepo.expireOldApprovedRequests();
    } catch (e) {
        console.error('[KeyAuthService] Expiration cleanup failed:', e.message);
    }

    const [rows] = await keyAuthRepo.findLatestRequestForFaculty(userId);
    let request = (rows && rows.length > 0) ? rows[0] : null;

    // Retrieve active held keys context
    const [heldKeys] = await labRepo.findActiveKeysByUserId(userId);
    const heldCount = (heldKeys || []).length;
    const heldList = (heldKeys || []).map(k => ({ Room_ID: k.Room_ID, Room_Number: k.Room_Number }));

    if (request) {
        request.heldCount = heldCount;
        request.heldRooms = heldList;
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
            heldRooms: heldList
        }
    };
}

/**
 * Get all pending key authorization requests for the Department Head dashboard.
 */
async function getPendingRequestsForDeptHead(userId, userRole) {
    if (!userId) {
        return { status: 401, error: 'Authentication required' };
    }

    if (userRole !== 'IT Dept. Head') {
        return { status: 403, error: 'Forbidden: Only the IT Department Head can review key requests.' };
    }

    try {
        await keyAuthRepo.expireOldApprovedRequests();
    } catch (e) {
        console.error('[KeyAuthService] Expiration cleanup failed:', e.message);
    }

    const [pending] = await keyAuthRepo.findAllPendingForDeptHead();

    return {
        status: 200,
        data: pending
    };
}

/**
 * Approve a pending key authorization request.
 */
async function approveRequest(requestId, approvedBy, userRole, durationMinutes = 120, req = null) {
    if (!approvedBy) {
        return { status: 401, error: 'Authentication required' };
    }

    if (userRole !== 'IT Dept. Head') {
        return { status: 403, error: 'Forbidden: Only the IT Department Head can approve key requests.' };
    }

    const parsedRequestId = Number(requestId);
    if (!Number.isInteger(parsedRequestId) || parsedRequestId <= 0) {
        return { status: 400, error: 'Valid Request ID is required.' };
    }

    const parsedDuration = Math.max(15, Math.min(1440, Number(durationMinutes) || 120));
    const expiresAt = new Date(Date.now() + parsedDuration * 60 * 1000);

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
                error: `Cannot approve request: Current status is '${requestInfo.Status}'.`
            };
        }

        await keyAuthRepo.approveRequest(parsedRequestId, approvedBy, parsedDuration, expiresAt, connection);
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
            durationMinutes: parsedDuration,
            expiresAt: expiresAt.toISOString()
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
                    durationMinutes: parsedDuration,
                    actionLink: `${appConfig.APP_URL}/room-status.html`
                });
            }
        } catch (e) {
            console.error('[KeyAuthService] Failed to dispatch approval email to faculty:', e.message);
        }
    });

    return {
        status: 200,
        message: `Key request for Room ${requestInfo.Room_Number} approved for ${requestInfo.Requester_Name} (${parsedDuration} minutes).`,
        data: {
            requestId: parsedRequestId,
            status: 'APPROVED',
            durationMinutes: parsedDuration,
            expiresAt: expiresAt.toISOString()
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

    if (userRole !== 'IT Dept. Head') {
        return { status: 403, error: 'Forbidden: Only the IT Department Head can decline key requests.' };
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
 * Check if a user has an active, approved authorization to claim a specific room's key.
 */
async function checkActiveApproval(userId, roomId, executor = db) {
    if (!userId || !roomId) return null;
    const [rows] = await keyAuthRepo.findActiveApprovedByUserIdAndRoom(userId, roomId, executor);
    return (rows && rows.length > 0) ? rows[0] : null;
}

/**
 * Check if a user has an active, approved authorization to claim by room number.
 */
async function checkActiveApprovalByRoomNumber(userId, roomNumber, executor = db) {
    if (!userId || !roomNumber) return null;
    const [rows] = await keyAuthRepo.findActiveApprovedByUserIdAndRoomNumber(userId, roomNumber, executor);
    return (rows && rows.length > 0) ? rows[0] : null;
}

module.exports = {
    requestAdditionalKey,
    getFacultyRequestStatus,
    getPendingRequestsForDeptHead,
    approveRequest,
    rejectRequest,
    checkActiveApproval,
    checkActiveApprovalByRoomNumber
};
