const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const session = require('express-session');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const crypto = require('crypto');
const db = require('./db');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Add Reset_Token and Reset_Token_Expiry to users table if they don't exist
async function initializeDatabase() {
    try {
        try {
            await db.query('ALTER TABLE users ADD COLUMN Reset_Token VARCHAR(255) NULL');
            console.log('Added Reset_Token column to users table.');
        } catch (err) {
            if (err.code !== 'ER_DUP_FIELDNAME') {
                console.error('Error adding Reset_Token column:', err);
            }
        }

        try {
            await db.query('ALTER TABLE users ADD COLUMN Reset_Token_Expiry DATETIME NULL');
            console.log('Added Reset_Token_Expiry column to users table.');
        } catch (err) {
            if (err.code !== 'ER_DUP_FIELDNAME') {
                console.error('Error adding Reset_Token_Expiry column:', err);
            }
        }

        // Drop Capacity column from laboratories table
        try {
            await db.query('ALTER TABLE laboratories DROP COLUMN Capacity');
            console.log('Dropped Capacity column from laboratories table.');
        } catch (err) {
            if (err.errno !== 1091 && err.code !== 'ER_CANT_DROP_FIELD_OR_KEY') {
                console.error('Error dropping Capacity column:', err);
            }
        }

        try {
            await db.query('ALTER TABLE users ADD COLUMN Profile_Photo LONGTEXT NULL');
            console.log('Added Profile_Photo column to users table.');
        } catch (err) {
            if (err.code !== 'ER_DUP_FIELDNAME') {
                console.error('Error adding Profile_Photo column:', err);
            }
        }

        try {
            await db.query('ALTER TABLE users ADD COLUMN New_Email VARCHAR(255) NULL');
            console.log('Added New_Email column to users table.');
        } catch (err) {
            if (err.code !== 'ER_DUP_FIELDNAME') {
                console.error('Error adding New_Email column:', err);
            }
        }

        try {
            await db.query('ALTER TABLE users ADD COLUMN Email_Verify_Token VARCHAR(255) NULL');
            console.log('Added Email_Verify_Token column to users table.');
        } catch (err) {
            if (err.code !== 'ER_DUP_FIELDNAME') {
                console.error('Error adding Email_Verify_Token column:', err);
            }
        }

        try {
            await db.query('ALTER TABLE users ADD COLUMN Email_Verify_Token_Expiry DATETIME NULL');
            console.log('Added Email_Verify_Token_Expiry column to users table.');
        } catch (err) {
            if (err.code !== 'ER_DUP_FIELDNAME') {
                console.error('Error adding Email_Verify_Token_Expiry column:', err);
            }
        }

        try {
            await db.query('ALTER TABLE users ADD COLUMN Phone VARCHAR(20) NULL');
            console.log('Added Phone column to users table.');
        } catch (err) {
            if (err.code !== 'ER_DUP_FIELDNAME') {
                console.error('Error adding Phone column:', err);
            }
        }

        try {
            await db.query('ALTER TABLE schedules ADD COLUMN Color_Theme VARCHAR(50) NULL');
            console.log('Added Color_Theme column to schedules table.');
        } catch (err) {
            if (err.code !== 'ER_DUP_FIELDNAME') {
                console.error('Error adding Color_Theme column to schedules:', err);
            }
        }

        try {
            await db.query("ALTER TABLE laboratories ADD COLUMN Key_Status VARCHAR(20) DEFAULT 'Present'");
            console.log('Added Key_Status column to laboratories table.');
        } catch (err) {
            if (err.code !== 'ER_DUP_FIELDNAME') {
                console.error('Error adding Key_Status column to laboratories:', err);
            }
        }

        // Initialize system_settings table
        try {
            await db.query(`
                CREATE TABLE IF NOT EXISTS system_settings (
                    Setting_Key VARCHAR(50) PRIMARY KEY,
                    Setting_Value VARCHAR(255) NOT NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
            `);
            console.log('Created system_settings table (if not exists).');

            // Insert defaults if empty
            const [rows] = await db.query('SELECT COUNT(*) as count FROM system_settings');
            if (rows[0].count === 0) {
                await db.query(`
                    INSERT INTO system_settings (Setting_Key, Setting_Value) VALUES
                    ('program_chair', 'ELENITA T. CAPARIÑO'),
                    ('campus_dean', 'DR. MARICEL BALIGOD')
                `);
                console.log('Seeded default values into system_settings.');
            }
        } catch (err) {
            console.error('Error initializing system_settings table:', err);
        }
    } catch (err) {
        console.error('Database initialization failed:', err);
    }
}
initializeDatabase();

// Helper function to validate email format and TLD
function isValidEmailFormat(email) {
    if (!email || typeof email !== 'string') return false;
    const cleanEmail = email.trim().toLowerCase();
    
    // Basic structural check
    const basicRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}$/;
    if (!basicRegex.test(cleanEmail)) return false;
    
    // Prevent double dots or dot right next to @
    if (cleanEmail.includes('..') || cleanEmail.includes('@.') || cleanEmail.includes('.@')) return false;

    const parts = cleanEmail.split('@');
    if (parts.length !== 2) return false;
    const domainParts = parts[1].split('.');
    if (domainParts.length < 2) return false;

    const fullTld = domainParts.slice(1).join('.');
    const mainTld = domainParts[domainParts.length - 1];

    const validTLDs = new Set([
        'com', 'org', 'net', 'edu', 'gov', 'mil', 'io', 'co', 'info', 'biz', 'me', 'tv', 'xyz', 'online', 'site', 'store', 'tech', 'app', 'dev',
        'ph', 'edu.ph', 'com.ph', 'gov.ph', 'org.ph', 'net.ph',
        'us', 'uk', 'ca', 'au', 'jp', 'cn', 'in', 'de', 'fr', 'br', 'ru', 'sg', 'my'
    ]);

    return validTLDs.has(fullTld) || validTLDs.has(mainTld);
}

