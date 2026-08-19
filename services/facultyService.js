'use strict';

const db = require('../database/connection');
const { isValidEmailFormat } = require('./authService');
const { sendWelcomeEmail } = require('./emailService');
const facultyRepository = require('../repositories/faculty.repository');

async function addFaculty(reqBody) {
    const { name, email, role } = reqBody;

    if (!email || !isValidEmailFormat(email)) {
        return { status: 400, error: 'Invalid email address. Please enter a valid email (e.g., user@domain.com).' };
    }

    const [existing] = await facultyRepository.findByEmail(email);
    if (existing.length > 0) {
        return { status: 400, error: 'Email already exists' };
    }

    const generatedPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase();
    const qrString = `LABSYNC-USER-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    const [result] = await facultyRepository.insertFaculty({
        name,
        email,
        role,
        password: generatedPassword,
        qrString
    });

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
    const [faculty] = await facultyRepository.findAllFaculty();
    return { status: 200, data: faculty };
}

async function updateFacultyRole(userId, role, currentSessionUserId, session) {
    if (role && role.toLowerCase().includes('head')) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            await facultyRepository.demoteAllHeadsToFaculty(connection);
            await facultyRepository.updateUserRole(userId, role, connection);

            if (currentSessionUserId && session) {
                const [currentRows] = await facultyRepository.findRoleById(currentSessionUserId, connection);
                if (currentRows.length > 0) {
                    session.userRole = currentRows[0].Role;
                }
            }

            await connection.commit();
        } catch (err) {
            await connection.rollback();
            console.error('Error updating faculty role within transaction:', err);
            throw err;
        } finally {
            connection.release();
        }
    } else {
        await facultyRepository.updateUserRole(userId, role);
    }

    return { status: 200, message: 'Role updated successfully' };
}

async function deleteFaculty(userId) {
    await facultyRepository.deleteById(userId);
    return { status: 200, message: 'Faculty member removed successfully' };
}

module.exports = {
    addFaculty,
    getAllFaculty,
    updateFacultyRole,
    deleteFaculty
};
