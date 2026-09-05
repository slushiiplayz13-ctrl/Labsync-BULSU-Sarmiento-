'use strict';

const db = require('../database/connection');

async function findByEmail(email, executor = db) {
    return executor.query('SELECT * FROM users WHERE Email = ?', [email]);
}

async function findBasicByEmail(email, executor = db) {
    return executor.query('SELECT User_ID, Name, Email FROM users WHERE Email = ?', [email]);
}

async function findById(userId, executor = db) {
    return executor.query(
        'SELECT User_ID, Name, Email, Role, Profile_Photo, Phone, Has_Completed_Tutorial, Updated_At FROM users WHERE User_ID = ?',
        [userId]
    );
}

async function findFullById(userId, executor = db) {
    return executor.query('SELECT * FROM users WHERE User_ID = ?', [userId]);
}

async function findByEmailExceptId(email, userId, executor = db) {
    return executor.query('SELECT 1 FROM users WHERE Email = ? AND User_ID != ?', [email, userId]);
}

async function updateResetToken(userId, token, expiry, executor = db) {
    return executor.query(
        'UPDATE users SET Reset_Token = ?, Reset_Token_Expiry = ? WHERE User_ID = ?',
        [token, expiry, userId]
    );
}

async function findByResetToken(token, executor = db) {
    return executor.query(
        'SELECT User_ID, Email, Role FROM users WHERE Reset_Token = ? AND Reset_Token_Expiry > NOW()',
        [token]
    );
}

async function updatePasswordReset(userId, password, executor = db) {
    return executor.query(
        'UPDATE users SET Password = ?, Reset_Token = NULL, Reset_Token_Expiry = NULL WHERE User_ID = ?',
        [password, userId]
    );
}

async function updateEmailVerificationToken(userId, newEmail, token, expiry, executor = db) {
    return executor.query(
        'UPDATE users SET New_Email = ?, Email_Verify_Token = ?, Email_Verify_Token_Expiry = ? WHERE User_ID = ?',
        [newEmail, token, expiry, userId]
    );
}

async function findByEmailVerifyToken(token, executor = db) {
    return executor.query(
        'SELECT User_ID, Name, New_Email, Email_Verify_Token_Expiry FROM users WHERE Email_Verify_Token = ?',
        [token]
    );
}

async function applyVerifiedEmail(userId, newEmail, executor = db) {
    return executor.query(
        'UPDATE users SET Email = ?, New_Email = NULL, Email_Verify_Token = NULL, Email_Verify_Token_Expiry = NULL WHERE User_ID = ?',
        [newEmail, userId]
    );
}

async function updateUserProfile(userId, { name, password, profilePhoto, phone } = {}, executor = db) {
    const fields = [];
    const values = [];

    if (name !== undefined && name !== null) {
        fields.push('Name = ?');
        values.push(name);
    }
    if (password !== undefined && password !== null) {
        fields.push('Password = ?');
        values.push(password);
    }
    if (profilePhoto !== undefined) {
        fields.push('Profile_Photo = ?');
        values.push(profilePhoto);
    }
    if (phone !== undefined) {
        fields.push('Phone = ?');
        values.push(phone);
    }

    if (fields.length === 0) {
        return [{ affectedRows: 0, changedRows: 0 }];
    }

    fields.push('Updated_At = NOW()');

    values.push(userId);
    return executor.query(
        `UPDATE users SET ${fields.join(', ')} WHERE User_ID = ?`,
        values
    );
}

async function findUserQR(userId, executor = db) {
    return executor.query(
        'SELECT User_ID, Name, Email, Role, ID_QR_String FROM users WHERE User_ID = ?',
        [userId]
    );
}

async function updateUserQR(userId, qrString, executor = db) {
    return executor.query('UPDATE users SET ID_QR_String = ? WHERE User_ID = ?', [qrString, userId]);
}

async function findByQRString(qrString, executor = db) {
    if (!qrString) return [[]];
    const cleanStr = String(qrString).trim();

    // 1. Try exact match, FIND_IN_SET, or LIKE on ID_QR_String
    let [users] = await executor.query(
        'SELECT User_ID, Name, Email, Role, ID_QR_String FROM users WHERE ID_QR_String = ? OR FIND_IN_SET(?, ID_QR_String) > 0 OR ID_QR_String LIKE ?',
        [cleanStr, cleanStr, `%${cleanStr}%`]
    );
    if (users.length > 0) return [users];

    // 2. Try match on Email or User_ID
    [users] = await executor.query(
        'SELECT User_ID, Name, Email, Role, ID_QR_String FROM users WHERE Email = ? OR User_ID = ?',
        [cleanStr, cleanStr]
    );
    if (users.length > 0) return [users];

    // 3. Fallback: URL decoding or JSON token extraction
    let extractedToken = cleanStr;
    if (cleanStr.includes('qrString=')) {
        const match = cleanStr.match(/qrString=([^&]+)/);
        if (match) extractedToken = decodeURIComponent(match[1]);
    } else if (cleanStr.startsWith('{') && cleanStr.endsWith('}')) {
        try {
            const parsed = JSON.parse(cleanStr);
            extractedToken = parsed.qrString || parsed.id || parsed.email || cleanStr;
        } catch (e) {}
    }

    if (extractedToken !== cleanStr) {
        return executor.query(
            'SELECT User_ID, Name, Email, Role, ID_QR_String FROM users WHERE ID_QR_String = ? OR FIND_IN_SET(?, ID_QR_String) > 0 OR ID_QR_String LIKE ? OR Email = ? OR User_ID = ?',
            [extractedToken, extractedToken, `%${extractedToken}%`, extractedToken, extractedToken]
        );
    }

    return [[]];
}

async function getRoleById(userId, executor = db) {
    return executor.query('SELECT Role FROM users WHERE User_ID = ?', [userId]);
}

async function updateTutorialStatus(userId, completed, executor = db) {
    const statusVal = completed ? 1 : 0;
    return executor.query('UPDATE users SET Has_Completed_Tutorial = ? WHERE User_ID = ?', [statusVal, userId]);
}

async function updatePasswordOnly(userId, passwordHash, executor = db) {
    return executor.query('UPDATE users SET Password = ?, Updated_At = NOW() WHERE User_ID = ?', [passwordHash, userId]);
}

async function findByNameExcludingUser(name, userId, executor = db) {
    if (!name) return [[]];
    const cleanName = String(name).trim().replace(/\s+/g, ' ');
    return executor.query(
        "SELECT User_ID, Name, Email FROM users WHERE LOWER(REGEXP_REPLACE(TRIM(Name), '[[:space:]]+', ' ')) = LOWER(?) AND User_ID != ?",
        [cleanName, userId]
    );
}

module.exports = {
    findByEmail,
    findBasicByEmail,
    findById,
    findFullById,
    findByEmailExceptId,
    findByNameExcludingUser,
    updateResetToken,
    findByResetToken,
    updatePasswordReset,
    updatePasswordOnly,
    updateEmailVerificationToken,
    findByEmailVerifyToken,
    applyVerifiedEmail,
    updateUserProfile,
    findUserQR,
    updateUserQR,
    findByQRString,
    getRoleById,
    updateTutorialStatus
};
