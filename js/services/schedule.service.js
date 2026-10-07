/**
 * LabSync – Schedule API Service | js/services/schedule.service.js
 * Extracted in Phase 2 (Scheduling Architecture Refactor)
 * Encapsulates all backend API calls for room schedules, user schedules, and professor conflict checks.
 */

(function (global) {
  'use strict';

  /**
   * Fetches the weekly schedule for a specific laboratory room.
   * @param {string|number} roomNum - Room number
   * @param {string} academicYear - Academic year string (e.g. "2026-2027")
   * @param {string} semester - Semester string (e.g. "1st Semester")
   * @returns {Promise<Array>}
   */
  async function getRoomSchedule(roomNum, academicYear = '', semester = '') {
    let url = `/api/schedules/room/${encodeURIComponent(roomNum)}`;
    const params = [];
    if (academicYear) params.push(`academicYear=${encodeURIComponent(academicYear)}`);
    if (semester) params.push(`semester=${encodeURIComponent(semester)}`);
    if (params.length > 0) url += `?${params.join('&')}`;

    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`Failed to load schedule for room ${roomNum}`);
    return await res.json();
  }

  /**
   * Fetches the current logged-in user's weekly teaching schedule.
   * @param {string} academicYear - Academic year
   * @param {string} semester - Semester
   * @returns {Promise<Array>}
   */
  async function getUserSchedule(academicYear = '', semester = '') {
    let url = '/api/schedules/user';
    const params = [];
    if (academicYear) params.push(`academicYear=${encodeURIComponent(academicYear)}`);
    if (semester) params.push(`semester=${encodeURIComponent(semester)}`);
    if (params.length > 0) url += `?${params.join('&')}`;

    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch user schedule');
    const data = await res.json();
    try {
      sessionStorage.setItem('labsync_cached_user_schedule', JSON.stringify(data));
    } catch (e) {}
    return data;
  }

  async function saveRoomSchedule(roomNum, schedules, academicYear, semester, version) {
    const payload = {
      roomNumber: roomNum,
      schedules: schedules,
      academicYear: academicYear,
      semester: semester
    };
    if (version !== undefined && version !== null) {
      payload.version = version;
    }
    const res = await fetch('/api/schedules/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Failed to save draft');
      err.status = res.status;
      err.response = data;
      throw err;
    }
    return data;
  }

  /**
   * Finalizes official room schedule (IT Dept. Head only).
   * @param {string|number} roomNum
   * @param {string} academicYear
   * @param {string} semester
   * @returns {Promise<object>}
   */
  async function finalizeSchedule(roomNum, academicYear = '', semester = '') {
    const res = await fetch('/api/schedules/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        roomNumber: roomNum,
        academicYear,
        semester
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Failed to finalize schedule');
      err.status = res.status;
      err.response = data;
      throw err;
    }
    return data;
  }

  /**
   * Reopens a finalized schedule for editing (IT Dept. Head only).
   * @param {string|number} roomNum
   * @param {string} academicYear
   * @param {string} semester
   * @returns {Promise<object>}
   */
  async function reopenSchedule(roomNum, academicYear = '', semester = '') {
    const res = await fetch('/api/schedules/reopen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        roomNumber: roomNum,
        academicYear,
        semester
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Failed to reopen schedule');
      err.status = res.status;
      err.response = data;
      throw err;
    }
    return data;
  }

  /**
   * Gets schedule lifecycle status and metadata for a room or term.
   * @param {string|number} [roomNum]
   * @param {string} [academicYear]
   * @param {string} [semester]
   * @returns {Promise<object|null>}
   */
  async function getScheduleStatus(roomNum = '', academicYear = '', semester = '') {
    let url = '/api/schedules/status';
    const params = [];
    if (roomNum) params.push(`roomNumber=${encodeURIComponent(roomNum)}`);
    if (academicYear) params.push(`academicYear=${encodeURIComponent(academicYear)}`);
    if (semester) params.push(`semester=${encodeURIComponent(semester)}`);
    if (params.length > 0) url += `?${params.join('&')}`;

    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.error('Error fetching schedule status:', err);
      return null;
    }
  }

  /**
   * Checks if a professor is already scheduled in another room at the specified time.
   * @param {string} professorName - Professor name
   * @param {string} day - Day of week
   * @param {string} startTime - Start time (HH:MM)
   * @param {string} endTime - End time (HH:MM)
   * @param {string} academicYear - Academic year
   * @param {string} semester - Semester
   * @param {string|number} excludeRoomNumber - Current room number
   * @returns {Promise<{conflict: boolean, conflictingRoom?: string, startTime?: string, endTime?: string}>}
   */
  async function checkProfessorConflict(professorName, day, startTime, endTime, academicYear, semester, excludeRoomNumber) {
    if (!professorName || professorName === 'Not specified') return { conflict: false };

    try {
      const url = `/api/schedules/check-professor-conflict?professorName=${encodeURIComponent(professorName)}&day=${encodeURIComponent(day)}&startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}&academicYear=${encodeURIComponent(academicYear || '')}&semester=${encodeURIComponent(semester || '')}&excludeRoomNumber=${encodeURIComponent(excludeRoomNumber || '')}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return { conflict: false };
      return await res.json();
    } catch (err) {
      console.error('Error checking professor conflict:', err);
      return { conflict: false };
    }
  }

  /**
   * Fetches all scheduled teaching slots for a professor across other rooms.
   * @param {string} professorName - Professor name
   * @param {string} academicYear - Academic year
   * @param {string} semester - Semester
   * @param {string|number} excludeRoomNumber - Exclude current room
   * @returns {Promise<Array>}
   */
  async function getProfessorSchedule(professorName, academicYear, semester, excludeRoomNumber) {
    if (!professorName || professorName === 'Not specified') return [];
    try {
      const url = `/api/schedules/professor?professorName=${encodeURIComponent(professorName)}&academicYear=${encodeURIComponent(academicYear || '')}&semester=${encodeURIComponent(semester || '')}&excludeRoomNumber=${encodeURIComponent(excludeRoomNumber || '')}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.error('Error loading professor schedule:', err);
      return [];
    }
  }

  /**
   * Fetches list of all faculty members for dropdowns.
   * @returns {Promise<Array>}
   */
  async function getFaculty() {
    const res = await fetch('/api/faculty', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch faculty list');
    return await res.json();
  }

  /**
   * Fetches IT Head summary metrics.
   * @param {string} academicYear
   * @param {string} semester
   * @returns {Promise<object|null>}
   */
  async function getITHeadSummary(academicYear = '', semester = '') {
    let url = '/api/dashboard/it-head-summary';
    const params = [];
    if (academicYear) params.push(`academicYear=${encodeURIComponent(academicYear)}`);
    if (semester) params.push(`semester=${encodeURIComponent(semester)}`);
    if (params.length > 0) url += `?${params.join('&')}`;

    try {
      const res = await fetch(url, { credentials: 'include', headers: { 'Accept': 'application/json' } });
      if (!res.ok) return null;
      const data = await res.json();
      try {
        sessionStorage.setItem('labsync_cached_ithead_summary', JSON.stringify(data));
      } catch (e) {}
      return data;
    } catch (err) {
      console.error('Error fetching IT Head summary:', err);
      return null;
    }
  }

  /**
   * Fetches weekly teaching schedule for a specific faculty member by name.
   * @param {string} facultyName
   * @returns {Promise<Array>}
   */
  async function getFacultyScheduleByName(facultyName) {
    if (!facultyName) return [];
    try {
      const encodedName = encodeURIComponent(facultyName);
      const res = await fetch(`/api/schedules/faculty/${encodedName}`, { credentials: 'include' });
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.error('Error fetching faculty schedule:', err);
      return [];
    }
  }

  const scheduleService = {
    getRoomSchedule,
    getUserSchedule,
    saveRoomSchedule,
    finalizeSchedule,
    reopenSchedule,
    getScheduleStatus,
    checkProfessorConflict,
    getProfessorSchedule,
    getFaculty,
    getITHeadSummary,
    getFacultyScheduleByName
  };

  global.getRoomSchedule = getRoomSchedule;
  global.getUserSchedule = getUserSchedule;
  global.saveRoomSchedule = saveRoomSchedule;
  global.finalizeSchedule = finalizeSchedule;
  global.reopenSchedule = reopenSchedule;
  global.getScheduleStatus = getScheduleStatus;
  global.checkProfessorConflict = checkProfessorConflict;
  global.getProfessorSchedule = getProfessorSchedule;
  global.getFaculty = getFaculty;
  global.getITHeadSummary = getITHeadSummary;
  global.getFacultyScheduleByName = getFacultyScheduleByName;
  global.scheduleService = scheduleService;

})(typeof window !== 'undefined' ? window : this);
