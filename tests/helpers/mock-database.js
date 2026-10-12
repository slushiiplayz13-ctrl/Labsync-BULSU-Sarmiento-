'use strict';

/**
 * tests/helpers/mock-database.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Isolated in-memory database mock for LabSync unit & integration testing.
 *
 * Provides a 100% database-isolated execution environment:
 * - Emulates MySQL connection pool, transactions, rollbacks, and row-level locks.
 * - Prevents tests from connecting to or mutating the live 'labsync' database.
 * - Concurrency safe: Simulates FOR UPDATE pessimistic locking for student cooldowns.
 */

class MockDatabase {
  constructor() {
    this.reset();
    this.lockedKeys = new Map(); // key -> holderId
    this.lockWaiters = new Map(); // key -> Array<{ holderId, resolve }>
    this.nextConnId = 1;
    this.autoId = {
      laboratories: 10,
      lab_units: 500,
      student_verification_sessions: 1,
      maintenance_issues: 100,
      maintenance: 200,
      security_audit_logs: 1
    };
  }

  reset() {
    this.laboratories = [
      { Room_ID: 1, Room_Number: '204', Building: 'IT Building', Current_Status: 'Available' }
    ];
    this.lab_units = [
      { PC_ID: 101, Room_ID: 1, PC_Number: '91', Condition_Status: 'Functional', PC_QR_String: 'QR-91' },
      { PC_ID: 102, Room_ID: 1, PC_Number: '92', Condition_Status: 'Functional', PC_QR_String: 'QR-92' }
    ];
    this.student_verification_sessions = [];
    this.student_report_cooldowns = new Map();
    this.maintenance_issues = [];
    this.maintenance = [];
    this.security_audit_logs = [];
    this.lockedKeys = new Map();
    this.lockWaiters = new Map();
  }

  async acquireLock(key, connId) {
    if (!this.lockedKeys.has(key)) {
      this.lockedKeys.set(key, connId);
      return;
    }
    if (this.lockedKeys.get(key) === connId) {
      return; // Already holds lock
    }
    // Wait for lock release
    await new Promise((resolve) => {
      if (!this.lockWaiters.has(key)) {
        this.lockWaiters.set(key, []);
      }
      this.lockWaiters.get(key).push({ connId, resolve });
    });
    this.lockedKeys.set(key, connId);
  }

  releaseLocks(connId) {
    for (const [key, holderId] of this.lockedKeys.entries()) {
      if (holderId === connId) {
        this.lockedKeys.delete(key);
        const waiters = this.lockWaiters.get(key);
        if (waiters && waiters.length > 0) {
          const next = waiters.shift();
          if (waiters.length === 0) this.lockWaiters.delete(key);
          next.resolve();
        }
      }
    }
  }

  getConnection() {
    const connId = this.nextConnId++;
    const mockDb = this;
    let inTransaction = false;
    const sessionOriginalStates = new Map();
    const cooldownOriginalStates = new Map();

    const connection = {
      id: connId,
      async beginTransaction() {
        inTransaction = true;
      },
      async commit() {
        inTransaction = false;
        sessionOriginalStates.clear();
        cooldownOriginalStates.clear();
        mockDb.releaseLocks(connId);
      },
      async rollback() {
        // Roll back only writes created by this connection
        mockDb.laboratories = mockDb.laboratories.filter(r => r._connId !== connId);
        mockDb.lab_units = mockDb.lab_units.filter(u => u._connId !== connId);
        mockDb.maintenance_issues = mockDb.maintenance_issues.filter(i => i._connId !== connId);
        mockDb.maintenance = mockDb.maintenance.filter(m => m._connId !== connId);

        // Revert session used state if marked by this connection
        for (const [nonce, prevUsedAt] of sessionOriginalStates.entries()) {
          const s = mockDb.student_verification_sessions.find(x => x.Nonce === nonce);
          if (s) s.Used_At = prevUsedAt;
        }
        sessionOriginalStates.clear();

        // Revert cooldown modifications if modified by this connection
        for (const [studentNum, prevRec] of cooldownOriginalStates.entries()) {
          if (prevRec === null) {
            mockDb.student_report_cooldowns.delete(studentNum);
          } else {
            mockDb.student_report_cooldowns.set(studentNum, prevRec);
          }
        }
        cooldownOriginalStates.clear();

        inTransaction = false;
        mockDb.releaseLocks(connId);
      },
      release() {
        mockDb.releaseLocks(connId);
      },
      async query(sql, params = []) {
        return mockDb.executeQuery(sql, params, connId, {
          onSessionMarkUsed: (nonce, prevUsedAt) => {
            if (!sessionOriginalStates.has(nonce)) sessionOriginalStates.set(nonce, prevUsedAt);
          },
          onCooldownModify: (studentNum, prevRec) => {
            if (!cooldownOriginalStates.has(studentNum)) cooldownOriginalStates.set(studentNum, prevRec);
          }
        });
      }
    };
    return connection;
  }

