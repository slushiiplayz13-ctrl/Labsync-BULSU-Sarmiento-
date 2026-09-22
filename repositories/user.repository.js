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
    if (!qrString || typeof qrString !== 'string') return [[]];
    let cleanStr = qrString.trim();
    if (!cleanStr) return [[]];

    // Remove matching surrounding quotes if sent by terminal or scanner JSON
    if ((cleanStr.startsWith('"') && cleanStr.endsWith('"')) ||
        (cleanStr.startsWith("'") && cleanStr.endsWith("'"))) {
        cleanStr = cleanStr.slice(1, -1).trim();
    }

    // Safe scanner envelope unwrapping if scanner encoded token in a URL query or JSON payload
    if (cleanStr.includes('qrString=')) {
        const match = cleanStr.match(/[?&]?qrString=([^&]+)/);
        if (match) {
            try {
                cleanStr = decodeURIComponent(match[1]).trim();
            } catch (e) {
                cleanStr = match[1].trim();
            }
        }
    } else if (cleanStr.startsWith('{') && cleanStr.endsWith('}')) {
        try {
            const parsed = JSON.parse(cleanStr);
            if (parsed && typeof parsed.qrString === 'string' && parsed.qrString.trim()) {
                cleanStr = parsed.qrString.trim();
            } else if (parsed && typeof parsed.token === 'string' && parsed.token.trim()) {
                cleanStr = parsed.token.trim();
            }
        } catch (e) {}
    }

    if (!cleanStr) return [[]];

    // 1. Exact matching on ID_QR_String
    const [exactUsers] = await executor.query(
        'SELECT User_ID, Name, Email, Role, ID_QR_String FROM users WHERE ID_QR_String = ?',
        [cleanStr]
    );
    if (exactUsers.length > 0) {
        return [exactUsers];
    }

    // 2. Prefix fallback for hardware serial truncation:
    // If the scanner string starts with LABSYNC- and has at least 18 characters (encompassing the unique 13-digit millisecond timestamp),
    // safely match if exactly one user matches this prefix.
    if (/^LABSYNC-(?:USER|OJT|FACULTY|MISSTAFF)-\d{10,}/i.test(cleanStr)) {
        const [prefixUsers] = await executor.query(
            'SELECT User_ID, Name, Email, Role, ID_QR_String FROM users WHERE ID_QR_String LIKE ?',
            [`${cleanStr}%`]
        );
        if (prefixUsers.length === 1) {
            console.log(`[User Repository] Resolved user "${prefixUsers[0].Name}" (${prefixUsers[0].Role}) via prefix match from scanned string: "${cleanStr}"`);
            return [prefixUsers];
        }
    } else if (/\d{12,}/.test(cleanStr) && cleanStr.length >= 15) {
        // 3. Substring fragment fallback if rapid scanning cleared the leading 'LABSYNC-' prefix but retains the unique millisecond timestamp
        const [subUsers] = await executor.query(
            'SELECT User_ID, Name, Email, Role, ID_QR_String FROM users WHERE ID_QR_String LIKE ?',
            [`%${cleanStr}%`]
        );
        if (subUsers.length === 1) {
            console.log(`[User Repository] Resolved user "${subUsers[0].Name}" (${subUsers[0].Role}) via timestamp fragment match from scanned string: "${cleanStr}"`);
            return [subUsers];
        }
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
