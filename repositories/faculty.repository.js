'use strict';

const db = require('../database/connection');

async function findByEmail(email, executor = db) {
    return executor.query('SELECT * FROM users WHERE Email = ?', [email]);
}

async function insertFaculty({ name, email, role, password, qrString }, executor = db) {
    return executor.query(
        'INSERT INTO users (Name, Email, Role, Password, ID_QR_String) VALUES (?, ?, ?, ?, ?)',
        [name, email, role || 'Faculty', password, qrString]
    );
}

async function findAllFaculty(executor = db) {
    return executor.query(
        'SELECT User_ID, Name, Email, Role, Profile_Photo, Phone FROM users WHERE Role IN ("Faculty", "IT Head", "IT Dept. Head", "IT Dept Head") ORDER BY Name'
    );
}

async function demoteAllHeadsToFaculty(executor = db) {
    return executor.query(
        'UPDATE users SET Role = "Faculty" WHERE Role IN ("IT Head", "IT Dept. Head", "IT Dept Head")'
    );
}

async function updateUserRole(userId, role, executor = db) {
    return executor.query('UPDATE users SET Role = ? WHERE User_ID = ?', [role, userId]);
}

async function findRoleById(userId, executor = db) {
    return executor.query('SELECT Role FROM users WHERE User_ID = ?', [userId]);
}

async function deleteById(userId, executor = db) {
    return executor.query('DELETE FROM users WHERE User_ID = ?', [userId]);
}

module.exports = {
    findByEmail,
    insertFaculty,
    findAllFaculty,
    demoteAllHeadsToFaculty,
    updateUserRole,
    findRoleById,
    deleteById
};