  async query(sql, params = []) {
    return this.executeQuery(sql, params, 0);
  }

  async executeQuery(sql, params = [], connId = 0, hooks = {}) {
    const trimmed = sql.trim().replace(/\s+/g, ' ');

    // 1. Laboratories: Room lookup
    if (/SELECT.*FROM laboratories WHERE Room_Number = \?/i.test(trimmed)) {
      const roomNum = String(params[0]).trim();
      const rows = this.laboratories.filter(r => String(r.Room_Number).trim() === roomNum);
      return [rows];
    }
    if (/INSERT INTO laboratories/i.test(trimmed)) {
      const roomNum = String(params[0]).trim();
      const building = String(params[1]).trim();
      const insId = ++this.autoId.laboratories;
      this.laboratories.push({ Room_ID: insId, Room_Number: roomNum, Building: building, Current_Status: 'Available' });
      return [{ insertId: insId, affectedRows: 1 }];
    }

    // 2. Lab Units: Find PC by Room and Number
    if (/SELECT PC_ID, PC_Number, Condition_Status FROM lab_units WHERE Room_ID = \?/i.test(trimmed)) {
      const roomId = Number(params[0]);
      const raw = String(params[1] || '').trim();
      const clean = String(params[2] || '').trim();
      const cleanInt = Number(params[4]);

      const rows = this.lab_units.filter(u => {
        if (u.Room_ID !== roomId) return false;
        if (String(u.PC_Number).trim() === raw) return true;
        if (String(u.PC_Number).trim() === clean) return true;
        if (!isNaN(cleanInt) && cleanInt > 0 && parseInt(u.PC_Number, 10) === cleanInt) return true;
        return false;
      });
      return [rows];
    }

    // 3. Lab Units: Lock PC for update
    if (/SELECT PC_ID FROM lab_units WHERE PC_ID = \? FOR UPDATE/i.test(trimmed)) {
      const pcId = Number(params[0]);
      const rows = this.lab_units.filter(u => u.PC_ID === pcId);
      return [rows];
    }

    // 4. Lab Units: Insert PC
    if (/INSERT INTO lab_units \(Room_ID, PC_Number, Condition_Status, PC_QR_String\)/i.test(trimmed)) {
      const roomId = Number(params[0]);
      const pcNum = String(params[1]).trim();
      const cond = String(params[2] || 'Functional');
      const qr = String(params[3] || '');
      const insId = ++this.autoId.lab_units;
      this.lab_units.push({ PC_ID: insId, Room_ID: roomId, PC_Number: pcNum, Condition_Status: cond, PC_QR_String: qr, _connId: connId });
      return [{ insertId: insId, affectedRows: 1 }];
    }

    // 5. Lab Units: Update Condition Status
    if (/UPDATE lab_units SET Condition_Status = \? WHERE PC_ID = \?/i.test(trimmed)) {
      const cond = params[0];
      const pcId = Number(params[1]);
      let updated = 0;
      for (const u of this.lab_units) {
        if (u.PC_ID === pcId) {
          u.Condition_Status = cond;
          updated++;
        }
      }
      return [{ affectedRows: updated }];
    }

    // 6. Student Verification Sessions: Insert Session
    if (/INSERT INTO student_verification_sessions/i.test(trimmed)) {
      const [vId, nonce, name, num, room, pc, issued, expires] = params;
      const insId = ++this.autoId.student_verification_sessions;
      this.student_verification_sessions.push({
        Session_ID: insId,
        Verification_ID: vId,
        Nonce: nonce,
        Student_Name: name,
        Student_Number: num,
        Room_Number: room,
        PC_Number: pc,
        Issued_At: new Date(issued),
        Expires_At: new Date(expires),
        Used_At: null,
        _connId: connId
      });
      return [{ insertId: insId, affectedRows: 1 }];
    }

    // 7. Student Verification Sessions: Find Session by Nonce
    if (/SELECT Session_ID.*FROM student_verification_sessions WHERE Nonce = \?/i.test(trimmed)) {
      const nonce = String(params[0]).trim();
      const rows = this.student_verification_sessions.filter(s => s.Nonce === nonce);
      return [rows];
    }

    // 8. Student Verification Sessions: Mark Used
    if (/UPDATE student_verification_sessions SET Used_At = NOW\(\) WHERE Nonce = \? AND Used_At IS NULL/i.test(trimmed)) {
      const nonce = String(params[0]).trim();
      let affected = 0;
      for (const s of this.student_verification_sessions) {
        if (s.Nonce === nonce && s.Used_At === null) {
          if (hooks && hooks.onSessionMarkUsed) hooks.onSessionMarkUsed(nonce, null);
          s.Used_At = new Date();
          affected++;
        }
      }
      return [{ affectedRows: affected }];
    }

    // 9. Student Report Cooldowns: Upsert primer
    if (/INSERT INTO student_report_cooldowns \(Student_Number, Last_Reported_At, Cooldown_Until\) VALUES \(\?,.*ON DUPLICATE KEY UPDATE/i.test(trimmed)) {
      const cleanNum = String(params[0]).trim().toUpperCase();
      if (!this.student_report_cooldowns.has(cleanNum)) {
        if (hooks && hooks.onCooldownModify) hooks.onCooldownModify(cleanNum, null);
        this.student_report_cooldowns.set(cleanNum, {
          Student_Number: cleanNum,
          Last_Reported_At: new Date(0),
          Cooldown_Until: new Date(0),
          Last_Report_ID: null
        });
      }
      return [{ affectedRows: 1 }];
    }

    // 10. Student Report Cooldowns: Select with lock (FOR UPDATE)
    if (/SELECT.*FROM student_report_cooldowns WHERE Student_Number = \? FOR UPDATE/i.test(trimmed)) {
      const cleanNum = String(params[0]).trim().toUpperCase();
      // Acquire row lock
      await this.acquireLock(`student_cooldown:${cleanNum}`, connId);
      const rec = this.student_report_cooldowns.get(cleanNum);
      if (!rec) return [[]];

      const now = Date.now();
      const cooldownMs = rec.Cooldown_Until ? rec.Cooldown_Until.getTime() : 0;
      const remSec = Math.max(0, Math.round((cooldownMs - now) / 1000));
      return [[{
        Student_Number: rec.Student_Number,
        Last_Reported_At: rec.Last_Reported_At,
        Cooldown_Until: rec.Cooldown_Until,
        RemainingSeconds: remSec
      }]];
    }

    // 11. Student Report Cooldowns: Read-only query
    if (/SELECT.*FROM student_report_cooldowns WHERE Student_Number = \?/i.test(trimmed)) {
      const cleanNum = String(params[0]).trim().toUpperCase();
      const rec = this.student_report_cooldowns.get(cleanNum);
      if (!rec) return [[]];

      const now = Date.now();
      const cooldownMs = rec.Cooldown_Until ? rec.Cooldown_Until.getTime() : 0;
      const remSec = Math.max(0, Math.round((cooldownMs - now) / 1000));
      return [[{
        Student_Number: rec.Student_Number,
        Last_Reported_At: rec.Last_Reported_At,
        Cooldown_Until: rec.Cooldown_Until,
        RemainingSeconds: remSec
      }]];
    }

    // 12. Student Report Cooldowns: Record Cooldown (UPDATE on report persistence)
    if (/INSERT INTO student_report_cooldowns \(Student_Number, Last_Reported_At, Cooldown_Until, Last_Report_ID\) VALUES \(\?, NOW\(\), DATE_ADD\(NOW\(\), INTERVAL 30 MINUTE\), \?\)/i.test(trimmed)) {
      const cleanNum = String(params[0]).trim().toUpperCase();
      const reportId = params[1] || null;
      const now = new Date();
      const until = new Date(now.getTime() + 30 * 60 * 1000);

      if (hooks && hooks.onCooldownModify) {
        const existing = this.student_report_cooldowns.get(cleanNum);
        hooks.onCooldownModify(cleanNum, existing ? { ...existing } : null);
      }

      this.student_report_cooldowns.set(cleanNum, {
        Student_Number: cleanNum,
        Last_Reported_At: now,
        Cooldown_Until: until,
        Last_Report_ID: reportId
      });
      return [{ affectedRows: 1 }];
    }

    // 13. Student Report Cooldowns: Direct UPDATE (for testing expiration fast-forward)
    if (/UPDATE student_report_cooldowns SET Cooldown_Until = DATE_SUB/i.test(trimmed)) {
      const cleanNum = String(params[0]).trim().toUpperCase();
      const rec = this.student_report_cooldowns.get(cleanNum);
      if (rec) {
        rec.Cooldown_Until = new Date(Date.now() - 60 * 1000);
        rec.Last_Reported_At = new Date(Date.now() - 31 * 60 * 1000);
      }
      return [{ affectedRows: rec ? 1 : 0 }];
    }

    // 14. Maintenance: Historical fallback check
    if (/SELECT Date_Reported.*FROM maintenance WHERE Student_Number = \? ORDER BY Date_Reported DESC LIMIT 1/i.test(trimmed)) {
      const cleanNum = String(params[0]).trim().toUpperCase();
      const reports = this.maintenance.filter(m => String(m.Student_Number).trim().toUpperCase() === cleanNum);
      if (reports.length === 0) return [[]];
      reports.sort((a, b) => b.Date_Reported.getTime() - a.Date_Reported.getTime());
      const latest = reports[0];
      const now = Date.now();
      const untilMs = latest.Date_Reported.getTime() + 30 * 60 * 1000;
      const remSec = Math.max(0, Math.round((untilMs - now) / 1000));
      return [[{
        Date_Reported: latest.Date_Reported,
        RemainingSec: remSec
      }]];
    }

    // 15. Maintenance: Direct update (for testing expiration)
    if (/UPDATE maintenance SET Date_Reported = DATE_SUB/i.test(trimmed)) {
      const cleanNum = String(params[0]).trim().toUpperCase();
      for (const m of this.maintenance) {
        if (String(m.Student_Number).trim().toUpperCase() === cleanNum) {
          m.Date_Reported = new Date(Date.now() - 31 * 60 * 1000);
        }
      }
      return [{ affectedRows: 1 }];
    }

    // 16. Maintenance Issues: Find active issue
    if (/SELECT Issue_ID, Priority_Level, Status FROM maintenance_issues WHERE PC_ID = \? AND Issue_Type = \? AND Status != 'Resolved' FOR UPDATE/i.test(trimmed)) {
      const pcId = Number(params[0]);
      const issueType = String(params[1]);
      const rows = this.maintenance_issues.filter(i => i.PC_ID === pcId && i.Issue_Type === issueType && i.Status !== 'Resolved');
      return [rows];
    }

    // 17. Maintenance Issues: Insert Issue
    if (/INSERT INTO maintenance_issues \(PC_ID, Issue_Type, Status, Priority_Level, Created_At\)/i.test(trimmed)) {
      const [pcId, issueType, status, priority] = params;
      const insId = ++this.autoId.maintenance_issues;
      this.maintenance_issues.push({
        Issue_ID: insId,
        PC_ID: Number(pcId),
        Issue_Type: issueType,
        Status: status,
        Priority_Level: priority,
        Created_At: new Date(),
        _connId: connId
      });
      return [{ insertId: insId, affectedRows: 1 }];
    }

    // 18. Maintenance Issues: Update Issue Priority
    if (/UPDATE maintenance_issues SET Priority_Level = \? WHERE Issue_ID = \?/i.test(trimmed)) {
      const prio = params[0];
      const issueId = Number(params[1]);
      for (const i of this.maintenance_issues) {
        if (i.Issue_ID === issueId) i.Priority_Level = prio;
      }
      return [{ affectedRows: 1 }];
    }

    // 19. Maintenance: Insert Student Report
    if (/INSERT INTO maintenance \(Maintenance_Issue_ID, PC_ID, Student_Name, Student_Number, Issue_Description, Date_Reported, Status, Priority_Level\)/i.test(trimmed)) {
      const [issueId, pcId, name, num, desc, status, priority] = params;
      const insId = ++this.autoId.maintenance;
      this.maintenance.push({
        Report_ID: insId,
        Maintenance_Issue_ID: Number(issueId),
        PC_ID: Number(pcId),
        Student_Name: name,
        Student_Number: num ? String(num).toUpperCase() : null,
        Issue_Description: desc,
        Date_Reported: new Date(),
        Status: status,
        Priority_Level: priority,
        _connId: connId
      });
      return [{ insertId: insId, affectedRows: 1 }];
    }

    // 20. Maintenance: Find all maintenance issues with joins
    if (/SELECT i\.Issue_ID.*FROM maintenance_issues i JOIN lab_units p/i.test(trimmed)) {
      const rows = this.maintenance_issues.map(iss => {
        const pc = this.lab_units.find(u => u.PC_ID === iss.PC_ID) || { PC_Number: '91', Room_ID: 1 };
        const room = this.laboratories.find(r => r.Room_ID === pc.Room_ID) || { Room_Number: '204', Building: 'IT Building' };
        return {
          Issue_ID: iss.Issue_ID,
          PC_ID: iss.PC_ID,
          Issue_Type: iss.Issue_Type,
          Status: iss.Status,
          Priority_Level: iss.Priority_Level,
          Created_At: iss.Created_At,
          Resolved_At: null,
          Resolved_By_User_ID: null,
          Resolved_By_Name: null,
          Resolved_By_Role: null,
          Follow_Up_Count: 0,
          Followed_Up_At: null,
          Followed_Up_By_User_ID: null,
          Followed_Up_Today: 0,
          Followed_Up_By_Name: null,
          Followed_Up_By_Role: null,
          PC_Number: pc.PC_Number,
          Room_Number: room.Room_Number,
          Building: room.Building,
          Latest_Reported_At: iss.Created_At
        };
      });
      return [rows];
    }
    if (/SELECT Report_ID, Maintenance_Issue_ID.*FROM maintenance WHERE Maintenance_Issue_ID IN/i.test(trimmed)) {
      const ids = Array.isArray(params[0]) ? params[0] : [params[0]];
      const rows = this.maintenance.filter(m => ids.includes(m.Maintenance_Issue_ID));
      return [rows];
    }

    // 21. Maintenance: Select reports by student number
    if (/SELECT Report_ID FROM maintenance WHERE Student_Number = \?/i.test(trimmed)) {
      const num = String(params[0]).trim().toUpperCase();
      const rows = this.maintenance.filter(m => m.Student_Number === num);
      return [rows];
    }
    if (/SELECT Maintenance_Issue_ID FROM maintenance WHERE Report_ID = \?/i.test(trimmed)) {
      const repId = Number(params[0]);
      const rows = this.maintenance.filter(m => m.Report_ID === repId);
      return [rows];
    }

    // 22. Audit Logs: Insert
    if (/INSERT INTO security_audit_logs/i.test(trimmed)) {
      const insId = ++this.autoId.security_audit_logs;
      this.security_audit_logs.push({ Log_ID: insId, params });
      return [{ insertId: insId, affectedRows: 1 }];
    }

    // 23. Cleanup queries
    if (/DELETE FROM/i.test(trimmed)) {
      return [{ affectedRows: 1 }];
    }

    // 24. PC Status / ID check
    if (/SELECT.*FROM lab_units WHERE Room_ID = \? AND PC_Number = \?/i.test(trimmed)) {
      const roomId = Number(params[0]);
      const pcNum = String(params[1]).trim();
      const rows = this.lab_units.filter(u => u.Room_ID === roomId && String(u.PC_Number).trim() === pcNum);
      return [rows];
    }

    // Fallback default
    return [[]];
  }
}

/**
 * Installs the MockDatabase into Node's require.cache for ../database/connection.
 */
function installMockDatabase() {
  process.env.TEST_ENV = 'isolated-mock';
  const connectionPath = require.resolve('../../database/connection');
  const mockDb = new MockDatabase();
  require.cache[connectionPath] = {
    id: connectionPath,
    filename: connectionPath,
    loaded: true,
    exports: mockDb
  };
  return mockDb;
}

module.exports = {
  MockDatabase,
  installMockDatabase
};
