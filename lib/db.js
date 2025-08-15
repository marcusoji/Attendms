const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
    connectionLimit: 10,
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'school_attendance',
    port: process.env.DB_PORT || 3306,
    timezone: '+00:00'
});

const db = pool.promise();

module.exports = db;