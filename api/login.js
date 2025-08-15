// api/login.js (for Vercel serverless functions)
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

// Database connection function
async function getDbConnection() {
    return await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });
}

// Utility functions
const asyncHandler = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ message: error.message || 'Internal server error' });
    }
};

const validateInput = (body, requiredFields) => {
    for (const field of requiredFields) {
        if (!body[field] || typeof body[field] !== 'string' || body[field].trim() === '') {
            return `${field} is required and cannot be empty`;
        }
    }
    return null;
};

const log = (level, message, data = {}) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, data);
};

const handler = asyncHandler(async (req, res) => {
    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const db = await getDbConnection();
    
    try {
        const { userType, matNo, email, password } = req.body;
        log('info', 'Login attempt', { userType });

        if (userType === 'student') {
            if (!matNo) {
                return res.status(400).json({ message: 'Matriculation number is required' });
            }

            const [students] = await db.query('SELECT * FROM students WHERE mat_no = ?', [matNo.trim()]);
            if (students.length === 0) {
                return res.status(404).json({ message: 'Student not found' });
            }
            
            const student = students[0];
            const token = jwt.sign(
                { id: student.id, type: 'student', matNo: student.mat_no }, 
                JWT_SECRET, 
                { expiresIn: '24h' }
            );
            
            res.json({
                message: 'Student data retrieved for face verification',
                token,
                faceScanData: student.face_scan_path,
                user: { id: student.id, name: student.name, mat_no: student.mat_no }
            });

        } else { // Lecturer or Admin
            const validationError = validateInput(req.body, ['email', 'password']);
            if (validationError) {
                return res.status(400).json({ message: validationError });
            }

            const table = userType === 'lecturer' ? 'lecturers' : 'admins';
            const [users] = await db.query(`SELECT * FROM ${table} WHERE email = ?`, [email.trim()]);
            
            if (users.length === 0) {
                return res.status(404).json({ message: 'User not found' });
            }

            const user = users[0];
            const isValidPassword = await bcrypt.compare(password, user.password_hash);
            
            if (!isValidPassword) {
                return res.status(401).json({ message: 'Invalid credentials' });
            }

            const token = jwt.sign(
                { id: user.id, type: userType, email: user.email }, 
                JWT_SECRET, 
                { expiresIn: '24h' }
            );
            
            delete user.password_hash;
            res.json({ message: 'Login successful', token, user });
        }
    } finally {
        await db.end();
    }
});

module.exports = handler;