// Email transporter configuration
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Function to send email
async function sendWelcomeEmail(recipientEmail, recipientName, password) {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: recipientEmail,
        subject: 'Welcome to LabSync - Your Account Credentials',
        html: `
            <div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; padding: 40px 20px; line-height: 1.6;">
                <div style="max-width: 540px; margin: 0 auto; background-color: #FFFFFF; border-radius: 20px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.03);">
                    
                    <!-- Header -->
                    <div style="padding: 32px 40px; background: linear-gradient(135deg, #FAFAFA 0%, #F4F5F7 100%); border-bottom: 1px solid #E2E8F0; text-align: center;">
                        <img src="cid:labsync-logo" alt="LabSync Logo" style="height: 52px; display: block; margin: 0 auto;">
                    </div>

                    <!-- Body -->
                    <div style="padding: 40px;">
                        <h2 style="margin-top: 0; margin-bottom: 24px; font-size: 20px; font-weight: 700; color: #0F172A; text-align: center; letter-spacing: -0.3px;">Welcome to LabSync!</h2>
                        
                        <p style="margin-top: 0; margin-bottom: 20px; font-size: 15px; color: #334155;">Hello <strong>${recipientName}</strong>,</p>
                        
                        <p style="margin-top: 0; margin-bottom: 24px; font-size: 14.5px; color: #475569; line-height: 1.6;">
                            Your faculty account has been created successfully. Below are your temporary login credentials:
                        </p>
                        
                        <!-- Credentials Block -->
                        <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; padding: 24px; border-radius: 12px; margin-bottom: 24px;">
                            <div style="margin-bottom: 14px;">
                                <div style="font-size: 12px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Email Address</div>
                                <div style="font-family: 'Consolas', 'Courier New', monospace; font-size: 15px; font-weight: 700; color: #0F172A; background-color: #FFFFFF; border: 1px solid #E2E8F0; padding: 8px 12px; border-radius: 8px; word-break: break-all;">${recipientEmail}</div>
                            </div>
                            <div>
                                <div style="font-size: 12px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Temporary Password</div>
                                <div style="font-family: 'Consolas', 'Courier New', monospace; font-size: 15px; font-weight: 700; color: #0F172A; background-color: #FFFFFF; border: 1px solid #E2E8F0; padding: 8px 12px; border-radius: 8px; word-break: break-all;">${password}</div>
                            </div>
                        </div>

                        <!-- Warning Callout -->
                        <div style="background-color: #FFFBEB; border-left: 4px solid #F59E0B; padding: 16px; border-radius: 8px; margin-bottom: 28px; font-size: 13.5px; color: #B45309; line-height: 1.5;">
                            <strong style="color: #92400E; display: block; margin-bottom: 4px;">⚠️ Action Required</strong>
                            For security reasons, you are required to change this password immediately after your first sign-in.
                        </div>

                        <!-- CTA -->
                        <div style="text-align: center; margin: 32px 0;">
                            <a href="${process.env.APP_URL || 'http://localhost:3000'}/login.html" style="background-color: #1EBBD7; color: #FFFFFF; text-decoration: none; padding: 14px 28px; font-size: 14.5px; font-weight: 700; border-radius: 8px; display: inline-block; box-shadow: 0 4px 14px rgba(30, 187, 215, 0.3);">Access Your Account</a>
                        </div>
                        
                        <hr style="border: 0; border-top: 1px solid #F1F5F9; margin: 32px 0;">
                        
                        <p style="margin-bottom: 0; font-size: 14px; color: #64748B;">
                            Best regards,<br>
                            <strong style="color: #0F172A;">LabSync Team</strong>
                        </p>
                    </div>

                    <!-- Footer -->
                    <div style="padding: 24px 40px; background-color: #F8FAFC; border-top: 1px solid #E2E8F0; text-align: center; font-size: 12px; color: #94A3B8; font-weight: 500;">
                        <p style="margin: 0 0 6px 0;">Bulacan State University — Sarmiento Campus</p>
                        <p style="margin: 0;">© 2026 LabSync. All rights reserved.</p>
                    </div>
                </div>
            </div>
        `,
        attachments: [{
            filename: 'labsync-logo.png',
            path: './assets/labsync-logo.png',
            cid: 'labsync-logo'
        }]
    };

    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Email sending failed:', error);
        return false;
    }
}

// Function to send password recovery email
async function sendResetPasswordEmail(recipientEmail, recipientName, resetLink) {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: recipientEmail,
        subject: 'Reset Your LabSync Password',
        html: `
            <div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; padding: 40px 20px; line-height: 1.6;">
                <div style="max-width: 540px; margin: 0 auto; background-color: #FFFFFF; border-radius: 20px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.03);">
                    
                    <!-- Header -->
                    <div style="padding: 32px 40px; background: linear-gradient(135deg, #FAFAFA 0%, #F4F5F7 100%); border-bottom: 1px solid #E2E8F0; text-align: center;">
                        <img src="cid:labsync-logo" alt="LabSync Logo" style="height: 52px; display: block; margin: 0 auto;">
                    </div>

                    <!-- Body -->
                    <div style="padding: 40px;">
                        <h2 style="margin-top: 0; margin-bottom: 24px; font-size: 20px; font-weight: 700; color: #0F172A; text-align: center; letter-spacing: -0.3px;">Reset Your Password</h2>
                        
                        <p style="margin-top: 0; margin-bottom: 20px; font-size: 15px; color: #334155;">Hello <strong>${recipientName}</strong>,</p>
                        
                        <p style="margin-top: 0; margin-bottom: 24px; font-size: 14.5px; color: #475569; line-height: 1.6;">
                            We received a request to reset the password for your LabSync account. Click the button below to set a new password:
                        </p>
                        
                        <!-- CTA -->
                        <div style="text-align: center; margin: 32px 0;">
                            <a href="${resetLink}" style="background-color: #1EBBD7; color: #FFFFFF; text-decoration: none; padding: 14px 28px; font-size: 14.5px; font-weight: 700; border-radius: 8px; display: inline-block; box-shadow: 0 4px 14px rgba(30, 187, 215, 0.3);">Reset Password</a>
                        </div>

                        <!-- Expiry Warning -->
                        <div style="background-color: #FFFBEB; border-left: 4px solid #F59E0B; padding: 16px; border-radius: 8px; margin-bottom: 28px; font-size: 13.5px; color: #B45309; line-height: 1.5;">
                            <strong style="color: #92400E; display: block; margin-bottom: 4px;">🕒 Link Expiration</strong>
                            This reset link is valid for <strong>1 hour</strong>. If you did not request a password reset, you can safely ignore this email.
                        </div>

                        <!-- Fallback Url -->
                        <div style="font-size: 12px; color: #94A3B8; word-break: break-all; background-color: #F8FAFC; border: 1px solid #E2E8F0; padding: 12px; border-radius: 8px;">
                            If you're having trouble clicking the button, copy and paste this link in your browser:<br>
                            <a href="${resetLink}" style="color: #1EBBD7; text-decoration: underline;">${resetLink}</a>
                        </div>
                        
                        <hr style="border: 0; border-top: 1px solid #F1F5F9; margin: 32px 0;">
                        
                        <p style="margin-bottom: 0; font-size: 14px; color: #64748B;">
                            Best regards,<br>
                            <strong style="color: #0F172A;">LabSync Team</strong>
                        </p>
                    </div>

                    <!-- Footer -->
                    <div style="padding: 24px 40px; background-color: #F8FAFC; border-top: 1px solid #E2E8F0; text-align: center; font-size: 12px; color: #94A3B8; font-weight: 500;">
                        <p style="margin: 0 0 6px 0;">Bulacan State University — Sarmiento Campus</p>
                        <p style="margin: 0;">© 2026 LabSync. All rights reserved.</p>
                    </div>
                </div>
            </div>
        `,
        attachments: [{
            filename: 'labsync-logo.png',
            path: './assets/labsync-logo.png',
            cid: 'labsync-logo'
        }]
    };

    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Email sending failed:', error);
        return false;
    }
}

