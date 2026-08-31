'use strict';

const express = require('express');
const router = express.Router();
const facultyController = require('../controllers/faculty.controller');
const { requireAuth, requireRole, IT_HEAD_ROLES } = require('../middleware/auth');

router.get('/', requireAuth, facultyController.getAllFaculty);
router.post('/add', requireRole(IT_HEAD_ROLES), facultyController.addFaculty);
router.put('/:userId/role', requireRole(IT_HEAD_ROLES), facultyController.updateFacultyRole);
router.delete('/:userId', requireRole(IT_HEAD_ROLES), facultyController.deleteFaculty);

module.exports = router;
