'use strict';

const scheduleRepository = require('../repositories/schedule.repository');
const iotService = require('./iotService');

const ALLOWED_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function isTimeOverlap(startTime1, endTime1, startTime2, endTime2) {
    if (!startTime1 || !endTime1 || !startTime2 || !endTime2) return false;
    const start1 = String(startTime1).substring(0, 5);
    const end1 = String(endTime1).substring(0, 5);
    const start2 = String(startTime2).substring(0, 5);
    const end2 = String(endTime2).substring(0, 5);
    const maxStart = start1 > start2 ? start1 : start2;
    const minEnd = end1 < end2 ? end1 : end2;
    return maxStart < minEnd;
}

function deduplicateScheduleList(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const result = [];
    for (const item of list) {
        if (!item) continue;
        const day = item.Day_of_Week || item.day || '';
        const start = (item.Start_Time || item.startTime || '').substring(0, 5);
        const end = (item.End_Time || item.endTime || '').substring(0, 5);
        const key = `${day}_${start}_${end}`;
        if (!seen.has(key)) {
            seen.add(key);
            result.push(item);
        }
    }
    return result;
}

async function saveRoomSchedule(roomNumber, schedules, academicYear, semester, version, userId = null) {
    if (!roomNumber || (typeof roomNumber !== 'string' && typeof roomNumber !== 'number')) {
        return { status: 400, error: 'Valid roomNumber is required.' };
    }

    if (schedules !== undefined && schedules !== null && !Array.isArray(schedules)) {
        return { status: 400, error: 'schedules must be an Array of schedule entries.' };
    }

    const currentYear = new Date().getFullYear();
    const ay = (academicYear && typeof academicYear === 'string') ? academicYear.trim() : `${currentYear}-${currentYear + 1}`;
    const sem = (semester && typeof semester === 'string') ? semester.trim() : '1st Semester';

    const [rooms] = await scheduleRepository.findRoomIdByNumber(roomNumber);
    if (rooms.length === 0) return { status: 404, error: 'Room not found' };
    const roomId = rooms[0].Room_ID;
    const cleanRoomNumber = rooms[0].Room_Number;

    // Validate individual schedule items if present
    if (Array.isArray(schedules)) {
        schedules = deduplicateScheduleList(schedules);
        for (let i = 0; i < schedules.length; i++) {
            const sched = schedules[i];
            if (!sched) continue;
            if (sched.day && !ALLOWED_DAYS.includes(sched.day)) {
                return { status: 400, error: `Invalid day: '${sched.day}'. Allowed days: ${ALLOWED_DAYS.join(', ')}.` };
            }
            if (sched.startTime && sched.endTime) {
                const s = String(sched.startTime).substring(0, 5);
                const e = String(sched.endTime).substring(0, 5);
                if (s >= e) {
                    return { status: 400, error: `Invalid time range: '${s}' - '${e}'. Start time must be before end time.` };
                }
            }
        }

        // 1. Same-room overlap validation within submitted schedule entries
        for (let i = 0; i < schedules.length; i++) {
            for (let j = i + 1; j < schedules.length; j++) {
                const s1 = schedules[i];
                const s2 = schedules[j];
                if (!s1 || !s2) continue;
                if (s1.day === s2.day && isTimeOverlap(s1.startTime, s1.endTime, s2.startTime, s2.endTime)) {
                    return {
                        status: 400,
                        error: `Schedule conflict: '${s1.subject || 'Class'}' (${(s1.startTime || '').substring(0, 5)}-${(s1.endTime || '').substring(0, 5)}) overlaps with '${s2.subject || 'Class'}' (${(s2.startTime || '').substring(0, 5)}-${(s2.endTime || '').substring(0, 5)}) on ${s1.day} in Room ${cleanRoomNumber}.`
                    };
                }
            }
        }
    }

    // Identify and resolve distinct professor identities before starting transaction.
    // This ensures no plain non-locking SELECT runs inside the transaction before locks are acquired,
    // preventing premature InnoDB REPEATABLE READ snapshot creation.
    const profNameToId = new Map();
    const profUserIdsToLock = new Set();

    if (Array.isArray(schedules) && schedules.length > 0) {
        for (const sched of schedules) {
            if (sched && sched.professor && sched.professor !== 'Not specified') {
                const profName = String(sched.professor).trim();
                if (!profNameToId.has(profName)) {
                    const [users] = await scheduleRepository.findUserIdByName(profName);
                    const profUserId = users.length > 0 ? users[0].User_ID : null;
                    profNameToId.set(profName, profUserId);
                    if (profUserId) {
                        profUserIdsToLock.add(profUserId);
                    }
                }
            }
        }
    }

    const sortedProfUserIds = Array.from(profUserIdsToLock).sort((a, b) => Number(a) - Number(b));

    return await scheduleRepository.withTransaction(async (connection) => {
        // 1. Deterministically acquire exclusive row locks on all assigned faculty members in users table.
        // Serializes concurrent saves for the same faculty member across different rooms before
        // any room-specific locks or gap locks are acquired.
        // Individual primary key point queries in ascending numerical order eliminate deadlock cycles.
        // Because no plain non-locking SELECT has executed yet, InnoDB will establish its consistent
        // read snapshot only when findUserSchedulesForConflictAll executes (after lock acquisition).
        for (const profUserId of sortedProfUserIds) {
            await scheduleRepository.lockUserForUpdate(profUserId, connection);
        }

        // 2. Concurrency & Status lock for the room
        // If metadata exists, acquire exclusive row lock on it.
        // If not, avoid FOR UPDATE on non-existent keys to prevent MariaDB InnoDB gap locks on schedule_metadata.
        let metadata = await scheduleRepository.getScheduleMetadata(roomId, ay, sem, connection);
        if (metadata) {
            metadata = await scheduleRepository.getScheduleMetadataForUpdate(roomId, ay, sem, connection);
        }

        if (metadata) {
            if (metadata.Status === 'Finalized') {
                return {
                    status: 403,
                    error: 'Cannot modify a finalized schedule. The IT Department Head must reopen it for editing first.'
                };
            }

            if (version !== undefined && version !== null && Number(version) !== Number(metadata.Version)) {
                return {
                    status: 409,
                    error: 'This schedule was modified by another administrator. Please reload the latest schedule before saving your changes.'
                };
            }
        }

        // 2. Cross-room professor double-booking validation across active drafts and official schedules
        if (Array.isArray(schedules) && schedules.length > 0) {
            for (const sched of schedules) {
                if (sched.professor && sched.professor !== 'Not specified') {
                    const profName = String(sched.professor).trim();
                    const profUserId = profNameToId.get(profName);
                    if (profUserId) {
                        const [conflicts] = await scheduleRepository.findUserSchedulesForConflictAll(
                            profUserId, sched.day || 'Monday', ay, sem, cleanRoomNumber, connection
                        );

                        const clash = conflicts.find(c => isTimeOverlap(sched.startTime, sched.endTime, c.Start_Time, c.End_Time));
                        if (clash) {
                            return {
                                status: 400,
                                error: `Schedule conflict: Professor ${sched.professor} is already scheduled in Room ${clash.Room_Number} from ${clash.Start_Time.substring(0, 5)} to ${clash.End_Time.substring(0, 5)} on ${sched.day || 'Monday'}.`
                            };
                        }
                    }
                }
            }
        }

        // Safe replacement in WORKING DRAFT table ONLY (schedule_drafts).
        // Official `schedules` table is NOT touched during draft saves.
        await scheduleRepository.deleteRoomScheduleDraft(roomId, ay, sem, connection);

        if (Array.isArray(schedules) && schedules.length > 0) {
            for (const sched of schedules) {
                const profName = String(sched.professor || '').trim();
                const profUserId = profNameToId.has(profName) ? profNameToId.get(profName) : null;

                await scheduleRepository.insertScheduleDraft({
                    userId: profUserId,
                    roomId,
                    subject: sched.subject || '',
                    section: sched.section || '',
                    day: sched.day || 'Monday',
                    startTime: sched.startTime || '07:00:00',
                    endTime: sched.endTime || '08:00:00',
                    ay,
                    sem,
                    colorTheme: sched.colorTheme || 'blue'
                }, connection);
            }
        }

        let newVersion = 2;
        if (metadata) {
            newVersion = Number(metadata.Version) + 1;
            await connection.query(
                'UPDATE schedule_metadata SET Version = Version + 1, Status = "Draft", Updated_By = ?, Updated_At = NOW() WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
                [userId || null, roomId, ay, sem]
            );
        } else {
            await connection.query(
                'INSERT INTO schedule_metadata (Room_ID, Academic_Year, Semester, Version, Status, Updated_By) VALUES (?, ?, ?, 2, "Draft", ?)',
                [roomId, ay, sem, userId || null]
            );
        }

        return {
            status: 200,
            message: 'Schedule draft saved successfully',
            version: newVersion,
            statusValue: 'Draft'
        };
    });
}

