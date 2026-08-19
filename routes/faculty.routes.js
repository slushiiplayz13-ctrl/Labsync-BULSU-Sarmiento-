'use strict';

const express = require('express');
const router = express.Router();
const facultyController = require('../controllers/faculty.controller');
const { requireAuth, requireRole, ADMIN_ROLES } = require('../middleware/auth');

router.get('/', requireAuth, facultyController.getAllFaculty);
router.post('/add', requireRole(ADMIN_ROLES), facultyController.addFaculty);
router.put('/:userId/role', requireRole(ADMIN_ROLES), facultyController.updateFacultyRole);
router.delete('/:userId', requireRole(ADMIN_ROLES), facultyController.deleteFaculty);

module.exports = router;
