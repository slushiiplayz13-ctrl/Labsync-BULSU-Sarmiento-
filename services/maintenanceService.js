'use strict';

const db = require('../database/connection');
const maintenanceRepository = require('../repositories/maintenance.repository');
const scheduleRepository = require('../repositories/schedule.repository');
const labRepository = require('../repositories/laboratory.repository');
const userRepository = require('../repositories/user.repository');

async function submitReport(reqBody) {
    const { roomNumber, pcNumber, studentName, studentSection, components, remarks } = reqBody;

    if (!studentName || !studentSection) {
        return { status: 400, error: 'Student Name and Program & Section are required.' };
    }

    const [rooms] = await scheduleRepository.findRoomIdByNumber(roomNumber);
    if (rooms.length === 0) {
        return { status: 404, error: `Room ${roomNumber} not found.` };
    }
    const roomId = rooms[0].Room_ID;

    const [pcs] = await labRepository.findPCByRoomAndNumber(roomId, pcNumber);
    if (pcs.length === 0) {
        return { status: 404, error: `PC Unit ${pcNumber} not found in Room ${roomNumber}.` };
    }
    const pcId = pcs[0].PC_ID;

    const issueComponents = Object.keys(components || {}).filter(key => components[key] === 'issue');
    const desc = `[Program & Section: ${studentSection}] [Issues: ${issueComponents.join(', ') || 'None'}] Remarks: ${remarks || 'None'}`;

    let priority = 'Low';
    let status = 'Pending';
    let pcCondition = 'Under Maintenance';

    const hasIssues = issueComponents.length > 0;
    const hasRemarks = remarks && remarks.trim() !== '' && remarks.trim().toLowerCase() !== 'none';

    if (!hasIssues && !hasRemarks) {
        status = 'Resolved';
        pcCondition = 'Functional';
    } else {
        if (components['PC/Laptop'] === 'issue' || components['System Unit'] === 'issue') {
            priority = 'High';
        } else if (components['Monitor'] === 'issue') {
            priority = 'Medium';
        }
    }

    const connection = await db.getConnection();
    let insertId;
    try {
        await connection.beginTransaction();

        const [result] = await maintenanceRepository.insertReport({
            pcId,
            studentName,
            desc,
            status,
            priority
        }, connection);

        insertId = result.insertId;

        await labRepository.updateConditionStatus(pcId, pcCondition, connection);

        await connection.commit();
    } catch (err) {
        await connection.rollback();
        console.error('Error submitting maintenance report within transaction:', err);
        throw err;
    } finally {
        connection.release();
    }

    return {
        status: 200,
        data: {
            message: 'Report submitted successfully!',
            ticketId: `LS-TKT-${insertId}`
        }
    };
}

async function getAllReports() {
    const [reports] = await maintenanceRepository.findAllReports();
    return { status: 200, data: reports };
}

async function updateReportStatus(reportId, status) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        await maintenanceRepository.updateReportStatus(reportId, status, connection);

        if (status === 'Resolved') {
            const [reports] = await maintenanceRepository.findPCIdByReportId(reportId, connection);
            if (reports.length > 0) {
                const pcId = reports[0].PC_ID;
                const [pending] = await maintenanceRepository.countPendingReportsByPCId(pcId, connection);
                if (pending[0].count === 0) {
                    await labRepository.updateConditionStatus(pcId, 'Functional', connection);
                }
            }
        }

        await connection.commit();
    } catch (err) {
        await connection.rollback();
        console.error('Error updating report status within transaction:', err);
        throw err;
    } finally {
        connection.release();
    }

    return { status: 200, message: `Report status updated to ${status} successfully.` };
}

async function deleteReport(reportId) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [reports] = await maintenanceRepository.findPCIdAndStatusByReportId(reportId, connection);
        if (reports.length > 0) {
            const { PC_ID } = reports[0];
            await maintenanceRepository.deleteReport(reportId, connection);
            const [pending] = await maintenanceRepository.countPendingReportsByPCId(PC_ID, connection);
            if (pending[0].count === 0) {
                await labRepository.updateConditionStatus(PC_ID, 'Functional', connection);
            }
        } else {
            await maintenanceRepository.deleteReport(reportId, connection);
        }

        await connection.commit();
    } catch (err) {
        await connection.rollback();
        console.error('Error deleting report within transaction:', err);
        throw err;
    } finally {
        connection.release();
    }

    return { status: 200, message: 'Report deleted successfully.' };
}

async function getNotifications(sessionUserId, sessionUserRole) {
    const userId = sessionUserId;
    let role = sessionUserRole;
    if (!role) {
        const [users] = await userRepository.getRoleById(userId);
        if (users.length > 0) {
            role = users[0].Role;
        }
    }

    if (role === 'MIS Staff' || role === 'IT Dept. Head' || role === 'Department Head') {
        const [notifications] = await maintenanceRepository.findAllNotifications();
        return { status: 200, data: notifications };
    } else {
        const [schedules] = await scheduleRepository.findDistinctRoomIdsByUserId(userId);

        if (schedules.length === 0) {
            return { status: 200, data: [] };
        }

        const roomIds = schedules.map(s => s.Room_ID);
        const [reports] = await maintenanceRepository.findNotificationsByRoomIds(roomIds);

        return { status: 200, data: reports };
    }
}

module.exports = {
    submitReport,
    getAllReports,
    updateReportStatus,
    deleteReport,
    getNotifications
};
