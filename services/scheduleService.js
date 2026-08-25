'use strict';

const db = require('../database/connection');
const scheduleRepository = require('../repositories/schedule.repository');
const iotService = require('./iotService');

async function saveRoomSchedule(roomNumber, schedules, academicYear, semester) {
    const currentYear = new Date().getFullYear();
    const ay = academicYear || `${currentYear}-${currentYear + 1}`;
    const sem = semester || '1st Semester';

    const [rooms] = await scheduleRepository.findRoomIdByNumber(roomNumber);
    if (rooms.length === 0) return { status: 404, error: 'Room not found' };
    const roomId = rooms[0].Room_ID;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        await scheduleRepository.deleteRoomSchedule(roomId, ay, sem, connection);

        if (schedules && schedules.length > 0) {
            for (const sched of schedules) {
                const [users] = await scheduleRepository.findUserIdByName(sched.professor, connection);
                const userId = users.length > 0 ? users[0].User_ID : null;

                await scheduleRepository.insertSchedule({
                    userId,
                    roomId,
                    subject: sched.subject,
                    section: sched.section,
                    day: sched.day,
                    startTime: sched.startTime,
                    endTime: sched.endTime,
                    ay,
                    sem,
                    colorTheme: sched.colorTheme
                }, connection);
            }
        }

        await connection.commit();
    } catch (err) {
        await connection.rollback();
        console.error('Error saving room schedule within transaction:', err);
        throw err;
    } finally {
        connection.release();
    }

    return { status: 200, message: 'Schedule saved successfully' };
}

async function checkProfessorConflict(params) {
    const { professorName, day, startTime, endTime, academicYear, semester, excludeRoomNumber } = params;
    if (!professorName || !day || !startTime || !endTime) {
        return { status: 400, error: 'Missing required parameters' };
    }

    const currentYear = new Date().getFullYear();
    const ay = academicYear || `${currentYear}-${currentYear + 1}`;
    const sem = semester || '1st Semester';

    const [users] = await scheduleRepository.findUserIdByName(professorName);
    if (users.length === 0) {
        return { status: 200, data: { conflict: false } };
    }
    const userId = users[0].User_ID;

    const [schedules] = await scheduleRepository.findUserSchedulesForConflict(userId, day, ay, sem, excludeRoomNumber);

    const overlaps = schedules.filter(s => {
        const start1 = s.Start_Time.substring(0, 5);
        const end1 = s.End_Time.substring(0, 5);
        const maxStart = start1 > startTime ? start1 : startTime;
        const minEnd = end1 < endTime ? end1 : endTime;
        return maxStart < minEnd;
    });

    if (overlaps.length > 0) {
        return {
            status: 200,
            data: {
                conflict: true,
                conflictingRoom: overlaps[0].Room_Number,
                startTime: overlaps[0].Start_Time.substring(0, 5),
                endTime: overlaps[0].End_Time.substring(0, 5)
            }
        };
    }

    return { status: 200, data: { conflict: false } };
}

async function getProfessorSchedule(params) {
    const { professorName, academicYear, semester, excludeRoomNumber } = params;
    if (!professorName) {
        return { status: 400, error: 'Missing professorName' };
    }

    const currentYear = new Date().getFullYear();
    const ay = academicYear || `${currentYear}-${currentYear + 1}`;
    const sem = semester || '1st Semester';

    const [users] = await scheduleRepository.findUserIdByName(professorName);
    if (users.length === 0) {
        return { status: 200, data: [] };
    }
    const userId = users[0].User_ID;

    const [schedules] = await scheduleRepository.findProfessorSchedules(userId, ay, sem, excludeRoomNumber);
    return { status: 200, data: schedules };
}

async function getRoomSchedule(roomNumber, academicYear, semester) {
    const currentYear = new Date().getFullYear();
    const ay = academicYear || `${currentYear}-${currentYear + 1}`;
    const sem = semester || '1st Semester';

    const [rooms] = await scheduleRepository.findRoomIdByNumber(roomNumber);
    if (rooms.length === 0) return { status: 404, error: 'Room not found' };

    const [schedules] = await scheduleRepository.findRoomSchedules(rooms[0].Room_ID, ay, sem);

    return { status: 200, data: schedules };
}

async function getUserSchedule(userIdParam, academicYear, semester) {
    const userId = userIdParam || 1;
    const currentYear = new Date().getFullYear();
    const ay = academicYear || `${currentYear}-${currentYear + 1}`;
    const sem = semester || '1st Semester';

    const [schedules] = await scheduleRepository.findUserSchedule(userId, ay, sem);

    return { status: 200, data: schedules };
}

async function getITHeadSummary(sessionUserId) {
    const userId = sessionUserId || null;
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = days[new Date().getDay()];
    const nowTime = new Date().toTimeString().split(' ')[0];

    const [rooms] = await scheduleRepository.findSummaryRoomsStatus(today, nowTime);

    const totalRooms = rooms.length;
    let availableRooms = 0;
    let borrowedRooms = 0;
    let inSessionRooms = 0;
    let onlineRooms = 0;
    let offlineRooms = 0;

    rooms.forEach(r => {
        const isOnline = iotService.isDeviceOnline(r.Room_Number, r.Last_Seen);
        if (isOnline) {
            onlineRooms++;
        } else {
            offlineRooms++;
        }

        const keyAbsent = r.Key_Status === 'Absent';
        const hasScheduledClass = !!r.Subject_Name;
        const isScheduledProfHolder = keyAbsent && hasScheduledClass && (
            (r.Current_User_ID != null && r.Scheduled_User_ID != null && String(r.Current_User_ID) === String(r.Scheduled_User_ID)) ||
            (r.Current_User_ID == null && r.Scheduled_Professor_Name != null)
        );

        if (!keyAbsent) {
            availableRooms++;
        } else if (hasScheduledClass && isScheduledProfHolder) {
            inSessionRooms++;
        } else {
            borrowedRooms++;
        }
    });

    const [[{ totalPcs }]] = await scheduleRepository.countTotalPCs();
    const [[{ pendingReports }]] = await scheduleRepository.countPendingReports();
    const [[{ classesToday }]] = await scheduleRepository.countClassesToday(today);

    let myClassesToday = [];
    if (userId) {
        const [myScheds] = await scheduleRepository.findUserClassesToday(userId, today);
        myClassesToday = myScheds;
    }

    return {
        status: 200,
        data: {
            totalRooms,
            availableRooms,
            borrowedRooms,
            inSessionRooms,
            claimedRooms: borrowedRooms,
            inUseRooms: inSessionRooms,
            onlineRooms,
            offlineRooms,
            totalPcs,
            pendingReports,
            classesToday,
            myClassesToday
        }
    };
}

async function getFacultyScheduleByName(professorName, academicYear, semester) {
    if (!professorName) {
        return { status: 400, error: 'Missing professorName parameter' };
    }

    const currentYear = new Date().getFullYear();
    const ay = academicYear || `${currentYear}-${currentYear + 1}`;
    const sem = semester || '1st Semester';

    const [schedules] = await scheduleRepository.findFacultySchedulesByName(professorName, ay, sem);
    return { status: 200, data: schedules };
}

module.exports = {
    saveRoomSchedule,
    checkProfessorConflict,
    getProfessorSchedule,
    getFacultyScheduleByName,
    getRoomSchedule,
    getUserSchedule,
    getITHeadSummary
};

