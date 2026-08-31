'use strict';

const express = require('express');
const router = express.Router();
const schedulesController = require('../controllers/schedules.controller');
const { requireAuth, requireRole, IT_HEAD_ROLES } = require('../middleware/auth');

router.post('/save', requireRole(IT_HEAD_ROLES), schedulesController.saveSchedule);
router.get('/check-professor-conflict', requireAuth, schedulesController.checkConflict);
router.get('/professor', requireAuth, schedulesController.getProfessorSchedule);
router.get('/faculty/:professorName', requireAuth, schedulesController.getFacultyScheduleByName);
router.get('/room/:roomNumber', requireAuth, schedulesController.getRoomSchedule);
router.get('/user', requireAuth, schedulesController.getUserSchedule);

module.exports = router;

