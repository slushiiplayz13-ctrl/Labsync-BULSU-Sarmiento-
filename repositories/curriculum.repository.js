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

async function getConnection() {
    return db.getConnection();
}

async function withTransaction(workFn) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const result = await workFn(connection);
        await connection.commit();
        return result;
    } catch (err) {
        await connection.rollback();
        console.error('Error executing transaction in curriculumRepository:', err);
        throw err;
    } finally {
        connection.release();
    }
}

module.exports = {
    findAllCurriculum,
    deleteAllCurriculum,
    insertCurriculumItem,
    getConnection,
    withTransaction
};

