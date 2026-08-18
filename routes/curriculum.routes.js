'use strict';

const express = require('express');
const router = express.Router();
const curriculumController = require('../controllers/curriculum.controller');

router.get('/', curriculumController.getCurriculum);
router.post('/import', curriculumController.importCurriculum);
router.delete('/', curriculumController.clearCurriculum);

module.exports = router;
