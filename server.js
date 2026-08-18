const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const session = require('express-session');
const db = require('./db');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Database initialization (delegated to services/dbInit)
const { initializeDatabase } = require('./services/dbInit');
initializeDatabase();

// Trust proxy for secure cookies behind reverse proxies (like Ngrok, Heroku, Render, Nginx)
app.set('trust proxy', 1);

// Middleware setup
app.use(cors({
    origin: function (origin, callback) {
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
        secure: false,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Serve static files from root
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

// Import Controllers for top-level backward compatibility routes
const authController = require('./controllers/auth.controller');
const usersController = require('./controllers/users.controller');
const schedulesController = require('./controllers/schedules.controller');
const maintenanceController = require('./controllers/maintenance.controller');
const { requireAuth } = require('./middleware/auth');

// Top-level legacy route aliases to guarantee 100% zero-regression compatibility
app.post('/api/login', authController.login);
app.post('/api/logout', authController.logout);
app.post('/api/qrcode/scan', usersController.scanQRCode);
app.get('/api/dashboard/it-head-summary', schedulesController.getITHeadSummary);
app.get('/api/notifications', requireAuth, maintenanceController.getNotifications);

// Mount modular API routers
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/user', require('./routes/users.routes'));
app.use('/api/faculty', require('./routes/faculty.routes'));
app.use('/api/laboratories', require('./routes/labs.routes'));
app.use('/api/pcs', require('./routes/pcs.routes'));
app.use('/api/schedules', require('./routes/schedules.routes'));
app.use('/api/reports', require('./routes/maintenance.routes'));
app.use('/api/settings', require('./routes/settings.routes'));
app.use('/api/curriculum', require('./routes/curriculum.routes'));
app.use('/api/occupancy', require('./routes/iot.routes'));

// Centralized error handling middleware
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

module.exports = app;