async function checkProfessorConflict(params = {}) {
    const { professorName, day, startTime, endTime, academicYear, semester, excludeRoomNumber } = params;
    if (!professorName || !day || !startTime || !endTime) {
        return { status: 400, error: 'Missing required parameters' };
    }

    if (!ALLOWED_DAYS.includes(day)) {
        return { status: 400, error: `Invalid day: '${day}'. Allowed days: ${ALLOWED_DAYS.join(', ')}.` };
    }

    const currentYear = new Date().getFullYear();
    const ay = academicYear || `${currentYear}-${currentYear + 1}`;
    const sem = semester || '1st Semester';

    const [users] = await scheduleRepository.findUserIdByName(professorName);
    if (users.length === 0) {
        return { status: 200, data: { conflict: false } };
    }
    const userId = users[0].User_ID;

    const [schedules] = await scheduleRepository.findUserSchedulesForConflictAll(userId, day, ay, sem, excludeRoomNumber);

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

async function getRoomSchedule(roomNumber, academicYear, semester, options = {}) {
    const currentYear = new Date().getFullYear();
    const ay = (academicYear && typeof academicYear === 'string') ? academicYear.trim() : `${currentYear}-${currentYear + 1}`;
    const sem = (semester && typeof semester === 'string') ? semester.trim() : '1st Semester';

    const [rooms] = await scheduleRepository.findRoomIdByNumber(roomNumber);
    if (rooms.length === 0) return { status: 404, error: 'Room not found' };
    const roomId = rooms[0].Room_ID;

    const metadata = await scheduleRepository.getScheduleMetadata(roomId, ay, sem);
    const isOfficialView = options && (options.view === 'official' || options.official === true);

    // If strictly requesting official view: read strictly from official `schedules`
    if (isOfficialView) {
        const [schedules] = await scheduleRepository.findRoomSchedules(roomId, ay, sem);
        const version = metadata ? Number(metadata.Version) : 1;
        const status = metadata ? metadata.Status : 'Official';
        return {
            status: 200,
            data: {
                roomNumber: rooms[0].Room_Number,
                academicYear: ay,
                semester: sem,
                version,
                status,
                scheduleStatus: status,
                finalizedBy: metadata ? metadata.Finalized_By_Name : null,
                finalizedAt: metadata ? metadata.Finalized_At : null,
                schedules: deduplicateScheduleList(schedules)
            }
        };
    }

    // Administrative / Editor view (Schedule Studio / Default read)
    if (metadata && metadata.Status === 'Finalized') {
        // Locked official schedule: editor displays official schedule
        const [schedules] = await scheduleRepository.findRoomSchedules(roomId, ay, sem);
        return {
            status: 200,
            data: {
                roomNumber: rooms[0].Room_Number,
                academicYear: ay,
                semester: sem,
                version: Number(metadata.Version),
                status: 'Finalized',
                scheduleStatus: 'Finalized',
                finalizedBy: metadata.Finalized_By_Name,
                finalizedAt: metadata.Finalized_At,
                schedules: deduplicateScheduleList(schedules)
            }
        };
    }

    // Working Draft view: check schedule_drafts
    const [drafts] = await scheduleRepository.findRoomScheduleDrafts(roomId, ay, sem);
    if (drafts.length > 0) {
        return {
            status: 200,
            data: {
                roomNumber: rooms[0].Room_Number,
                academicYear: ay,
                semester: sem,
                version: metadata ? Number(metadata.Version) : 1,
                status: 'Draft',
                scheduleStatus: 'Draft',
                finalizedBy: null,
                finalizedAt: null,
                schedules: deduplicateScheduleList(drafts)
            }
        };
    }

    // If no draft exists yet, check if official `schedules` has rows to initialize from
    const [officialRows] = await scheduleRepository.findRoomSchedules(roomId, ay, sem);
    if (officialRows.length > 0) {
        // Safe initialization: copy official into schedule_drafts so administrators don't start blank
        await scheduleRepository.copyOfficialToDraft(roomId, ay, sem);
        if (!metadata) {
            await scheduleRepository.upsertScheduleMetadata({
                roomId,
                ay,
                sem,
                version: 1,
                status: 'Draft',
                updatedBy: null
            });
        }
        const [initializedDrafts] = await scheduleRepository.findRoomScheduleDrafts(roomId, ay, sem);
        return {
            status: 200,
            data: {
                roomNumber: rooms[0].Room_Number,
                academicYear: ay,
                semester: sem,
                version: metadata ? Number(metadata.Version) : 1,
                status: 'Draft',
                scheduleStatus: 'Draft',
                finalizedBy: null,
                finalizedAt: null,
                schedules: deduplicateScheduleList(initializedDrafts)
            }
        };
    }

    // Neither draft nor official exists
    return {
        status: 200,
        data: {
            roomNumber: rooms[0].Room_Number,
            academicYear: ay,
            semester: sem,
            version: metadata ? Number(metadata.Version) : 1,
            status: 'Draft',
            scheduleStatus: 'Draft',
            finalizedBy: null,
            finalizedAt: null,
            schedules: []
        }
    };
}

async function getUserSchedule(userIdParam, academicYear, semester) {
    const userId = userIdParam || 1;
    const currentYear = new Date().getFullYear();
    const ay = academicYear || `${currentYear}-${currentYear + 1}`;
    const sem = semester || '1st Semester';

    const [schedules] = await scheduleRepository.findUserSchedule(userId, ay, sem);

    return { status: 200, data: schedules };
}

async function getITHeadSummary(sessionUserId, academicYear, semester) {
    const userId = sessionUserId || null;
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = days[new Date().getDay()];
    const nowTime = new Date().toTimeString().split(' ')[0];

    const currentYear = new Date().getFullYear();
    const ay = academicYear || `${currentYear}-${currentYear + 1}`;
    const sem = semester || '1st Semester';

    const [rooms] = await scheduleRepository.findSummaryRoomsStatus(today, nowTime, ay, sem);

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
            r.Current_User_ID != null && r.Scheduled_User_ID != null && String(r.Current_User_ID) === String(r.Scheduled_User_ID)
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
    const [[{ classesToday }]] = await scheduleRepository.countClassesToday(today, ay, sem);

    let myClassesToday = [];
    if (userId) {
        const [myScheds] = await scheduleRepository.findUserClassesToday(userId, today, ay, sem);
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

async function finalizeSchedule(params) {
    const { roomNumber, academicYear, semester, userId } = params;
    const currentYear = new Date().getFullYear();
    const ay = (academicYear && typeof academicYear === 'string') ? academicYear.trim() : `${currentYear}-${currentYear + 1}`;
    const sem = (semester && typeof semester === 'string') ? semester.trim() : '1st Semester';
    const now = new Date();

    if (roomNumber && roomNumber !== 'all') {
        const [rooms] = await scheduleRepository.findRoomIdByNumber(roomNumber);
        if (rooms.length === 0) return { status: 404, error: 'Room not found' };
        const roomId = rooms[0].Room_ID;

        return await scheduleRepository.withTransaction(async (connection) => {
            const hasDraft = await scheduleRepository.hasRoomScheduleDraft(roomId, ay, sem, connection);
            if (hasDraft) {
                await scheduleRepository.publishDraftToOfficial(roomId, ay, sem, connection);
                await scheduleRepository.clearRoomScheduleDraft(roomId, ay, sem, connection);
            }
            await scheduleRepository.setRoomScheduleStatus(roomId, ay, sem, 'Finalized', userId, now, userId, connection);
            return {
                status: 200,
                data: {
                    message: `Schedule for Room ${rooms[0].Room_Number} finalized successfully.`,
                    roomNumber: rooms[0].Room_Number,
                    academicYear: ay,
                    semester: sem,
                    status: 'Finalized',
                    scheduleStatus: 'Finalized',
                    finalizedBy: userId,
                    finalizedAt: now.toISOString()
                }
            };
        });
    } else {
        return await scheduleRepository.withTransaction(async (connection) => {
            const [allRooms] = await scheduleRepository.getAllRoomsScheduleMetadata(ay, sem, connection);
            for (const r of allRooms) {
                const hasDraft = await scheduleRepository.hasRoomScheduleDraft(r.Room_ID, ay, sem, connection);
                if (hasDraft) {
                    await scheduleRepository.publishDraftToOfficial(r.Room_ID, ay, sem, connection);
                    await scheduleRepository.clearRoomScheduleDraft(r.Room_ID, ay, sem, connection);
                }
                await scheduleRepository.setRoomScheduleStatus(r.Room_ID, ay, sem, 'Finalized', userId, now, userId, connection);
            }
            return {
                status: 200,
                data: {
                    message: `All schedules for ${ay} ${sem} finalized successfully.`,
                    academicYear: ay,
                    semester: sem,
                    status: 'Finalized',
                    scheduleStatus: 'Finalized',
                    finalizedBy: userId,
                    finalizedAt: now.toISOString(),
                    roomCount: allRooms.length
                }
            };
        });
    }
}

async function reopenSchedule(params) {
    const { roomNumber, academicYear, semester, userId } = params;
    const currentYear = new Date().getFullYear();
    const ay = (academicYear && typeof academicYear === 'string') ? academicYear.trim() : `${currentYear}-${currentYear + 1}`;
    const sem = (semester && typeof semester === 'string') ? semester.trim() : '1st Semester';

    if (roomNumber && roomNumber !== 'all') {
        const [rooms] = await scheduleRepository.findRoomIdByNumber(roomNumber);
        if (rooms.length === 0) return { status: 404, error: 'Room not found' };
        const roomId = rooms[0].Room_ID;

        return await scheduleRepository.withTransaction(async (connection) => {
            // Copy current official schedule into schedule_drafts
            await scheduleRepository.copyOfficialToDraft(roomId, ay, sem, connection);
            const metadata = await scheduleRepository.getScheduleMetadataForUpdate(roomId, ay, sem, connection);
            if (metadata) {
                await connection.query(
                    'UPDATE schedule_metadata SET Status = "Draft", Updated_By = ?, Updated_At = NOW() WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
                    [userId || null, roomId, ay, sem]
                );
            } else {
                await connection.query(
                    'INSERT INTO schedule_metadata (Room_ID, Academic_Year, Semester, Version, Status, Updated_By) VALUES (?, ?, ?, 1, "Draft", ?)',
                    [roomId, ay, sem, userId || null]
                );
            }
            // CRITICAL: Official `schedules` remains intact and visible to Faculty/Students!
            return {
                status: 200,
                data: {
                    message: `Schedule for Room ${rooms[0].Room_Number} reopened for editing.`,
                    roomNumber: rooms[0].Room_Number,
                    academicYear: ay,
                    semester: sem,
                    status: 'Draft',
                    scheduleStatus: 'Draft'
                }
            };
        });
    } else {
        return await scheduleRepository.withTransaction(async (connection) => {
            const [allRooms] = await scheduleRepository.getAllRoomsScheduleMetadata(ay, sem, connection);
            for (const r of allRooms) {
                await scheduleRepository.copyOfficialToDraft(r.Room_ID, ay, sem, connection);
                const metadata = await scheduleRepository.getScheduleMetadataForUpdate(r.Room_ID, ay, sem, connection);
                if (metadata) {
                    await connection.query(
                        'UPDATE schedule_metadata SET Status = "Draft", Updated_By = ?, Updated_At = NOW() WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
                        [userId || null, r.Room_ID, ay, sem]
                    );
                } else {
                    await connection.query(
                        'INSERT INTO schedule_metadata (Room_ID, Academic_Year, Semester, Version, Status, Updated_By) VALUES (?, ?, ?, 1, "Draft", ?)',
                        [r.Room_ID, ay, sem, userId || null]
                    );
                }
            }
            return {
                status: 200,
                data: {
                    message: `All schedules for ${ay} ${sem} reopened for editing.`,
                    academicYear: ay,
                    semester: sem,
                    status: 'Draft',
                    scheduleStatus: 'Draft',
                    roomCount: allRooms.length
                }
            };
        });
    }
}

async function getScheduleStatus(params) {
    const { roomNumber, academicYear, semester } = params;
    const currentYear = new Date().getFullYear();
    const ay = (academicYear && typeof academicYear === 'string') ? academicYear.trim() : `${currentYear}-${currentYear + 1}`;
    const sem = (semester && typeof semester === 'string') ? semester.trim() : '1st Semester';

    if (roomNumber && roomNumber !== 'all') {
        const [rooms] = await scheduleRepository.findRoomIdByNumber(roomNumber);
        if (rooms.length === 0) return { status: 404, error: 'Room not found' };
        const metadata = await scheduleRepository.getScheduleMetadata(rooms[0].Room_ID, ay, sem);

        const status = metadata ? metadata.Status : 'Draft';
        return {
            status: 200,
            data: {
                roomNumber: rooms[0].Room_Number,
                academicYear: ay,
                semester: sem,
                version: metadata ? Number(metadata.Version) : 1,
                status,
                scheduleStatus: status,
                finalizedBy: metadata ? metadata.Finalized_By_Name : null,
                finalizedAt: metadata ? metadata.Finalized_At : null
            }
        };
    } else {
        const [allRooms] = await scheduleRepository.getAllRoomsScheduleMetadata(ay, sem);
        const total = allRooms.length;
        const finalizedCount = allRooms.filter(r => r.Status === 'Finalized').length;
        const overallStatus = (total > 0 && finalizedCount === total) ? 'Finalized' : 'Draft';

        return {
            status: 200,
            data: {
                academicYear: ay,
                semester: sem,
                overallStatus,
                status: overallStatus,
                scheduleStatus: overallStatus,
                totalRooms: total,
                finalizedRooms: finalizedCount,
                rooms: allRooms
            }
        };
    }
}

module.exports = {
    saveRoomSchedule,
    checkProfessorConflict,
    getProfessorSchedule,
    getFacultyScheduleByName,
    getRoomSchedule,
    getUserSchedule,
    getITHeadSummary,
    finalizeSchedule,
    reopenSchedule,
    getScheduleStatus
};

