'use strict';

const curriculumService = require('../services/curriculumService');

async function getCurriculum(req, res, next) {
    try {
        const result = await curriculumService.getCurriculum();
        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function importCurriculum(req, res, next) {
    try {
        const { subjects, mode } = req.body;
        const result = await curriculumService.importCurriculum(subjects, mode);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function clearCurriculum(req, res, next) {
    try {
        const result = await curriculumService.clearCurriculum();
        return res.status(result.status).json({ message: result.message });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getCurriculum,
    importCurriculum,
    clearCurriculum
};
