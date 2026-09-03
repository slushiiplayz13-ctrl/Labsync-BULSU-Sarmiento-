'use strict';

const maintenanceRepository = require('../repositories/maintenance.repository');
const scheduleRepository = require('../repositories/schedule.repository');
const labRepository = require('../repositories/laboratory.repository');
const userRepository = require('../repositories/user.repository');

/**
 * Extracts primary issue component category for grouping maintenance issues.
 * @param {Object} components - Flagged components object
 * @param {string} remarks - Additional student remarks
 * @returns {string} Primary issue type ('Monitor', 'Keyboard', 'Mouse', 'System Unit', 'PC/Laptop', 'Other', 'None')
 */
function extractPrimaryIssueType(components = {}, remarks = '') {
    if (components['Monitor'] === 'issue') return 'Monitor';
    if (components['Keyboard'] === 'issue') return 'Keyboard';
    if (components['Mouse'] === 'issue') return 'Mouse';
    if (components['System Unit'] === 'issue') return 'System Unit';
    if (components['PC/Laptop'] === 'issue') return 'PC/Laptop';

    const flagged = Object.keys(components).filter(k => components[k] === 'issue');
    if (flagged.length > 0) return flagged[0];

    const cleanRemarks = (remarks || '').trim().toLowerCase();
    if (cleanRemarks !== '' && cleanRemarks !== 'none' && cleanRemarks !== 'no remarks provided') {
        return 'Other';
    }

    return 'None';
}

async function submitReport(reqBody = {}) {
    const { roomNumber, pcNumber, studentName, studentSection, components, remarks } = reqBody;

    if (!studentName || typeof studentName !== 'string' || studentName.trim().length < 2) {
        return { status: 400, error: 'Student Name is required (minimum 2 characters).' };
    }
    if (studentName.trim().length > 100) {
        return { status: 400, error: 'Student Name must not exceed 100 characters.' };
    }

    if (!studentSection || typeof studentSection !== 'string' || studentSection.trim().length < 2) {
        return { status: 400, error: 'Program & Section is required (minimum 2 characters).' };
    }
    if (studentSection.trim().length > 50) {
        return { status: 400, error: 'Program & Section must not exceed 50 characters.' };
    }

    if (remarks !== undefined && remarks !== null) {
        if (typeof remarks !== 'string') {
            return { status: 400, error: 'Remarks must be a string.' };
        }
        if (remarks.length > 200) {
            return { status: 400, error: 'Issue details must not exceed 200 characters.' };
        }
    }

    if (!roomNumber || (typeof roomNumber !== 'string' && typeof roomNumber !== 'number')) {
        return { status: 400, error: 'Room number is required.' };
    }

    if (!pcNumber || (typeof pcNumber !== 'string' && typeof pcNumber !== 'number')) {
        return { status: 400, error: 'PC Number is required.' };
    }

    const cleanStudentName = studentName.trim();
    const cleanStudentSection = studentSection.trim().toUpperCase();
    const cleanRemarks = typeof remarks === 'string' ? remarks.trim() : '';

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
    const desc = `[Program & Section: ${cleanStudentSection}] [Issues: ${issueComponents.join(', ') || 'None'}] Remarks: ${cleanRemarks || 'None'}`;
    const issueType = extractPrimaryIssueType(components || {}, cleanRemarks);

    let priority = 'Low';
    let status = 'Pending';
    let pcCondition = 'Under Maintenance';

    if (issueType === 'None') {
        status = 'Resolved';
        pcCondition = 'Functional';
    } else {
        if (components && (components['PC/Laptop'] === 'issue' || components['System Unit'] === 'issue')) {
            priority = 'High';
        } else if (components && components['Monitor'] === 'issue') {
            priority = 'Medium';
        }
    }

    let issueId;
    await maintenanceRepository.withTransaction(async (connection) => {
        // Concurrency Safeguard: Explicitly lock the PC row first
        await maintenanceRepository.lockPCForUpdate(pcId, connection);

        if (status === 'Resolved') {
            // Direct submission without fault flag
            const [newIssue] = await maintenanceRepository.insertMaintenanceIssue({
                pcId,
                issueType,
                status: 'Resolved',
                priority: 'Low'
            }, connection);
            issueId = newIssue.insertId;

            await maintenanceRepository.insertStudentReport({
                issueId,
                pcId,
                studentName: cleanStudentName,
                desc,
                status: 'Resolved',
                priority: 'Low'
            }, connection);

            // Check if PC has any other active issues before marking functional
            const [activeCount] = await maintenanceRepository.countActiveIssuesByPCId(pcId, connection);
            if (activeCount[0].count === 0) {
                await labRepository.updateConditionStatus(pcId, 'Functional', connection);
            }
        } else {
            // Check for existing active issue for (PC_ID, Issue_Type)
            const [activeIssues] = await maintenanceRepository.findActiveIssueByPCAndType(pcId, issueType, connection);

            if (activeIssues.length > 0) {
                // Link new student report to existing active Maintenance Issue
                issueId = activeIssues[0].Issue_ID;
                const existingPriority = activeIssues[0].Priority_Level;

                // Escalate priority level if new report has higher priority
                if (priority === 'High' && existingPriority !== 'High') {
                    await maintenanceRepository.updateIssuePriority(issueId, 'High', connection);
                } else if (priority === 'Medium' && existingPriority === 'Low') {
                    await maintenanceRepository.updateIssuePriority(issueId, 'Medium', connection);
                }
            } else {
                // Create new Maintenance Issue
                const [newIssue] = await maintenanceRepository.insertMaintenanceIssue({
                    pcId,
                    issueType,
                    status: 'Pending',
                    priority
                }, connection);
                issueId = newIssue.insertId;
            }

            // Insert distinct student report linked to the maintenance issue
            await maintenanceRepository.insertStudentReport({
                issueId,
                pcId,
                studentName: cleanStudentName,
                desc,
                status: 'Pending',
                priority
            }, connection);

            // Update PC condition to Under Maintenance
            await labRepository.updateConditionStatus(pcId, 'Under Maintenance', connection);
        }
    });

    return {
        status: 200,
        data: {
            message: 'Report submitted successfully!',
            ticketId: `LS-TKT-${issueId}`
        }
    };
}

