'use strict';

const express = require('express');
const router = express.Router();
const schedulesController = require('../controllers/schedules.controller');
const { requireAuth, requireRole, IT_HEAD_ROLES } = require('../middleware/auth');

router.post('/save', requireRole(IT_HEAD_ROLES), schedulesController.saveSchedule);
router.post('/finalize', requireRole(IT_HEAD_ROLES), schedulesController.finalizeSchedule);
router.post('/reopen', requireRole(IT_HEAD_ROLES), schedulesController.reopenSchedule);

// Collaborative Room Editing Lock Endpoints
router.post('/room-locks/acquire', requireRole(IT_HEAD_ROLES), schedulesController.acquireRoomLock);
router.post('/room-locks/heartbeat', requireRole(IT_HEAD_ROLES), schedulesController.renewRoomLockHeartbeat);
router.post('/room-locks/release', requireRole(IT_HEAD_ROLES), schedulesController.releaseRoomLock);
router.get('/room-locks/status', requireRole(IT_HEAD_ROLES), schedulesController.getRoomLockStatus);

router.get('/status', requireAuth, schedulesController.getScheduleStatus);
router.get('/check-professor-conflict', requireAuth, schedulesController.checkConflict);
router.get('/professor', requireAuth, schedulesController.getProfessorSchedule);
router.get('/faculty/:professorName', requireAuth, schedulesController.getFacultyScheduleByName);
router.get('/room/:roomNumber', requireAuth, schedulesController.getRoomSchedule);
router.get('/user', requireAuth, schedulesController.getUserSchedule);

module.exports = router;

