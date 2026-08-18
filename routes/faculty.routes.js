'use strict';

const express = require('express');
const router = express.Router();
const facultyController = require('../controllers/faculty.controller');
const { requireAuth } = require('../middleware/auth');

router.get('/', facultyController.getAllFaculty);
router.post('/add', requireAuth, facultyController.addFaculty);
router.put('/:userId/role', requireAuth, facultyController.updateFacultyRole);
router.delete('/:userId', requireAuth, facultyController.deleteFaculty);

module.exports = router;