async function getAllReports() {
    const [reports] = await maintenanceRepository.findAllMaintenanceIssues();
    return { status: 200, data: reports };
}

async function updateReportStatus(reportId, status) {
    const parsedId = Number(reportId);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
        return { status: 400, error: 'Invalid report ID. Must be a positive integer.' };
    }

    const ALLOWED_STATUSES = ['Pending', 'In Progress', 'Resolved'];
    if (!status || typeof status !== 'string' || !ALLOWED_STATUSES.includes(status)) {
        return { status: 400, error: `Invalid status: '${status}'. Allowed values: ${ALLOWED_STATUSES.join(', ')}.` };
    }

    await maintenanceRepository.withTransaction(async (connection) => {
        await maintenanceRepository.updateMaintenanceIssueStatus(parsedId, status, connection);
        await maintenanceRepository.updateLinkedStudentReportsStatus(parsedId, status, connection);

        const [issues] = await maintenanceRepository.findPCIdAndStatusByIssueId(parsedId, connection);
        if (issues.length > 0) {
            const pcId = issues[0].PC_ID;
            const [activeCount] = await maintenanceRepository.countActiveIssuesByPCId(pcId, connection);

            if (activeCount[0].count === 0) {
                // All active issues resolved -> restore workstation to Functional condition
                await labRepository.updateConditionStatus(pcId, 'Functional', connection);
            } else {
                // PC still has other active issues -> remains Under Maintenance
                await labRepository.updateConditionStatus(pcId, 'Under Maintenance', connection);
            }
        }
    });

    return { status: 200, message: `Report status updated to ${status} successfully.` };
}

async function deleteReport(reportId) {
    const parsedId = Number(reportId);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
        return { status: 400, error: 'Invalid report ID. Must be a positive integer.' };
    }

    await maintenanceRepository.withTransaction(async (connection) => {
        const [issues] = await maintenanceRepository.findPCIdAndStatusByIssueId(parsedId, connection);
        if (issues.length > 0) {
            const { PC_ID } = issues[0];
            await maintenanceRepository.deleteMaintenanceIssue(parsedId, connection);
            const [activeCount] = await maintenanceRepository.countActiveIssuesByPCId(PC_ID, connection);
            if (activeCount[0].count === 0) {
                await labRepository.updateConditionStatus(PC_ID, 'Functional', connection);
            }
        } else {
            await maintenanceRepository.deleteMaintenanceIssue(parsedId, connection);
        }
    });

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

    if (role === 'MIS Staff') {
        const [notifications] = await maintenanceRepository.findReportNotifications();
        return { status: 200, data: notifications };
    } else if (role === 'IT Dept. Head' || role === 'Department Head') {
        const [notifications] = await maintenanceRepository.findAllNotifications();
        return { status: 200, data: notifications };
    } else {
        const [schedules] = await scheduleRepository.findDistinctRoomIdsByUserId(userId);

        if (schedules.length === 0) {
            const [allNotifications] = await maintenanceRepository.findAllNotifications();
            return { status: 200, data: allNotifications };
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
