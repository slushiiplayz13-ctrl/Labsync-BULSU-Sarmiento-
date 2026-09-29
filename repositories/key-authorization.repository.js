'use strict';

/**
 * repositories/key-authorization.repository.js
 * Database operations for multi-key authorization requests and approvals.
 */

const db = require('../database/connection');

async function createRequest(userId, roomId, reason, executor = db) {
    return executor.query(
        `INSERT INTO key_authorization_requests (User_ID, Room_ID, Reason, Status, Requested_At)
         VALUES (?, ?, ?, 'PENDING', NOW())`,
        [userId, roomId, reason]
    );
}

async function findPendingByUserId(userId, executor = db) {
    return executor.query(
        `SELECT r.*, lab.Room_Number, lab.Building
         FROM key_authorization_requests r
         JOIN laboratories lab ON r.Room_ID = lab.Room_ID
         WHERE r.User_ID = ? AND r.Status = 'PENDING'
         ORDER BY r.Requested_At DESC`,
        [userId]
    );
}

async function findActiveApprovedByUserIdAndRoom(userId, roomId, executor = db) {
    return executor.query(
        `SELECT r.*, lab.Room_Number, lab.Building
         FROM key_authorization_requests r
         JOIN laboratories lab ON r.Room_ID = lab.Room_ID
         WHERE r.User_ID = ? AND r.Room_ID = ? 
           AND r.Status IN ('APPROVED', 'CLAIMED')
           AND (r.Expires_At IS NULL OR r.Expires_At > NOW())
         ORDER BY r.Approved_At DESC LIMIT 1`,
        [userId, roomId]
    );
}

async function findActiveApprovedByUserIdAndRoomNumber(userId, roomNumber, executor = db) {
    return executor.query(
        `SELECT r.*, lab.Room_Number, lab.Building
         FROM key_authorization_requests r
         JOIN laboratories lab ON r.Room_ID = lab.Room_ID
         WHERE r.User_ID = ? AND TRIM(lab.Room_Number) = TRIM(?)
           AND r.Status IN ('APPROVED', 'CLAIMED')
           AND (r.Expires_At IS NULL OR r.Expires_At > NOW())
         ORDER BY r.Approved_At DESC LIMIT 1`,
        [userId, roomNumber]
    );
}

async function findAnyActiveAuthorizationByUserId(userId, executor = db) {
    return executor.query(
        `SELECT r.*, lab.Room_Number, lab.Building
         FROM key_authorization_requests r
         JOIN laboratories lab ON r.Room_ID = lab.Room_ID
         WHERE r.User_ID = ?
           AND r.Status IN ('APPROVED', 'CLAIMED')
           AND (r.Expires_At IS NULL OR r.Expires_At > NOW())
         ORDER BY r.Approved_At DESC`,
        [userId]
    );
}

async function findLatestRequestForFaculty(userId, executor = db) {
    return executor.query(
        `SELECT r.*, lab.Room_Number, lab.Building,
                approver.Name AS Approver_Name,
                TIMESTAMPDIFF(MINUTE, NOW(), r.Expires_At) AS Minutes_Remaining
         FROM key_authorization_requests r
         JOIN laboratories lab ON r.Room_ID = lab.Room_ID
         LEFT JOIN users approver ON r.Approved_By = approver.User_ID
         WHERE r.User_ID = ?
         ORDER BY r.Requested_At DESC, r.Request_ID DESC LIMIT 1`,
        [userId]
    );
}

async function findAllPendingForDeptHead(executor = db) {
    return executor.query(
        `SELECT r.Request_ID, r.User_ID, r.Room_ID, r.Reason, r.Status, r.Requested_At,
                u.Name AS Requester_Name, u.Email AS Requester_Email, u.Role AS Requester_Role,
                u.Profile_Photo AS Requester_Profile_Photo,
                lab.Room_Number AS Requested_Room_Number, lab.Building AS Requested_Building,
                (SELECT GROUP_CONCAT(hl.Room_Number SEPARATOR ', ')
                 FROM laboratories hl
                 WHERE hl.Current_User_ID = r.User_ID AND hl.Key_Status = 'Absent') AS Currently_Held_Rooms
         FROM key_authorization_requests r
         JOIN users u ON r.User_ID = u.User_ID
         JOIN laboratories lab ON r.Room_ID = lab.Room_ID
         WHERE r.Status = 'PENDING'
         ORDER BY r.Requested_At ASC`
    );
}

async function findById(requestId, executor = db) {
    return executor.query(
        `SELECT r.*, lab.Room_Number, lab.Building, u.Name AS Requester_Name, u.Email AS Requester_Email
         FROM key_authorization_requests r
         JOIN laboratories lab ON r.Room_ID = lab.Room_ID
         JOIN users u ON r.User_ID = u.User_ID
         WHERE r.Request_ID = ?`,
        [requestId]
    );
}

async function findByIdForUpdate(requestId, executor) {
    return executor.query(
        `SELECT r.*, lab.Room_Number, lab.Building, u.Name AS Requester_Name
         FROM key_authorization_requests r
         JOIN laboratories lab ON r.Room_ID = lab.Room_ID
         JOIN users u ON r.User_ID = u.User_ID
         WHERE r.Request_ID = ?
         FOR UPDATE`,
        [requestId]
    );
}

async function approveRequest(requestId, approvedBy, durationMinutes, expiresAt, executor = db) {
    return executor.query(
        `UPDATE key_authorization_requests
         SET Status = 'APPROVED', Approved_By = ?, Approved_At = NOW(),
             Duration_Minutes = ?, Expires_At = ?
         WHERE Request_ID = ?`,
        [approvedBy, durationMinutes, expiresAt, requestId]
    );
}

async function rejectRequest(requestId, approvedBy, rejectionReason, executor = db) {
    return executor.query(
        `UPDATE key_authorization_requests
         SET Status = 'REJECTED', Approved_By = ?, Approved_At = NOW(),
             Rejection_Reason = ?
         WHERE Request_ID = ?`,
        [approvedBy, rejectionReason, requestId]
    );
}

async function markClaimed(requestId, executor = db) {
    return executor.query(
        `UPDATE key_authorization_requests
         SET Status = 'CLAIMED', Claimed_At = NOW()
         WHERE Request_ID = ?`,
        [requestId]
    );
}

async function markCompletedByRoomAndUser(roomId, userId, executor = db) {
    return executor.query(
        `UPDATE key_authorization_requests
         SET Status = 'COMPLETED', Returned_At = NOW()
         WHERE Room_ID = ? AND User_ID = ? AND Status = 'CLAIMED'`,
        [roomId, userId]
    );
}

async function expireOldApprovedRequests(executor = db) {
    return executor.query(
        `UPDATE key_authorization_requests
         SET Status = 'EXPIRED'
         WHERE Status = 'APPROVED' AND Expires_At IS NOT NULL AND Expires_At < NOW()`
    );
}

module.exports = {
    createRequest,
    findPendingByUserId,
    findActiveApprovedByUserIdAndRoom,
    findActiveApprovedByUserIdAndRoomNumber,
    findAnyActiveAuthorizationByUserId,
    findLatestRequestForFaculty,
    findAllPendingForDeptHead,
    findById,
    findByIdForUpdate,
    approveRequest,
    rejectRequest,
    markClaimed,
    markCompletedByRoomAndUser,
    expireOldApprovedRequests
};