// Function to send email verification link for email change
async function sendEmailVerificationEmail(recipientEmail, recipientName, verificationLink) {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: recipientEmail,
        subject: 'Verify Your New LabSync Email Address',
        html: `
            <div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; padding: 40px 20px; line-height: 1.6;">
                <div style="max-width: 540px; margin: 0 auto; background-color: #FFFFFF; border-radius: 20px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.03);">
                    
                    <!-- Header -->
                    <div style="padding: 32px 40px; background: linear-gradient(135deg, #FAFAFA 0%, #F4F5F7 100%); border-bottom: 1px solid #E2E8F0; text-align: center;">
                        <img src="cid:labsync-logo" alt="LabSync Logo" style="height: 52px; display: block; margin: 0 auto;">
                    </div>

                    <!-- Body -->
                    <div style="padding: 40px;">
                        <h2 style="margin-top: 0; margin-bottom: 24px; font-size: 20px; font-weight: 700; color: #0F172A; text-align: center; letter-spacing: -0.3px;">Verify Your New Email Address</h2>
                        
                        <p style="margin-top: 0; margin-bottom: 20px; font-size: 15px; color: #334155;">Hello <strong>${recipientName}</strong>,</p>
                        
                        <p style="margin-top: 0; margin-bottom: 24px; font-size: 14.5px; color: #475569; line-height: 1.6;">
                            We received a request to change your LabSync account email to this address. Click the button below to verify and complete this change:
                        </p>
                        
                        <!-- CTA -->
                        <div style="text-align: center; margin: 32px 0;">
                            <a href="${verificationLink}" style="background-color: #1EBBD7; color: #FFFFFF; text-decoration: none; padding: 14px 28px; font-size: 14.5px; font-weight: 700; border-radius: 8px; display: inline-block; box-shadow: 0 4px 14px rgba(30, 187, 215, 0.3);">Verify Email Address</a>
                        </div>

                        <!-- Expiry Warning -->
                        <div style="background-color: #FFFBEB; border-left: 4px solid #F59E0B; padding: 16px; border-radius: 8px; margin-bottom: 28px; font-size: 13.5px; color: #B45309; line-height: 1.5;">
                            <strong style="color: #92400E; display: block; margin-bottom: 4px;">🕒 Link Expiration</strong>
                            This verification link is valid for <strong>1 hour</strong>. If you did not request this, your current active email will remain unchanged.
                        </div>

                        <!-- Fallback Url -->
                        <div style="font-size: 12px; color: #94A3B8; word-break: break-all; background-color: #F8FAFC; border: 1px solid #E2E8F0; padding: 12px; border-radius: 8px;">
                            If you're having trouble clicking the button, copy and paste this link in your browser:<br>
                            <a href="${verificationLink}" style="color: #1EBBD7; text-decoration: underline;">${verificationLink}</a>
                        </div>
                        
                        <hr style="border: 0; border-top: 1px solid #F1F5F9; margin: 32px 0;">
                        
                        <p style="margin-bottom: 0; font-size: 14px; color: #64748B;">
                            Best regards,<br>
                            <strong style="color: #0F172A;">LabSync Team</strong>
                        </p>
                    </div>

                    <!-- Footer -->
                    <div style="padding: 24px 40px; background-color: #F8FAFC; border-top: 1px solid #E2E8F0; text-align: center; font-size: 12px; color: #94A3B8; font-weight: 500;">
                        <p style="margin: 0 0 6px 0;">Bulacan State University — Sarmiento Campus</p>
                        <p style="margin: 0;">© 2026 LabSync. All rights reserved.</p>
                    </div>
                </div>
            </div>
        `,
        attachments: [{
            filename: 'labsync-logo.png',
            path: './assets/labsync-logo.png',
            cid: 'labsync-logo'
        }]
    };
    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Email verification sending failed:', error);
        return false;
    }
}

// Trust proxy for secure cookies behind reverse proxies (like Ngrok, Heroku, Render, Nginx)
app.set('trust proxy', 1);

// Middleware
app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (mobile/curl), localhost, ngrok tunnels, or matching APP_URL
        if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('ngrok') || (process.env.APP_URL && origin === process.env.APP_URL)) {
            callback(null, true);
        } else {
            callback(null, true);
        }
    },
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'labsync-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set false so HTTP/HTTPS over ngrok works smoothly without dropping cookies
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Authentication middleware
function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
}

// Serve static files from the frontend
app.use(express.static('./'));

// Basic test route
app.get('/api/test', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT 1 + 1 AS result');
        res.json({ message: 'Database connected successfully', result: rows[0].result });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database connection failed' });
    }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.clearCookie('connect.sid');
        res.json({ message: 'Logged out successfully' });
    });
});

// Check authentication status
app.get('/api/auth/check', (req, res) => {
    if (req.session.userId) {
        res.json({ authenticated: true, userId: req.session.userId });
    } else {
        res.json({ authenticated: false });
    }
});

