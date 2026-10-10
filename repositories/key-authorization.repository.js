'use strict';

/**
 * repositories/key-authorization.repository.js
 * Database operations for multi-key authorization requests and advance reservations.
 */

const db = require('../database/connection');

async function createRequest(userId, roomId, reason, reservationDate = null, startTime = null, endTime = null, executor = db) {
    return executor.query(
        `INSERT INTO key_authorization_requests 
         (User_ID, Room_ID, Reservation_Date, Start_Time, End_Time, Reason, Status, Requested_At)
         VALUES (?, ?, ?, ?, ?, ?, 'PENDING', NOW())`,
        [userId, roomId, reservationDate, startTime, endTime, reason]
    );
}

async function findConflictingReservations(roomId, reservationDate, startTime, endTime, excludeRequestId = null, executor = db) {
    let sql = `
        SELECT r.*, lab.Room_Number, u.Name AS Requester_Name
        FROM key_authorization_requests r
        JOIN laboratories lab ON r.Room_ID = lab.Room_ID
        JOIN users u ON r.User_ID = u.User_ID
        WHERE r.Room_ID = ?
          AND r.Reservation_Date = ?
          AND r.Status IN ('PENDING', 'APPROVED', 'CLAIMED')
          AND (r.Start_Time < ? AND r.End_Time > ?)
    `;
    const params = [roomId, reservationDate, endTime, startTime];
    if (excludeRequestId) {
        sql += ` AND r.Request_ID != ?`;
        params.push(excludeRequestId);
    }
    return executor.query(sql, params);
}

async function findAllRoomConflicts(reservationDate, startTime, endTime, executor = db) {
    const sql = `
        SELECT r.Request_ID, r.Room_ID, r.Status, r.Start_Time, r.End_Time, r.User_ID,
               lab.Room_Number, lab.Building, u.Name AS Requester_Name
        FROM key_authorization_requests r
        JOIN laboratories lab ON r.Room_ID = lab.Room_ID
        JOIN users u ON r.User_ID = u.User_ID
        WHERE r.Reservation_Date = ?
          AND r.Status IN ('PENDING', 'APPROVED', 'CLAIMED')
          AND (r.Start_Time < ? AND r.End_Time > ?)
        ORDER BY r.Start_Time ASC
    `;
    return executor.query(sql, [reservationDate, endTime, startTime]);
}

