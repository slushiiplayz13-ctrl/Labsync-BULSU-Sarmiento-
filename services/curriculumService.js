'use strict';

const curriculumRepository = require('../repositories/curriculum.repository');

async function getCurriculum() {
    const [rows] = await curriculumRepository.findAllCurriculum();
    return { status: 200, data: rows };
}

async function importCurriculum(subjects, mode) {
    if (!Array.isArray(subjects) || subjects.length === 0) {
        return { status: 400, error: 'No subject items provided.' };
    }

    await curriculumRepository.withTransaction(async (connection) => {
        if (mode !== 'append') {
            await curriculumRepository.deleteAllCurriculum(connection);
        }

        for (const s of subjects) {
            const code = (s.Subject_Code || s.code || '').toString().trim();
            const name = (s.Subject_Name || s.name || s.title || '').toString().trim();

            if (name) {
                await curriculumRepository.insertCurriculumItem(code, name, connection);
            }
        }
    });

    const [updatedRows] = await curriculumRepository.findAllCurriculum();
    return {
        status: 200,
        data: {
            message: 'Curriculum imported successfully.',
            count: updatedRows.length,
            curriculum: updatedRows
        }
    };
}

async function clearCurriculum() {
    await curriculumRepository.deleteAllCurriculum();
    return { status: 200, message: 'Curriculum cleared successfully.' };
}

module.exports = {
    getCurriculum,
    importCurriculum,
    clearCurriculum
};
