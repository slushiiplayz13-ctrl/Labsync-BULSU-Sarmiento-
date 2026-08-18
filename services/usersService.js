'use strict';

const db = require('../db');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { isValidEmailFormat } = require('./authService');
const { sendEmailVerificationEmail } = require('./emailService');

async function getCurrentUser(userId) {
    if (!userId) {
        return { status: 401, error: 'Not authenticated' };
    }

    const [users] = await db.query(
        'SELECT User_ID, Name, Email, Role, Profile_Photo, Phone FROM users WHERE User_ID = ?',
        [userId]
    );

    if (users.length === 0) {
        return { status: 404, error: 'User not found' };
    }

    return {
        status: 200,
        user: {
            id: users[0].User_ID,
            name: users[0].Name,
            email: users[0].Email,
            role: users[0].Role,
            profilePhoto: users[0].Profile_Photo,
            phone: users[0].Phone
        }
    };
}

async function updateUserAccount(userId, reqBody, session) {
    if (!userId) {
        return { status: 401, error: 'Not authenticated' };
    }

    const { name, email, currentPassword, newPassword, profilePhoto, phone } = reqBody;

    const [users] = await db.query('SELECT * FROM users WHERE User_ID = ?', [userId]);
    if (users.length === 0) {
        return { status: 404, error: 'User not found' };
    }

    const user = users[0];

    if (user.Role === 'MIS Staff') {
        if ((email && email.trim().toLowerCase() !== user.Email.toLowerCase()) || (name && name.trim() !== user.Name)) {
            return { status: 403, error: 'Name and email modifications are restricted for shared MIS Staff accounts.' };
        }
    }

    let emailChangeRequested = false;
    if (email && email.trim().toLowerCase() !== user.Email.toLowerCase()) {
        const newEmailTrim = email.trim();
        if (!isValidEmailFormat(newEmailTrim)) {
            return { status: 400, error: 'Invalid email address format. Please enter a valid email (e.g., user@domain.com).' };
        }

        const [existingUsers] = await db.query('SELECT 1 FROM users WHERE Email = ? AND User_ID != ?', [newEmailTrim, userId]);
        if (existingUsers.length > 0) {
            return { status: 400, error: 'Email address is already in use' };
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 3600000);

        await db.query(
            'UPDATE users SET New_Email = ?, Email_Verify_Token = ?, Email_Verify_Token_Expiry = ? WHERE User_ID = ?',
            [newEmailTrim, token, expiry, userId]
        );

        const verificationLink = `${process.env.APP_URL || 'http://localhost:3000'}/api/user/verify-email?token=${token}`;
        await sendEmailVerificationEmail(newEmailTrim, name || user.Name, verificationLink);
        emailChangeRequested = true;
    }

    if (currentPassword && newPassword) {
        if (user.Password !== currentPassword) {
            return { status: 401, error: 'Current password is incorrect' };
        }

        if (profilePhoto !== undefined) {
            await db.query(
                'UPDATE users SET Name = ?, Password = ?, Profile_Photo = ?, Phone = ? WHERE User_ID = ?',
                [name, newPassword, profilePhoto, phone !== undefined ? phone : null, userId]
            );
        } else {
            await db.query(
                'UPDATE users SET Name = ?, Password = ?, Phone = ? WHERE User_ID = ?',
                [name, newPassword, phone !== undefined ? phone : null, userId]
            );
        }
    } else {
        if (profilePhoto !== undefined) {
            await db.query(
                'UPDATE users SET Name = ?, Profile_Photo = ?, Phone = ? WHERE User_ID = ?',
                [name, profilePhoto, phone !== undefined ? phone : null, userId]
            );
        } else {
            await db.query(
                'UPDATE users SET Name = ?, Phone = ? WHERE User_ID = ?',
                [name, phone !== undefined ? phone : null, userId]
            );
        }
    }

    if (session) {
        session.userName = name;
    }

    if (emailChangeRequested) {
        return { status: 200, message: 'Account settings updated. A verification link has been sent to your new email. Please verify it to complete the change.' };
    } else {
        return { status: 200, message: 'Account updated successfully' };
    }
}