async function findPendingByUserId(userId, executor = db) {
    return executor.query(
        `SELECT r.*, lab.Room_Number, lab.Building
         FROM key_authorization_requests r
         JOIN laboratories lab ON r.Room_ID = lab.Room_ID
         WHERE r.User_ID = ? AND r.Status = 'PENDING'
         ORDER BY r.Reservation_Date ASC, r.Start_Time ASC, r.Requested_At DESC`,
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
           AND (
             (r.Reservation_Date IS NULL AND (r.Expires_At IS NULL OR r.Expires_At > NOW()))
             OR
             (r.Reservation_Date = CURDATE() AND SUBTIME(r.Start_Time, '00:15:00') <= CURTIME() AND r.End_Time >= CURTIME())
             OR
             (r.Status = 'CLAIMED' AND (r.Expires_At IS NULL OR r.Expires_At > NOW()))
           )
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
           AND (
             (r.Reservation_Date IS NULL AND (r.Expires_At IS NULL OR r.Expires_At > NOW()))
             OR
             (r.Reservation_Date = CURDATE() AND SUBTIME(r.Start_Time, '00:15:00') <= CURTIME() AND r.End_Time >= CURTIME())
             OR
             (r.Status = 'CLAIMED' AND (r.Expires_At IS NULL OR r.Expires_At > NOW()))
           )
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
           AND (
             (r.Reservation_Date IS NULL AND (r.Expires_At IS NULL OR r.Expires_At > NOW()))
             OR
             (r.Reservation_Date = CURDATE() AND SUBTIME(r.Start_Time, '00:15:00') <= CURTIME() AND r.End_Time >= CURTIME())
             OR
             (r.Status = 'CLAIMED' AND (r.Expires_At IS NULL OR r.Expires_At > NOW()))
           )
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
         ORDER BY 
           CASE r.Status
             WHEN 'CLAIMED' THEN 1
             WHEN 'APPROVED' THEN 2
             WHEN 'PENDING' THEN 3
             ELSE 4
           END ASC,
           CASE 
             WHEN r.Status IN ('CLAIMED', 'APPROVED', 'PENDING') THEN r.Reservation_Date 
             ELSE NULL 
           END ASC,
           CASE 
             WHEN r.Status IN ('CLAIMED', 'APPROVED', 'PENDING') THEN r.Start_Time 
             ELSE NULL 
           END ASC,
           r.Requested_At DESC,
           r.Request_ID DESC
         LIMIT 1`,
        [userId]
    );
}

async function findAllPendingForDeptHead(executor = db) {
    return executor.query(
        `SELECT r.Request_ID, r.User_ID, r.Room_ID, r.Reservation_Date, r.Start_Time, r.End_Time,
                r.Duration_Minutes, r.Reason, r.Status, r.Requested_At,
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
         ORDER BY COALESCE(r.Reservation_Date, DATE(r.Requested_At)) ASC, COALESCE(r.Start_Time, TIME(r.Requested_At)) ASC`
    );
}

async function findAllApprovedForDeptHead(executor = db) {
    return executor.query(
        `SELECT r.Request_ID, r.User_ID, r.Room_ID, r.Reservation_Date, r.Start_Time, r.End_Time,
                r.Duration_Minutes, r.Reason, r.Status, r.Requested_At,
                r.Approved_By, r.Approved_At, r.Expires_At,
                u.Name AS Requester_Name, u.Email AS Requester_Email, u.Role AS Requester_Role,
                u.Profile_Photo AS Requester_Profile_Photo,
                lab.Room_Number AS Requested_Room_Number, lab.Building AS Requested_Building,
                approver.Name AS Approver_Name, approver.Email AS Approver_Email,
                (SELECT GROUP_CONCAT(hl.Room_Number SEPARATOR ', ')
                 FROM laboratories hl
                 WHERE hl.Current_User_ID = r.User_ID AND hl.Key_Status = 'Absent') AS Currently_Held_Rooms
         FROM key_authorization_requests r
         JOIN users u ON r.User_ID = u.User_ID
         JOIN laboratories lab ON r.Room_ID = lab.Room_ID
         LEFT JOIN users approver ON r.Approved_By = approver.User_ID
         WHERE r.Status = 'APPROVED'
         ORDER BY r.Approved_At DESC, r.Requested_At DESC`
    );
}

async function findAllForDeptHead(executor = db) {
    return executor.query(
        `SELECT r.Request_ID, r.User_ID, r.Room_ID, r.Reservation_Date, r.Start_Time, r.End_Time,
                r.Duration_Minutes, r.Reason, r.Status, r.Requested_At,
                r.Approved_By, r.Approved_At, r.Expires_At,
                u.Name AS Requester_Name, u.Email AS Requester_Email, u.Role AS Requester_Role,
                u.Profile_Photo AS Requester_Profile_Photo,
                lab.Room_Number AS Requested_Room_Number, lab.Building AS Requested_Building,
                approver.Name AS Approver_Name, approver.Email AS Approver_Email,
                (SELECT GROUP_CONCAT(hl.Room_Number SEPARATOR ', ')
                 FROM laboratories hl
                 WHERE hl.Current_User_ID = r.User_ID AND hl.Key_Status = 'Absent') AS Currently_Held_Rooms
         FROM key_authorization_requests r
         JOIN users u ON r.User_ID = u.User_ID
         JOIN laboratories lab ON r.Room_ID = lab.Room_ID
         LEFT JOIN users approver ON r.Approved_By = approver.User_ID
         WHERE r.Status IN ('PENDING', 'APPROVED')
         ORDER BY 
           CASE r.Status WHEN 'PENDING' THEN 1 WHEN 'APPROVED' THEN 2 ELSE 3 END ASC,
           COALESCE(r.Approved_At, r.Requested_At) DESC`
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

async function cancelRequest(requestId, userId, executor = db) {
    return executor.query(
        `UPDATE key_authorization_requests
         SET Status = 'EXPIRED'
         WHERE Request_ID = ? AND User_ID = ? AND Status IN ('PENDING', 'APPROVED')`,
        [requestId, userId]
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
         WHERE Status = 'APPROVED'
           AND (
             (Expires_At IS NOT NULL AND Expires_At < NOW())
             OR
             (Reservation_Date IS NOT NULL AND (
               Reservation_Date < CURDATE()
               OR (Reservation_Date = CURDATE() AND End_Time < CURTIME())
             ))
           )`
    );
}

module.exports = {
    createRequest,
    findConflictingReservations,
    findAllRoomConflicts,
    findPendingByUserId,
    findActiveApprovedByUserIdAndRoom,
    findActiveApprovedByUserIdAndRoomNumber,
    findAnyActiveAuthorizationByUserId,
    findLatestRequestForFaculty,
    findAllPendingForDeptHead,
    findAllApprovedForDeptHead,
    findAllForDeptHead,
    findById,
    findByIdForUpdate,
    approveRequest,
    rejectRequest,
    cancelRequest,
    markClaimed,
    markCompletedByRoomAndUser,
    expireOldApprovedRequests
};