// GET all system settings (authenticated users only)
app.get('/api/settings', requireAuth, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT Setting_Key, Setting_Value FROM system_settings');
        // Convert to key-value object
        const settings = {};
        rows.forEach(row => {
            settings[row.Setting_Key] = row.Setting_Value;
        });
        res.json(settings);
    } catch (err) {
        console.error('Error fetching system settings:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST update system settings (Admin / Dept Head privilege)
app.post('/api/settings', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId;
        let role = req.session.userRole;
        if (!role) {
            const [users] = await db.query('SELECT Role FROM users WHERE User_ID = ?', [userId]);
            if (users.length > 0) {
                role = users[0].Role;
            }
        }

        // Only allow IT Heads or MIS Staff to modify system settings
        const isAuthorized = role && (role.toLowerCase().includes('head') || role === 'MIS Staff');
        if (!isAuthorized) {
            return res.status(403).json({ error: 'Privilege required: Only administrators can modify system settings.' });
        }

        const settings = req.body; // e.g. { program_chair: '...', campus_dean: '...' }
        
        for (const [key, value] of Object.entries(settings)) {
            await db.query(`
                INSERT INTO system_settings (Setting_Key, Setting_Value) 
                VALUES (?, ?) 
                ON DUPLICATE KEY UPDATE Setting_Value = ?
            `, [key, value, value]);
        }

        res.json({ message: 'System settings updated successfully.' });
    } catch (err) {
        console.error('Error updating system settings:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Password recovery endpoints
app.post('/api/auth/recover-password', async (req, res) => {
    const { email } = req.body;
    if (!email || !isValidEmailFormat(email)) {
        return res.status(400).json({ error: 'Please enter a valid email address (e.g., user@domain.com).' });
    }

    try {
        const [users] = await db.query('SELECT User_ID, Name, Email FROM users WHERE Email = ?', [email]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'No account found with this email address.' });
        }

        const user = users[0];
        const token = crypto.randomBytes(32).toString('hex');
        
        // Expiry in 1 hour
        const expiry = new Date();
        expiry.setHours(expiry.getHours() + 1);

        // Update user record with token and expiration
        await db.query(
            'UPDATE users SET Reset_Token = ?, Reset_Token_Expiry = ? WHERE User_ID = ?',
            [token, expiry, user.User_ID]
        );

        const resetLink = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password.html?token=${token}`;
        const emailSent = await sendResetPasswordEmail(user.Email, user.Name, resetLink);

        if (!emailSent) {
            return res.status(500).json({ error: 'Failed to send recovery email. Please try again later.' });
        }

        res.json({ message: 'Password recovery email sent. Please check your inbox.' });
    } catch (err) {
        console.error('Recover password error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/auth/validate-reset-token', async (req, res) => {
    const { token } = req.query;
    if (!token) {
        return res.status(400).json({ valid: false, error: 'Token is required.' });
    }

    try {
        const [users] = await db.query(
            'SELECT User_ID FROM users WHERE Reset_Token = ? AND Reset_Token_Expiry > NOW()',
            [token]
        );

        if (users.length === 0) {
            return res.status(400).json({ valid: false, error: 'Reset link is invalid or has expired.' });
        }

        res.json({ valid: true });
    } catch (err) {
        console.error('Validate reset token error:', err);
        res.status(500).json({ valid: false, error: 'Internal server error' });
    }
});

app.post('/api/auth/reset-password', async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) {
        return res.status(400).json({ error: 'Token and new password are required.' });
    }

    try {
        const [users] = await db.query(
            'SELECT User_ID FROM users WHERE Reset_Token = ? AND Reset_Token_Expiry > NOW()',
            [token]
        );

        if (users.length === 0) {
            return res.status(400).json({ error: 'Reset link is invalid or has expired.' });
        }

        const user = users[0];

        // Update password and clear token
        await db.query(
            'UPDATE users SET Password = ?, Reset_Token = NULL, Reset_Token_Expiry = NULL WHERE User_ID = ?',
            [password, user.User_ID]
        );

        res.json({ message: 'Password has been reset successfully. You can now log in with your new password.' });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !isValidEmailFormat(email)) {
        return res.status(400).json({ error: 'Please enter a valid email address format (e.g., user@domain.com).' });
    }
    try {
        const [users] = await db.query('SELECT * FROM users WHERE Email = ?', [email]);

        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = users[0];

        // NOTE: Comparing plain text password. In production, use bcrypt!
        if (user.Password !== password) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Store user in session
        req.session.userId = user.User_ID;
        req.session.userEmail = user.Email;
        req.session.userName = user.Name;
        req.session.userRole = user.Role;

        // Send back user info (excluding password)
        res.json({
            message: 'Login successful',
            user: {
                id: user.User_ID,
                name: user.Name,
                email: user.Email,
                role: user.Role
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Faculty management endpoint
app.post('/api/faculty/add', requireAuth, async (req, res) => {
    const { name, email, department, role } = req.body;

    if (!email || !isValidEmailFormat(email)) {
        return res.status(400).json({ error: 'Invalid email address. Please enter a valid email (e.g., user@domain.com).' });
    }

    try {
        // Check if email already exists
        const [existing] = await db.query('SELECT * FROM users WHERE Email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        // Generate random password (8 characters)
        const generatedPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase();

        // Generate unique QR code string for user
        const qrString = `LABSYNC-USER-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

        // Insert new faculty member
        const [result] = await db.query(
            'INSERT INTO users (Name, Email, Role, Password, ID_QR_String) VALUES (?, ?, ?, ?, ?)',
            [name, email, role || 'Faculty', generatedPassword, qrString]
        );

        // Send welcome email with credentials
        const emailSent = await sendWelcomeEmail(email, name, generatedPassword);

        if (!emailSent) {
            console.log(`Warning: Email failed to send to ${email}`);
            console.log(`Manual credentials - Email: ${email}, Password: ${generatedPassword}`);
        }

        res.json({
            message: 'Faculty member added successfully',
            userId: result.insertId,
            email: email,
            emailSent: emailSent
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all faculty members and IT Dept Head
app.get('/api/faculty', async (req, res) => {
    try {
        const [faculty] = await db.query(
            'SELECT User_ID, Name, Email, Role, Profile_Photo, Phone FROM users WHERE Role IN ("Faculty", "IT Head", "IT Dept. Head", "IT Dept Head") ORDER BY Name'
        );
        res.json(faculty);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update a faculty member's role (Admin/Dept Head privilege)
app.put('/api/faculty/:userId/role', requireAuth, async (req, res) => {
    const { userId } = req.params;
    const { role } = req.body;
    try {
        if (role && role.toLowerCase().includes('head')) {
            // 1. Demote any current IT Head / IT Dept. Head to "Faculty" first
            await db.query(
                'UPDATE users SET Role = "Faculty" WHERE Role IN ("IT Head", "IT Dept. Head", "IT Dept Head")'
            );
            
            // 2. Promote the target user to "IT Dept. Head"
            await db.query('UPDATE users SET Role = ? WHERE User_ID = ?', [role, userId]);
            
            // 3. Update the currently logged-in user's role in their session
            if (req.session.userId) {
                const [currentRows] = await db.query('SELECT Role FROM users WHERE User_ID = ?', [req.session.userId]);
                if (currentRows.length > 0) {
                    req.session.userRole = currentRows[0].Role;
                }
            }
        } else {
            // Regular role update
            await db.query('UPDATE users SET Role = ? WHERE User_ID = ?', [role, userId]);
        }
        res.json({ message: 'Role updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Remove a faculty member (Admin/Dept Head privilege)
app.delete('/api/faculty/:userId', requireAuth, async (req, res) => {
    const { userId } = req.params;
    try {
        await db.query('DELETE FROM users WHERE User_ID = ?', [userId]);
        res.json({ message: 'Faculty member removed successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Laboratories Endpoints ---
// Get all laboratories
// Get all laboratories with real-time status and active classes computed dynamically
app.get('/api/laboratories', async (req, res) => {
    try {
        const [rooms] = await db.query('SELECT * FROM laboratories ORDER BY Room_Number');
        
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const today = days[new Date().getDay()];
        const nowTime = new Date().toTimeString().split(' ')[0]; // 'HH:MM:SS'

        for (let room of rooms) {
            // Find if there's any class scheduled right now in this room
            const [schedules] = await db.query(
                `SELECT s.Subject_Name, s.Section, u.Name as ProfessorName 
                 FROM schedules s
                 LEFT JOIN users u ON s.User_ID = u.User_ID
                 WHERE s.Room_ID = ? AND s.Day_of_Week = ? AND ? BETWEEN s.Start_Time AND s.End_Time`,
                [room.Room_ID, today, nowTime]
            );

            if (schedules.length > 0) {
                room.Current_Status = 'In Use';
                room.Current_Class = `${schedules[0].Subject_Name} (${schedules[0].Section})`;
            } else {
                // If key is Absent (taken), the room is occupied/Claimed. If Key is Present, it is Available.
                if (room.Key_Status === 'Absent') {
                    room.Current_Status = 'Claimed';
                    room.Current_Class = 'Open Lab Session';
                } else {
                    room.Current_Status = 'Available';
                    room.Current_Class = 'None';
                }
            }
        }

        res.json(rooms);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add new laboratory room
app.post('/api/laboratories/add', async (req, res) => {
    const { roomNumber, building } = req.body;

    if (!roomNumber) {
        return res.status(400).json({ error: 'Room number is required' });
    }
    if (!/^\d+$/.test(roomNumber)) {
        return res.status(400).json({ error: 'Room number must contain only numbers.' });
    }

    try {
        // Check for duplicates
        const [existing] = await db.query('SELECT * FROM laboratories WHERE Room_Number = ?', [roomNumber]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Room number already exists' });
        }

        const [result] = await db.query(
            'INSERT INTO laboratories (Room_Number, Building, Current_Status) VALUES (?, ?, ?)',
            [roomNumber, building, 'Available']
        );

        res.json({ message: 'Room added successfully', roomId: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update a laboratory room
app.put('/api/laboratories/:roomId', async (req, res) => {
    const { roomId } = req.params;
    const { roomNumber, building } = req.body;

    if (!roomNumber) {
        return res.status(400).json({ error: 'Room number is required' });
    }
    if (!/^\d+$/.test(roomNumber)) {
        return res.status(400).json({ error: 'Room number must contain only numbers.' });
    }

    try {
        // Check if room number is already taken by another room
        const [existing] = await db.query('SELECT * FROM laboratories WHERE Room_Number = ? AND Room_ID != ?', [roomNumber, roomId]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Room number already exists' });
        }

        await db.query(
            'UPDATE laboratories SET Room_Number = ?, Building = ? WHERE Room_ID = ?',
            [roomNumber, building, roomId]
        );

        res.json({ message: 'Room updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete a laboratory room
app.delete('/api/laboratories/:roomId', async (req, res) => {
    const { roomId } = req.params;

    try {
        await db.query('DELETE FROM laboratories WHERE Room_ID = ?', [roomId]);
        res.json({ message: 'Room deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Get all PCs for a specific room
app.get('/api/laboratories/:roomId/pcs', async (req, res) => {
    try {
        const { roomId } = req.params;
        const [pcs] = await db.query('SELECT * FROM lab_units WHERE Room_ID = ? ORDER BY CAST(PC_Number AS UNSIGNED)', [roomId]);
        res.json(pcs);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add a new PC to a room
app.post('/api/laboratories/:roomId/pcs/add', async (req, res) => {
    try {
        const { roomId } = req.params;
        const { pcNumber } = req.body;
        
        if (!pcNumber) {
            return res.status(400).json({ error: 'PC Number is required' });
        }
        
        // Check for duplicate PC number
        const [existing] = await db.query('SELECT PC_ID FROM lab_units WHERE Room_ID = ? AND PC_Number = ?', [roomId, pcNumber]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'This PC number already exists in this room.' });
        }
        
        // Generate a QR string for the PC
        const qrString = `LABSYNC-PC-${roomId}-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

        const [result] = await db.query(
            'INSERT INTO lab_units (Room_ID, PC_Number, Condition_Status, PC_QR_String) VALUES (?, ?, ?, ?)',
            [roomId, pcNumber, 'Functional', qrString]
        );

        res.json({ message: 'PC added successfully', pcId: result.insertId, pcNumber });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete a PC
app.delete('/api/pcs/:pcId', async (req, res) => {
    try {
        const { pcId } = req.params;
        await db.query('DELETE FROM lab_units WHERE PC_ID = ?', [pcId]);
        res.json({ message: 'PC deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Generate QR code image for a PC
app.get('/api/pcs/:pcId/qrcode', async (req, res) => {
    try {
        const { pcId } = req.params;
        const [pcs] = await db.query(
            'SELECT p.*, r.Room_Number FROM lab_units p JOIN laboratories r ON p.Room_ID = r.Room_ID WHERE p.PC_ID = ?', 
            [pcId]
        );

        if (pcs.length === 0) {
            return res.status(404).json({ error: 'PC not found' });
        }

        const pc = pcs[0];
        // The destination URL for the QR code
        const reportUrl = `${process.env.APP_URL || 'http://localhost:3000'}/pc-report.html?room=${pc.Room_Number}&pc=${pc.PC_Number}`;

        const qrCodeDataURL = await QRCode.toDataURL(reportUrl, {
            width: 300,
            margin: 2,
            color: {
                dark: '#1EBBD7',
                light: '#FFFFFF'
            }
        });

        res.json({
            qrCode: qrCodeDataURL,
            pcNumber: pc.PC_Number,
            roomNumber: pc.Room_Number,
            reportUrl: reportUrl
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Schedules Endpoints ---
app.post('/api/schedules/save', async (req, res) => {
    const { roomNumber, schedules, academicYear, semester } = req.body;
    const currentYear = new Date().getFullYear();
    const ay = academicYear || `${currentYear}-${currentYear + 1}`;
    const sem = semester || '1st Semester';

    try {
        const [rooms] = await db.query('SELECT Room_ID FROM laboratories WHERE Room_Number = ?', [roomNumber]);
        if (rooms.length === 0) return res.status(404).json({ error: 'Room not found' });
        const roomId = rooms[0].Room_ID;

        // Delete only the schedules for this specific room and term
        await db.query(
            'DELETE FROM schedules WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
            [roomId, ay, sem]
        );

        if (schedules && schedules.length > 0) {
            for (const sched of schedules) {
                const [users] = await db.query('SELECT User_ID FROM users WHERE Name = ?', [sched.professor]);
                const userId = users.length > 0 ? users[0].User_ID : null;

                await db.query(
                    'INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [userId, roomId, sched.subject, sched.section, sched.day, sched.startTime, sched.endTime, ay, sem, sched.colorTheme]
                );
            }
        }

        res.json({ message: 'Schedule saved successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});



// Check if a professor is already scheduled in another room at the same time
app.get('/api/schedules/check-professor-conflict', async (req, res) => {
    try {
        const { professorName, day, startTime, endTime, academicYear, semester, excludeRoomNumber } = req.query;
        if (!professorName || !day || !startTime || !endTime) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const currentYear = new Date().getFullYear();
        const ay = academicYear || `${currentYear}-${currentYear + 1}`;
        const sem = semester || '1st Semester';

        // Find user by name
        const [users] = await db.query('SELECT User_ID FROM users WHERE Name = ?', [professorName]);
        if (users.length === 0) {
            return res.json({ conflict: false }); // No professor found, no DB conflict
        }
        const userId = users[0].User_ID;

        // Check if there is an overlapping schedule in any room (optionally excluding excludeRoomNumber)
        let query = `
            SELECT s.*, l.Room_Number
            FROM schedules s
            JOIN laboratories l ON s.Room_ID = l.Room_ID
            WHERE s.User_ID = ? AND s.Day_of_Week = ? AND s.Academic_Year = ? AND s.Semester = ?
        `;
        const params = [userId, day, ay, sem];

        if (excludeRoomNumber) {
            query += ` AND l.Room_Number != ?`;
            params.push(excludeRoomNumber);
        }

        const [schedules] = await db.query(query, params);

        // Filter overlaps (s.Start_Time < endTime AND s.End_Time > startTime)
        const overlaps = schedules.filter(s => {
            const start1 = s.Start_Time.substring(0, 5);
            const end1 = s.End_Time.substring(0, 5);
            const maxStart = start1 > startTime ? start1 : startTime;
            const minEnd = end1 < endTime ? end1 : endTime;
            return maxStart < minEnd;
        });

        if (overlaps.length > 0) {
            return res.json({
                conflict: true,
                conflictingRoom: overlaps[0].Room_Number,
                startTime: overlaps[0].Start_Time.substring(0, 5),
                endTime: overlaps[0].End_Time.substring(0, 5)
            });
        }

        res.json({ conflict: false });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// Get schedule for a specific room
app.get('/api/schedules/room/:roomNumber', async (req, res) => {
    try {
        const { roomNumber } = req.params;
        const { academicYear, semester } = req.query;
        const currentYear = new Date().getFullYear();
        const ay = academicYear || `${currentYear}-${currentYear + 1}`;
        const sem = semester || '1st Semester';

        const [rooms] = await db.query('SELECT Room_ID FROM laboratories WHERE Room_Number = ?', [roomNumber]);
        if (rooms.length === 0) return res.status(404).json({ error: 'Room not found' });

        const [schedules] = await db.query(`
            SELECT s.*, u.Name as ProfessorName
            FROM schedules s
            LEFT JOIN users u ON s.User_ID = u.User_ID
            WHERE s.Room_ID = ? AND s.Academic_Year = ? AND s.Semester = ?
        `, [rooms[0].Room_ID, ay, sem]);

        res.json(schedules);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user's schedule
app.get('/api/schedules/user', async (req, res) => {
    try {
        const userId = req.session.userId || 1; // Fallback to IT Head if no active session
        const { academicYear, semester } = req.query;
        const currentYear = new Date().getFullYear();
        const ay = academicYear || `${currentYear}-${currentYear + 1}`;
        const sem = semester || '1st Semester';

        const [schedules] = await db.query(`
            SELECT s.*, r.Room_Number, r.Building 
            FROM schedules s
            JOIN laboratories r ON s.Room_ID = r.Room_ID
            WHERE s.User_ID = ? AND s.Academic_Year = ? AND s.Semester = ?
            ORDER BY FIELD(s.Day_of_Week, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'), s.Start_Time
        `, [userId, ay, sem]);

        res.json(schedules);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get current user info


app.get('/api/user/current', requireAuth, async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const [users] = await db.query(
            'SELECT User_ID, Name, Email, Role, Profile_Photo, Phone FROM users WHERE User_ID = ?',
            [req.session.userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            id: users[0].User_ID,
            name: users[0].Name,
            email: users[0].Email,
            role: users[0].Role,
            profilePhoto: users[0].Profile_Photo,
            phone: users[0].Phone
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update user account
app.put('/api/user/update', requireAuth, async (req, res) => {
    const { name, email, currentPassword, newPassword, profilePhoto, phone } = req.body;

    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const userId = req.session.userId;

        // Get current user
        const [users] = await db.query('SELECT * FROM users WHERE User_ID = ?', [userId]);

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];

        // Email change request logic
        let emailChangeRequested = false;
        if (email && email.trim().toLowerCase() !== user.Email.toLowerCase()) {
            const newEmailTrim = email.trim();
            if (!isValidEmailFormat(newEmailTrim)) {
                return res.status(400).json({ error: 'Invalid email address format. Please enter a valid email (e.g., user@domain.com).' });
            }

            // Check if email is already in use by another user
            const [existingUsers] = await db.query('SELECT 1 FROM users WHERE Email = ? AND User_ID != ?', [newEmailTrim, userId]);
            if (existingUsers.length > 0) {
                return res.status(400).json({ error: 'Email address is already in use' });
            }

            // Generate email verification token
            const token = crypto.randomBytes(32).toString('hex');
            const expiry = new Date(Date.now() + 3600000); // 1 hour

            // Update user's verification columns
            await db.query(
                'UPDATE users SET New_Email = ?, Email_Verify_Token = ?, Email_Verify_Token_Expiry = ? WHERE User_ID = ?',
                [newEmailTrim, token, expiry, userId]
            );

            // Send verification email to the new address
            const verificationLink = `${process.env.APP_URL || 'http://localhost:3000'}/api/user/verify-email?token=${token}`;
            await sendEmailVerificationEmail(newEmailTrim, name || user.Name, verificationLink);
            emailChangeRequested = true;
        }

        // If password change is requested, verify current password
        if (currentPassword && newPassword) {
            if (user.Password !== currentPassword) {
                return res.status(401).json({ error: 'Current password is incorrect' });
            }

            // Update name, password, phone, and profile photo (only if provided)
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
            // Update name, phone, and profile photo (only if provided)
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

        // Update session
        req.session.userName = name;

        if (emailChangeRequested) {
            res.json({ message: 'Account settings updated. A verification link has been sent to your new email. Please verify it to complete the change.' });
        } else {
            res.json({ message: 'Account updated successfully' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Verify email change token
app.get('/api/user/verify-email', async (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.status(400).send('Verification token is missing.');
    }

    try {
        // Find user by verification token
        const [users] = await db.query(
            'SELECT User_ID, Name, New_Email, Email_Verify_Token_Expiry FROM users WHERE Email_Verify_Token = ?',
            [token]
        );

        if (users.length === 0) {
            return res.status(400).send(`
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
            `);
        }

        const user = users[0];

        // Check if token has expired
        const now = new Date();
        const expiry = new Date(user.Email_Verify_Token_Expiry);

        if (now > expiry) {
            return res.status(400).send(`
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
            `);
        }

        const newEmail = user.New_Email;

        // Perform the email update and clear the verification fields
        await db.query(
            'UPDATE users SET Email = ?, New_Email = NULL, Email_Verify_Token = NULL, Email_Verify_Token_Expiry = NULL WHERE User_ID = ?',
            [newEmail, user.User_ID]
        );

        // Update active session if this matches the logged-in user
        if (req.session && req.session.userId === user.User_ID) {
            req.session.userEmail = newEmail;
        }

        res.send(`
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
        `);

    } catch (err) {
        console.error('Email verification error:', err);
        res.status(500).send('Internal server error during email verification.');
    }
});

// Generate QR code for user
app.get('/api/user/qrcode', requireAuth, async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const [users] = await db.query(
            'SELECT User_ID, Name, Email, Role, ID_QR_String FROM users WHERE User_ID = ?',
            [req.session.userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];

        // If no QR string exists, generate one
        if (!user.ID_QR_String) {
            const qrString = `LABSYNC-USER-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
            await db.query('UPDATE users SET ID_QR_String = ? WHERE User_ID = ?', [qrString, user.User_ID]);
            user.ID_QR_String = qrString;
        }

        // Generate QR code as data URL
        const qrCodeDataURL = await QRCode.toDataURL(user.ID_QR_String, {
            width: 300,
            margin: 2,
            color: {
                dark: '#1EBBD7',
                light: '#FFFFFF'
            }
        });

        res.json({
            qrCode: qrCodeDataURL,
            qrString: user.ID_QR_String,
            user: {
                id: user.User_ID,
                name: user.Name,
                email: user.Email,
                role: user.Role
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Scan QR code and get user details
app.post('/api/qrcode/scan', async (req, res) => {
    const { qrString } = req.body;

    try {
        const [users] = await db.query(
            'SELECT User_ID, Name, Email, Role FROM users WHERE ID_QR_String = ?',
            [qrString]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];

        res.json({
            user: {
                id: user.User_ID,
                name: user.Name,
                email: user.Email,
                role: user.Role
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// In-memory store for recent room claim scans: { roomNumber: { userId, userName, role, timestamp } }
const recentRoomClaims = {};

// Log occupancy access (from hardware device)
app.post('/api/occupancy/log', async (req, res) => {
    const { qrString, roomNumber, authMethod, keyEvent } = req.body;

    try {
        if (!roomNumber) {
            return res.status(400).json({ error: 'roomNumber is required.', lcdLine1: 'Error', lcdLine2: 'No Room Num' });
        }

        // 1. Resolve Laboratory Room
        const [rooms] = await db.query(
            'SELECT Room_ID FROM laboratories WHERE Room_Number = ?',
            [roomNumber]
        );
        if (rooms.length === 0) {
            return res.status(404).json({ error: `Room ${roomNumber} not found.`, lcdLine1: 'Error', lcdLine2: 'Invalid Room' });
        }
        const room = rooms[0];

        // 2. Handle Key Events (Key Taken / Key Returned)
        if (keyEvent) {
            const status = (keyEvent === 'Key Returned') ? 'Present' : 'Absent';
            await db.query(
                'UPDATE laboratories SET Key_Status = ? WHERE Room_ID = ?',
                [status, room.Room_ID]
            );

            let claimUserId = null;
            let claimUserName = null;

            if (keyEvent === 'Key Taken') {
                const claim = recentRoomClaims[roomNumber];
                // Check if a professor claimed this room within the last 15 minutes
                if (claim && (Date.now() - claim.timestamp < 15 * 60 * 1000)) {
                    claimUserId = claim.userId;
                    claimUserName = claim.userName;
                }
            } else if (keyEvent === 'Key Returned') {
                delete recentRoomClaims[roomNumber];
            }

            // Log event in occupancy_log (with claimUserId associated if registered)
            await db.query(
                'INSERT INTO occupancy_log (User_ID, Room_ID, Access_Time, Auth_Method) VALUES (?, ?, NOW(), ?)',
                [claimUserId, room.Room_ID, keyEvent]
            );

            let lcdLine1 = 'Key Take Reg!';
            let lcdLine2 = claimUserName ? claimUserName.substring(0, 16) : 'System Updated';

            if (keyEvent === 'Key Returned') {
                lcdLine1 = 'Key Returned!';
                lcdLine2 = 'Room Secured';
            }

            return res.json({
                message: `Key status updated to ${status} successfully.`,
                room: roomNumber,
                keyStatus: status,
                registeredUser: claimUserName || null,
                lcdLine1,
                lcdLine2
            });
        }

        // 3. Handle QR Code Scan (Register Professor & Room Claim)
        if (!qrString) {
            return res.status(400).json({ error: 'qrString or keyEvent is required.', lcdLine1: 'Scan Error', lcdLine2: 'Missing QR' });
        }

        // Resolve User
        const [users] = await db.query(
            'SELECT User_ID, Name, Role FROM users WHERE ID_QR_String = ?',
            [qrString]
        );
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found for the provided QR code.', lcdLine1: 'Access Denied!', lcdLine2: 'Invalid QR Code' });
        }
        const user = users[0];

        // Store active claim session for this room
        recentRoomClaims[roomNumber] = {
            userId: user.User_ID,
            userName: user.Name,
            role: user.Role,
            timestamp: Date.now()
        };

        // Insert scan into occupancy_log
        await db.query(
            'INSERT INTO occupancy_log (User_ID, Room_ID, Access_Time, Auth_Method) VALUES (?, ?, NOW(), ?)',
            [user.User_ID, room.Room_ID, authMethod || 'QR Code']
        );

        res.json({
            message: 'Professor QR verified. Awaiting key retrieval.',
            user: {
                name: user.Name,
                role: user.Role
            },
            lcdLine1: 'Scan Confirmed!',
            lcdLine2: 'You May Take Key'
        });
    } catch (err) {
        console.error('Error logging occupancy access:', err);
        res.status(500).json({ error: 'Internal server error', lcdLine1: 'System Error', lcdLine2: 'Try Again' });
    }
});

// --- PC Reports & Maintenance Endpoints ---

// Submit a student PC report
app.post('/api/reports/submit', async (req, res) => {
    const { roomNumber, pcNumber, studentName, studentSection, components, remarks } = req.body;

    try {
        if (!studentName || !studentSection) {
            return res.status(400).json({ error: 'Student Name and Program & Section are required.' });
        }

        // 1. Resolve Room ID
        const [rooms] = await db.query('SELECT Room_ID FROM laboratories WHERE Room_Number = ?', [roomNumber]);
        if (rooms.length === 0) {
            return res.status(404).json({ error: `Room ${roomNumber} not found.` });
        }
        const roomId = rooms[0].Room_ID;

        // 2. Resolve PC ID
        const [pcs] = await db.query('SELECT PC_ID FROM lab_units WHERE Room_ID = ? AND PC_Number = ?', [roomId, pcNumber]);
        if (pcs.length === 0) {
            return res.status(404).json({ error: `PC Unit ${pcNumber} not found in Room ${roomNumber}.` });
        }
        const pcId = pcs[0].PC_ID;

        // 3. Find components with issues
        const issueComponents = Object.keys(components).filter(key => components[key] === 'issue');
        
        // 4. Construct Issue Description
        const desc = `[Program & Section: ${studentSection}] [Issues: ${issueComponents.join(', ') || 'None'}] Remarks: ${remarks || 'None'}`;

        // 5. Determine Priority Level, Status, and PC Condition
        let priority = 'Low';
        let status = 'Pending';
        let pcCondition = 'Under Maintenance';

        const hasIssues = issueComponents.length > 0;
        const hasRemarks = remarks && remarks.trim() !== '' && remarks.trim().toLowerCase() !== 'none';

        if (!hasIssues && !hasRemarks) {
            status = 'Resolved';
            pcCondition = 'Working';
        } else {
            if (components['PC/Laptop'] === 'issue' || components['System Unit'] === 'issue') {
                priority = 'High';
            } else if (components['Monitor'] === 'issue') {
                priority = 'Medium';
            }
        }

        // 6. Insert Report into maintenance table
        const [result] = await db.query(
            'INSERT INTO maintenance (PC_ID, Student_Name, Issue_Description, Date_Reported, Status, Priority_Level) VALUES (?, ?, ?, NOW(), ?, ?)',
            [pcId, studentName, desc, status, priority]
        );

        // 7. Update PC status in lab_units
        await db.query('UPDATE lab_units SET Condition_Status = ? WHERE PC_ID = ?', [pcCondition, pcId]);

        res.json({
            message: 'Report submitted successfully!',
            ticketId: `LS-TKT-${result.insertId}`
        });
    } catch (err) {
        console.error('Error submitting report:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all reports for MIS / IT Head dashboards
app.get('/api/reports', async (req, res) => {
    try {
        const [reports] = await db.query(`
            SELECT m.Report_ID, m.Student_Name, m.Issue_Description, m.Date_Reported, m.Status, m.Priority_Level,
                   p.PC_Number, r.Room_Number
            FROM maintenance m
            JOIN lab_units p ON m.PC_ID = p.PC_ID
            JOIN laboratories r ON p.Room_ID = r.Room_ID
            ORDER BY m.Date_Reported DESC
        `);
        res.json(reports);
    } catch (err) {
        console.error('Error fetching reports:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update a report status (MIS / IT Head)
app.put('/api/reports/:reportId/status', async (req, res) => {
    const { reportId } = req.params;
    const { status } = req.body;

    try {
        // 1. Update report status
        await db.query('UPDATE maintenance SET Status = ? WHERE Report_ID = ?', [status, reportId]);

        // 2. If status is resolved, set the corresponding PC back to Functional
        if (status === 'Resolved') {
            const [reports] = await db.query('SELECT PC_ID FROM maintenance WHERE Report_ID = ?', [reportId]);
            if (reports.length > 0) {
                const pcId = reports[0].PC_ID;
                await db.query('UPDATE lab_units SET Condition_Status = ? WHERE PC_ID = ?', ['Functional', pcId]);
            }
        }

        res.json({ message: `Report status updated to ${status} successfully.` });
    } catch (err) {
        console.error('Error updating report status:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete a report
app.delete('/api/reports/:reportId', async (req, res) => {
    const { reportId } = req.params;

    try {
        // If deleted, we also check if we should reset the PC status back to Functional just in case
        const [reports] = await db.query('SELECT PC_ID, Status FROM maintenance WHERE Report_ID = ?', [reportId]);
        if (reports.length > 0) {
            const { PC_ID, Status } = reports[0];
            if (Status !== 'Resolved') {
                await db.query('UPDATE lab_units SET Condition_Status = ? WHERE PC_ID = ?', ['Functional', PC_ID]);
            }
        }

        await db.query('DELETE FROM maintenance WHERE Report_ID = ?', [reportId]);
        res.json({ message: 'Report deleted successfully.' });
    } catch (err) {
        console.error('Error deleting report:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get notifications (PC reports and occupancy access)
app.get('/api/notifications', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId;
        let role = req.session.userRole;
        if (!role) {
            const [users] = await db.query('SELECT Role FROM users WHERE User_ID = ?', [userId]);
            if (users.length > 0) {
                role = users[0].Role;
            }
        }

        if (role === 'MIS Staff') {
            // MIS Staff sees all PC reports and occupancy logs
            const [reports] = await db.query(`
                (SELECT 'report' AS type, m.Report_ID AS id, m.Date_Reported AS time, m.Status AS status, 
                       p.PC_Number AS pc_number, r.Room_Number AS room_number, m.Issue_Description AS description, 
                       m.Student_Name AS detail, m.Priority_Level AS priority
                FROM maintenance m
                JOIN lab_units p ON m.PC_ID = p.PC_ID
                JOIN laboratories r ON p.Room_ID = r.Room_ID)
                UNION ALL
                (SELECT 'occupancy' AS type, o.Log_ID AS id, o.Access_Time AS time, o.Auth_Method AS status,
                       NULL AS pc_number, r.Room_Number AS room_number, IFNULL(u.Name, 'Room Key') AS description,
                       IFNULL(u.Role, 'System') AS detail, NULL AS priority
                FROM occupancy_log o
                LEFT JOIN users u ON o.User_ID = u.User_ID
                JOIN laboratories r ON o.Room_ID = r.Room_ID)
                ORDER BY time DESC
                LIMIT 15
            `);
            return res.json(reports);
        } else {
            // Faculty & Dept Head only see PC reports and occupancy logs for their assigned rooms (based on schedules)
            const [schedules] = await db.query('SELECT DISTINCT Room_ID FROM schedules WHERE User_ID = ?', [userId]);
            
            if (schedules.length === 0) {
                return res.json([]);
            }

            const roomIds = schedules.map(s => s.Room_ID);

            const [reports] = await db.query(`
                (SELECT 'report' AS type, m.Report_ID AS id, m.Date_Reported AS time, m.Status AS status, 
                       p.PC_Number AS pc_number, r.Room_Number AS room_number, m.Issue_Description AS description, 
                       m.Student_Name AS detail, m.Priority_Level AS priority
                FROM maintenance m
                JOIN lab_units p ON m.PC_ID = p.PC_ID
                JOIN laboratories r ON p.Room_ID = r.Room_ID
                WHERE r.Room_ID IN (?))
                UNION ALL
                (SELECT 'occupancy' AS type, o.Log_ID AS id, o.Access_Time AS time, o.Auth_Method AS status,
                       NULL AS pc_number, r.Room_Number AS room_number, IFNULL(u.Name, 'Room Key') AS description,
                       IFNULL(u.Role, 'System') AS detail, NULL AS priority
                FROM occupancy_log o
                LEFT JOIN users u ON o.User_ID = u.User_ID
                JOIN laboratories r ON o.Room_ID = r.Room_ID
                WHERE r.Room_ID IN (?))
                ORDER BY time DESC
                LIMIT 15
            `, [roomIds, roomIds]);

            return res.json(reports);
        }
    } catch (err) {
        console.error('Error fetching notifications:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