async function verifyEmailToken(token, session) {
    if (!token) {
        return { status: 400, html: 'Verification token is missing.' };
    }

    const [users] = await db.query(
        'SELECT User_ID, Name, New_Email, Email_Verify_Token_Expiry FROM users WHERE Email_Verify_Token = ?',
        [token]
    );

    if (users.length === 0) {
        return {
            status: 400,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Invalid Token - LabSync</title>
                    <style>
                        body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; }
                        .card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); text-align: center; max-width: 400px; }
                        h1 { color: #ef4444; margin-top: 0; }
                        p { color: #475569; font-size: 15px; line-height: 1.6; }
                        .btn { display: inline-block; margin-top: 24px; padding: 12px 24px; background: #64748b; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1>Invalid Token</h1>
                        <p>This verification link is invalid or has already been used.</p>
                        <a href="/login.html" class="btn">Go to Login</a>
                    </div>
                </body>
                </html>
            `
        };
    }

    const user = users[0];
    const now = new Date();
    const expiry = new Date(user.Email_Verify_Token_Expiry);

    if (now > expiry) {
        return {
            status: 400,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Expired Link - LabSync</title>
                    <style>
                        body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; }
                        .card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); text-align: center; max-width: 400px; }
                        h1 { color: #f59e0b; margin-top: 0; }
                        p { color: #475569; font-size: 15px; line-height: 1.6; }
                        .btn { display: inline-block; margin-top: 24px; padding: 12px 24px; background: #64748b; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1>Link Expired</h1>
                        <p>This email verification link has expired (validity is 1 hour). Please log in and request a new change.</p>
                        <a href="/login.html" class="btn">Go to Login</a>
                    </div>
                </body>
                </html>
            `
        };
    }

    const newEmail = user.New_Email;
    await db.query(
        'UPDATE users SET Email = ?, New_Email = NULL, Email_Verify_Token = NULL, Email_Verify_Token_Expiry = NULL WHERE User_ID = ?',
        [newEmail, user.User_ID]
    );

    if (session && session.userId === user.User_ID) {
        session.userEmail = newEmail;
    }

    return {
        status: 200,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Email Verified - LabSync</title>
                <style>
                    body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; }
                    .card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); text-align: center; max-width: 400px; }
                    h1 { color: #1ebbd7; margin-top: 0; }
                    p { color: #475569; font-size: 15px; line-height: 1.6; }
                    .btn { display: inline-block; margin-top: 24px; padding: 12px 24px; background: #1ebbd7; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>Email Verified!</h1>
                    <p>Your email address has been successfully verified. You can now use <strong>${newEmail}</strong> to log in.</p>
                    <a href="/login.html" class="btn">Go to Login</a>
                </div>
            </body>
            </html>
        `
    };
}

async function getUserQRCode(userId) {
    if (!userId) {
        return { status: 401, error: 'Not authenticated' };
    }

    const [users] = await db.query(
        'SELECT User_ID, Name, Email, Role, ID_QR_String FROM users WHERE User_ID = ?',
        [userId]
    );

    if (users.length === 0) {
        return { status: 404, error: 'User not found' };
    }

    const user = users[0];
    if (!user.ID_QR_String) {
        const qrString = `LABSYNC-USER-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        await db.query('UPDATE users SET ID_QR_String = ? WHERE User_ID = ?', [qrString, user.User_ID]);
        user.ID_QR_String = qrString;
    }

    const qrCodeDataURL = await QRCode.toDataURL(user.ID_QR_String, {
        width: 300,
        margin: 2,
        color: { dark: '#1EBBD7', light: '#FFFFFF' }
    });

    return {
        status: 200,
        data: {
            qrCode: qrCodeDataURL,
            qrString: user.ID_QR_String,
            user: {
                id: user.User_ID,
                name: user.Name,
                email: user.Email,
                role: user.Role
            }
        }
    };
}

async function scanQRCode(qrString) {
    const [users] = await db.query(
        'SELECT User_ID, Name, Email, Role FROM users WHERE ID_QR_String = ?',
        [qrString]
    );

    if (users.length === 0) {
        return { status: 404, error: 'User not found' };
    }

    const user = users[0];
    return {
        status: 200,
        data: {
            user: {
                id: user.User_ID,
                name: user.Name,
                email: user.Email,
                role: user.Role
            }
        }
    };
}

module.exports = {
    getCurrentUser,
    updateUserAccount,
    verifyEmailToken,
    getUserQRCode,
    scanQRCode
};
