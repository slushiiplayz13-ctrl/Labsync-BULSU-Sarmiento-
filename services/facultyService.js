'use strict';

const bcrypt = require('bcrypt');
const { isValidEmailFormat, BCRYPT_SALT_ROUNDS } = require('./authService');
const { sendWelcomeEmail } = require('./emailService');
const facultyRepository = require('../repositories/faculty.repository');

async function addFaculty(reqBody) {
    const { name, email, role } = reqBody;

    // Validate Name Format
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
        return { status: 400, error: 'Faculty name is required (minimum 2 characters).' };
    }

    const trimmedName = name.trim().replace(/\s+/g, ' ');

    if (trimmedName.length > 60) {
        return { status: 400, error: 'Full name must not exceed 60 characters.' };
    }

    // Disallow numbers
    if (/\d/.test(trimmedName)) {
        return { status: 400, error: 'Numbers are not allowed in faculty names.' };
    }

    // Disallow forbidden symbols; only allow letters, spaces, hyphens, periods, apostrophes, and commas
    const nameRegex = /^[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF\s.',-]+$/;
    if (!nameRegex.test(trimmedName)) {
        return { status: 400, error: 'Special symbols are not allowed in faculty names.' };
    }

    // Check Duplicate Name (Case-insensitive)
    console.time('[Faculty] findByName');
    const [existingByName] = await facultyRepository.findByName(trimmedName);
    console.timeEnd('[Faculty] findByName');

    if (existingByName.length > 0) {
        return { status: 400, error: `A faculty member with the name "${trimmedName}" already exists. Please differentiate using a middle initial or suffix (e.g., Jr./Sr./III).` };
    }

    if (!email || !isValidEmailFormat(email)) {
        return { status: 400, error: 'Invalid email address. Please enter a valid email (e.g., user@domain.com).' };
    }

    console.time('[Faculty] findByEmail');
    const [existing] = await facultyRepository.findByEmail(email.trim().toLowerCase());
    console.timeEnd('[Faculty] findByEmail');

    if (existing.length > 0) {
        return { status: 400, error: 'Email already exists' };
    }

    const generatedPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase();
    const hashedPassword = await bcrypt.hash(generatedPassword, BCRYPT_SALT_ROUNDS || 12);
    const qrString = `LABSYNC-USER-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    console.time('[Faculty] insertFaculty');
    const [result] = await facultyRepository.insertFaculty({
        name: trimmedName,
        email,
        role,
        password: hashedPassword,
        qrString
    });
    console.timeEnd('[Faculty] insertFaculty');

    // Dispatch welcome email asynchronously so HTTP response is not blocked by SMTP networking
    sendWelcomeEmail(email, trimmedName, generatedPassword)
        .then(emailSent => {
            if (!emailSent) {
                console.warn(`[Faculty] Welcome email failed for ${email}; manual credential delivery required.`);
            } else {
                console.log(`[Faculty] Welcome email successfully delivered to ${email}`);
            }
        })
        .catch(err => {
            console.error(`[Faculty] Welcome email error for ${email}:`, err.message);
        });

    return {
        status: 200,
        data: {
            message: 'Faculty member added successfully',
            userId: result.insertId,
            email,
            emailSent: 'pending'
        }
    };
}

async function getAllFaculty() {
    const [faculty] = await facultyRepository.findAllFaculty();
    return { status: 200, data: faculty };
}

async function updateFacultyRole(userId, role, currentSessionUserId, session) {
    const parsedUserId = Number(userId);
    if (!Number.isInteger(parsedUserId) || parsedUserId <= 0) {
        return { status: 400, error: 'Invalid user ID. Must be a positive integer.' };
    }

    const ALLOWED_ROLES = ['IT Dept. Head', 'IT Head', 'MIS Staff', 'Faculty'];
    if (!role || typeof role !== 'string' || !ALLOWED_ROLES.includes(role)) {
        return { status: 400, error: `Invalid role: '${role}'. Allowed roles: ${ALLOWED_ROLES.join(', ')}.` };
    }

    if (role.toLowerCase().includes('head')) {
        await facultyRepository.withTransaction(async (connection) => {
            await facultyRepository.demoteAllHeadsToFaculty(connection);
            await facultyRepository.updateUserRole(parsedUserId, role, connection);

            if (currentSessionUserId && session) {
                const [currentRows] = await facultyRepository.findRoleById(currentSessionUserId, connection);
                if (currentRows.length > 0) {
                    session.userRole = currentRows[0].Role;
                }
            }
        });
    } else {
        await facultyRepository.updateUserRole(parsedUserId, role);
        if (currentSessionUserId && session && Number(currentSessionUserId) === parsedUserId) {
            session.userRole = role;
        }
    }

    const currentRole = session ? session.userRole : null;
    return { status: 200, message: 'Role updated successfully', currentRole };
}

async function deleteFaculty(userId) {
    const parsedUserId = Number(userId);
    if (!Number.isInteger(parsedUserId) || parsedUserId <= 0) {
        return { status: 400, error: 'Invalid user ID. Must be a positive integer.' };
    }

    await facultyRepository.deleteFacultyCascade(parsedUserId);
    return { status: 200, message: 'Faculty member removed successfully' };
}

module.exports = {
    addFaculty,
    getAllFaculty,
    updateFacultyRole,
    deleteFaculty
};
