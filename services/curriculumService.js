'use strict';

const db = require('../db');

async function getCurriculum() {
    const [rows] = await db.query('SELECT * FROM curriculum ORDER BY Subject_Code ASC, Subject_Name ASC');
    return { status: 200, data: rows };
}

async function importCurriculum(subjects, mode) {
    if (!Array.isArray(subjects) || subjects.length === 0) {
        return { status: 400, error: 'No subject items provided.' };
    }

    if (mode !== 'append') {
        await db.query('DELETE FROM curriculum');
    }

    for (const s of subjects) {
        const code = (s.Subject_Code || s.code || '').toString().trim();
        const name = (s.Subject_Name || s.name || s.title || '').toString().trim();

        if (name) {
            await db.query(
                'INSERT INTO curriculum (Subject_Code, Subject_Name) VALUES (?, ?)',
                [code, name]
            );
        }
    }

    const [updatedRows] = await db.query('SELECT * FROM curriculum ORDER BY Subject_Code ASC, Subject_Name ASC');
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
    await db.query('DELETE FROM curriculum');
    return { status: 200, message: 'Curriculum cleared successfully.' };
}

module.exports = {
    getCurriculum,
    importCurriculum,
    clearCurriculum
};
