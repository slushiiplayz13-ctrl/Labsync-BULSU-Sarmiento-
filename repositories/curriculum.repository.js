'use strict';

const db = require('../database/connection');

async function findAllCurriculum(executor = db) {
    return executor.query('SELECT * FROM curriculum ORDER BY Subject_Code ASC, Subject_Name ASC');
}

async function deleteAllCurriculum(executor = db) {
    return executor.query('DELETE FROM curriculum');
}

async function insertCurriculumItem(code, name, executor = db) {
    return executor.query(
        'INSERT INTO curriculum (Subject_Code, Subject_Name) VALUES (?, ?)',
        [code, name]
    );
}

module.exports = {
    findAllCurriculum,
    deleteAllCurriculum,
    insertCurriculumItem
};
