'use strict';

const db = require('../db');
const { isValidEmailFormat } = require('./authService');
const { sendWelcomeEmail } = require('./emailService');

async function addFaculty(reqBody) {
    const { name, email, role } = reqBody;

    if (!email || !isValidEmailFormat(email)) {
        return { status: 400, error: 'Invalid email address. Please enter a valid email (e.g., user@domain.com).' };
    }

    const [existing] = await db.query('SELECT * FROM users WHERE Email = ?', [email]);
    if (existing.length > 0) {
        return { status: 400, error: 'Email already exists' };
    }

    const generatedPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase();
    const qrString = `LABSYNC-USER-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    const [result] = await db.query(
        'INSERT INTO users (Name, Email, Role, Password, ID_QR_String) VALUES (?, ?, ?, ?, ?)',
        [name, email, role || 'Faculty', generatedPassword, qrString]
    );

    const emailSent = await sendWelcomeEmail(email, name, generatedPassword);

    if (!emailSent) {
        console.log(`Warning: Email failed to send to ${email}`);
        console.log(`Manual credentials - Email: ${email}, Password: ${generatedPassword}`);
    }

    return {
        status: 200,
        data: {
            message: 'Faculty member added successfully',
            userId: result.insertId,
            email,
            emailSent
        }
    };
}

async function getAllFaculty() {
    const [faculty] = await db.query(
        'SELECT User_ID, Name, Email, Role, Profile_Photo, Phone FROM users WHERE Role IN ("Faculty", "IT Head", "IT Dept. Head", "IT Dept Head") ORDER BY Name'
    );
    return { status: 200, data: faculty };
}

async function updateFacultyRole(userId, role, currentSessionUserId, session) {
    if (role && role.toLowerCase().includes('head')) {
        await db.query(
            'UPDATE users SET Role = "Faculty" WHERE Role IN ("IT Head", "IT Dept. Head", "IT Dept Head")'
        );

        await db.query('UPDATE users SET Role = ? WHERE User_ID = ?', [role, userId]);

        if (currentSessionUserId && session) {
            const [currentRows] = await db.query('SELECT Role FROM users WHERE User_ID = ?', [currentSessionUserId]);
            if (currentRows.length > 0) {
                session.userRole = currentRows[0].Role;
            }
        }
    } else {
        await db.query('UPDATE users SET Role = ? WHERE User_ID = ?', [role, userId]);
    }

    return { status: 200, message: 'Role updated successfully' };
}

async function deleteFaculty(userId) {
    await db.query('DELETE FROM users WHERE User_ID = ?', [userId]);
    return { status: 200, message: 'Faculty member removed successfully' };
}

module.exports = {
    addFaculty,
    getAllFaculty,
    updateFacultyRole,
    deleteFaculty
};
