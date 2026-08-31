'use strict';

const express = require('express');
const router = express.Router();
const curriculumController = require('../controllers/curriculum.controller');
const { requireAuth, requireRole, IT_HEAD_ROLES } = require('../middleware/auth');

router.get('/', requireAuth, curriculumController.getCurriculum);
router.post('/import', requireRole(IT_HEAD_ROLES), curriculumController.importCurriculum);
router.delete('/', requireRole(IT_HEAD_ROLES), curriculumController.clearCurriculum);

module.exports = router;
