'use strict';

const express = require('express');
const router = express.Router();
const curriculumController = require('../controllers/curriculum.controller');
const { requireAuth, requireRole, ADMIN_ROLES } = require('../middleware/auth');

router.get('/', requireAuth, curriculumController.getCurriculum);
router.post('/import', requireRole(ADMIN_ROLES), curriculumController.importCurriculum);
router.delete('/', requireRole(ADMIN_ROLES), curriculumController.clearCurriculum);

module.exports = router;
