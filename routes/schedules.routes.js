'use strict';

const express = require('express');
const router = express.Router();
const schedulesController = require('../controllers/schedules.controller');

router.post('/save', schedulesController.saveSchedule);
router.get('/check-professor-conflict', schedulesController.checkConflict);
router.get('/professor', schedulesController.getProfessorSchedule);
router.get('/room/:roomNumber', schedulesController.getRoomSchedule);
router.get('/user', schedulesController.getUserSchedule);

module.exports = router;
