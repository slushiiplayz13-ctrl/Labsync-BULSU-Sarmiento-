const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test the connection
pool.getConnection()
    .then(async connection => {
        console.log('Successfully connected to the MySQL database.');
        connection.release();
        
        // Auto-migration for schedules table
        try {
            const [columns] = await pool.query('SHOW COLUMNS FROM schedules');
            const hasAY = columns.some(c => c.Field === 'Academic_Year');
            const hasSem = columns.some(c => c.Field === 'Semester');
            
            if (!hasAY) {
                await pool.query("ALTER TABLE schedules ADD COLUMN Academic_Year VARCHAR(15) DEFAULT '2025-2026'");
                console.log('Added Academic_Year column to schedules table.');
            }
            if (!hasSem) {
                await pool.query("ALTER TABLE schedules ADD COLUMN Semester VARCHAR(20) DEFAULT '1st Semester'");
                console.log('Added Semester column to schedules table.');
            }
        } catch (err) {
            console.error('Error running DB migration for schedules:', err.message);
        }
    })
    .catch(err => {
        console.error('Error connecting to the database:', err.message);
    });

module.exports = pool;
