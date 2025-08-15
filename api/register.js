// api/register.js (for Vercel serverless functions)
const bcrypt = require('bcrypt');
const multer = require('multer');
const mysql = require('mysql2/promise');

// Database connection function
async function getDbConnection() {
    return await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });
}

// Use memory storage to get the file buffer
const upload = multer({ storage: multer.memoryStorage() });

const runMiddleware = (req, res, fn) => {
    return new Promise((resolve, reject) => {
        fn(req, res, (result) => {
            if (result instanceof Error) {
                return reject(result);
            }
            return resolve(result);
        });
    });
};

// Utility functions
const asyncHandler = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ message: error.message || 'Internal server error' });
    }
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

    // Handle multipart form data for file uploads
    await runMiddleware(req, res, upload.single('faceScan'));

    const db = await getDbConnection();
    
    try {
        const { userType, name, matNo, email, phone, lecturer_id, password } = req.body;
        log('info', 'Registration attempt', { userType });

        if (userType === 'student') {
            const faceScanFile = req.file;
            if (!name || !matNo || !email || !phone || !faceScanFile) {
                return res.status(400).json({ 
                    message: 'All fields and face scan are required for student registration' 
                });
            }
            
            const [existing] = await db.query(
                'SELECT id FROM students WHERE mat_no = ? OR email = ?', 
                [matNo.trim(), email.trim()]
            );
            
            if (existing.length > 0) {
                return res.status(409).json({ 
                    message: 'Student with this Matriculation No. or Email already exists' 
                });
            }

            // Convert image buffer to Base64
            const faceScanBase64 = faceScanFile.buffer.toString('base64');

            await db.query(
                'INSERT INTO students (mat_no, name, email, phone, face_scan_path) VALUES (?, ?, ?, ?, ?)',
                [matNo.trim(), name.trim(), email.trim(), phone.trim(), faceScanBase64]
            );

            return res.status(201).json({ message: 'Student registered successfully!' });

        } else if (userType === 'lecturer') {
            if (!name || !lecturer_id || !email || !phone || !password) {
                return res.status(400).json({ 
                    message: 'All fields are required for lecturer registration' 
                });
            }
            
            const [existing] = await db.query(
                'SELECT id FROM lecturers WHERE lecturer_id = ? OR email = ?', 
                [lecturer_id.trim(), email.trim()]
            );
            
            if (existing.length > 0) {
                return res.status(409).json({ 
                    message: 'Lecturer with this ID or Email already exists' 
                });
            }
            
            const hashedPassword = await bcrypt.hash(password.trim(), 10);
            await db.query(
                'INSERT INTO lecturers (lecturer_id, name, email, phone, password_hash) VALUES (?, ?, ?, ?, ?)',
                [lecturer_id.trim(), name.trim(), email.trim(), phone.trim(), hashedPassword]
            );
            
            return res.status(201).json({ message: 'Lecturer registered successfully!' });
            
        } else {
            return res.status(400).json({ message: 'Invalid user type provided' });
        }
    } finally {
        await db.end();
    }
});

module.exports = handler;