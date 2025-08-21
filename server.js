// ENHANCED ATTENDANCE BACKEND WITH BETTER ERROR HANDLING AND DEBUGGING

// --- IMPORTS ---
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config();

// --- INITIALIZATION ---
const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

// Enhanced logging function
const log = (level, message, data = null) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
    if (data) {
        console.log('Data:', JSON.stringify(data, null, 2));
    }
};

// Ensure uploads directory exists
const uploadsDir = './uploads';
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    log('info', 'Created uploads directory');
}

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/models', express.static(path.join(__dirname, 'frontend/models'))); // Serve face-api.js models
app.use(express.static(path.join(__dirname, 'frontend')));
// Request logging middleware
app.use((req, res, next) => {
    log('info', `${req.method} ${req.path}`, {
        body: req.method !== 'GET' ? req.body : undefined,
        query: Object.keys(req.query).length > 0 ? req.query : undefined,
        headers: {
            'content-type': req.headers['content-type'],
            'authorization': req.headers.authorization ? 'Bearer [TOKEN]' : undefined
        }
    });
    next();
}); 
process.env.TZ = 'UTC';
// --- DATABASE CONNECTION ---
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

// Test database connection with better error handling
const testDbConnection = async () => {
    try {
        await db.execute('SELECT 1');
        log('info', 'Database connected successfully');
        
        // Test if tables exist
        const tables = ['students', 'lecturers', 'admins', 'attendance_codes', 'attendance_records', 'courses'];
        for (const table of tables) {
            try {
                await db.execute(`SELECT 1 FROM ${table} LIMIT 1`);
                log('info', `Table '${table}' exists and is accessible`);
            } catch (err) {
                log('error', `Table '${table}' does not exist or is not accessible`, err.message);
            }
        }
    } catch (err) {
        log('error', 'Database connection failed', {
            message: err.message,
            code: err.code,
            errno: err.errno
        });
    }
};

testDbConnection();

// --- FILE UPLOAD SETUP ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const matNo = req.body.matNo || 'unknown';
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        cb(null, `${matNo}-${timestamp}${ext}`);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// Multer for form data only (lecturers) - NO FILE EXPECTED
const uploadFormOnly = multer({
    limits: { fileSize: 1024 * 1024 } // 1MB limit for form data
});

// --- HELPER FUNCTIONS ---
const verifyToken = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            log('warn', 'Token verification failed: No token provided');
            return res.status(403).json({ message: "Token required" });
        }
        
        const token = authHeader.split(' ')[1];
        
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        log('info', 'Token verified successfully', { userId: decoded.id, userType: decoded.type });
        next();
    } catch (err) {
        log('error', 'Token verification error', err.message);
        return res.status(401).json({ message: "Invalid token" });
    }
};

// Calculate distance between two points in meters
const getDistance = (lat1, lon1, lat2, lon2) => {
    try {
        if (!lat1 || !lon1 || !lat2 || !lon2) {
            log('warn', 'Missing coordinates for distance calculation');
            return Infinity;
        }
        
        const R = 6371e3; // Earth's radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) ** 2 + 
                  Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        
        return R * c;
    } catch (error) {
        log('error', 'Distance calculation error', error.message);
        return Infinity;
    }
};

// Input validation helper
const validateInput = (data, requiredFields) => {
    for (const field of requiredFields) {
        if (!data[field] || data[field].toString().trim() === '') {
            return `${field} is required`;
        }
    }
    return null;
};

// Async wrapper for better error handling
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// --- API ROUTES ---

// Health check route
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        port: PORT,
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// Environment check route (for debugging)
app.get('/api/debug/env', (req, res) => {
    res.json({
        nodeEnv: process.env.NODE_ENV,
        dbHost: process.env.DB_HOST ? 'Set' : 'Not set',
        dbUser: process.env.DB_USER ? 'Set' : 'Not set',
        dbName: process.env.DB_NAME ? 'Set' : 'Not set',
        jwtSecret: process.env.JWT_SECRET ? 'Set' : 'Not set',
        uploadsExists: fs.existsSync(uploadsDir)
    });
});

// --- REGISTRATION ROUTES ---

// FIXED REGISTRATION ROUTE
app.post('/api/register', (req, res, next) => {
    const contentType = req.headers['content-type'] || '';
    
    log('info', 'Registration request received', {
        contentType: contentType,
        url: req.url,
        method: req.method
    });

    if (contentType.includes('multipart/form-data')) {
        // For multipart requests, use upload.single for students with face scan
        upload.single('faceScan')(req, res, (err) => {
            if (err) {
                log('error', 'Multer parsing error', err.message);
                return res.status(400).json({ message: 'Form parsing error: ' + err.message });
            }

            log('info', 'Form parsed by multer', {
                body: req.body,
                file: req.file ? 'File uploaded' : 'No file'
            });

            handleRegistration(req, res);
        });
    } else {
        // For JSON requests, just parse normally
        handleRegistration(req, res);
    }
});
// Add this route AFTER your main /register route in server.js

// Dedicated lecturer registration endpoint
app.post('/api/register/lecturer', asyncHandler(async (req, res) => {
    log('info', 'Lecturer registration endpoint hit');
    
    const { lecturer_id, name, email, phone, password } = req.body;
    
    // Validate all required fields
    const requiredFields = { lecturer_id, name, email, phone, password };
    const missingFields = Object.entries(requiredFields)
        .filter(([key, value]) => !value || value.trim() === '')
        .map(([key]) => key);
    
    if (missingFields.length > 0) {
        log('warn', 'Missing required fields', { missing: missingFields, received: req.body });
        return res.status(400).json({
            message: `All fields are required (${missingFields.join(', ')})`,
            missing: missingFields,
            received: Object.keys(req.body)
        });
    }

    try {
        // Check if lecturer already exists
        const [existing] = await db.query(
            'SELECT id FROM lecturers WHERE lecturer_id = ? OR email = ?',
            [lecturer_id.trim(), email.trim()]
        );

        if (existing.length > 0) {
            return res.status(409).json({ message: 'Lecturer already exists with this ID or email' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password.trim(), 10);

        // Insert lecturer (adjust the query based on your actual table structure)
        try {
            // Try with phone column first
            await db.query(
                'INSERT INTO lecturers (lecturer_id, name, email, phone, password_hash) VALUES (?, ?, ?, ?, ?)',
                [lecturer_id.trim(), name.trim(), email.trim(), phone.trim(), hashedPassword]
            );
        } catch (dbError) {
            if (dbError.code === 'ER_BAD_FIELD_ERROR' && dbError.message.includes('phone')) {
                // If phone column doesn't exist, try without it
                log('warn', 'Phone column not found, inserting without phone');
                await db.query(
                    'INSERT INTO lecturers (lecturer_id, name, email, password_hash) VALUES (?, ?, ?, ?)',
                    [lecturer_id.trim(), name.trim(), email.trim(), hashedPassword]
                );
            } else {
                throw dbError; // Re-throw if it's a different error
            }
        }

        log('info', 'Lecturer registered successfully');
        return res.status(201).json({ message: 'Lecturer registered successfully' });

    } catch (error) {
        log('error', 'Lecturer registration error', error);
        return res.status(500).json({ 
            message: 'Database error during lecturer registration',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}));
// Main registration handler
const handleRegistration = asyncHandler(async (req, res) => {
    log('info', 'Processing registration', {
        body: req.body,
        hasFile: !!req.file
    });

    const { userType } = req.body;

    if (!userType) {
        log('error', 'No userType provided', {
            bodyKeys: Object.keys(req.body),
            body: req.body
        });
        return res.status(400).json({ 
            message: 'userType is required',
            receivedFields: Object.keys(req.body),
            receivedData: req.body
        });
    }

    if (!['student', 'lecturer'].includes(userType)) {
        return res.status(400).json({ message: 'Invalid user type' });
    }

    if (userType === 'student') {
        return handleStudentRegistration(req, res);
    } else {
        return handleLecturerRegistration(req, res);
    }
});

// Student registration handler
const handleStudentRegistration = asyncHandler(async (req, res) => {
    log('info', 'Processing student registration');
    
    const { name, matNo, email, phone } = req.body;
    const faceFile = req.file;
    
    if (!name || !matNo || !email || !phone || !faceFile) {
        return res.status(400).json({
            message: 'All fields and face scan are required for student registration',
            missing: {
                name: !name,
                matNo: !matNo,
                email: !email,
                phone: !phone,
                faceScan: !faceFile
            },
            received: req.body
        });
    }

    try {
        const [existing] = await db.query(
            'SELECT id FROM students WHERE mat_no = ? OR email = ?', 
            [matNo.trim(), email.trim()]
        );

        if (existing.length > 0) {
            return res.status(409).json({ message: 'Student already exists' });
        }

        await db.query(
            'INSERT INTO students (mat_no, name, email, phone, face_scan_path) VALUES (?, ?, ?, ?, ?)',
            [matNo.trim(), name.trim(), email.trim(), phone.trim(), faceFile.path]
        );

        log('info', 'Student registered successfully');
        return res.status(201).json({ message: 'Student registered successfully' });

    } catch (error) {
        log('error', 'Student registration error', error);
        return res.status(500).json({ message: 'Database error during student registration' });
    }
});


// --- LOGIN ROUTE ---
app.post('/api/login', asyncHandler(async (req, res) => {
    const { userType, matNo, email, password } = req.body;
    log('info', 'Login attempt', { userType, matNo, email: email ? '[PROVIDED]' : '[NOT PROVIDED]' });
    
    if (!['student', 'lecturer', 'admin'].includes(userType)) {
        log('warn', 'Login failed: Invalid user type', userType);
        return res.status(400).json({ message: 'Invalid user type' });
    }

    if (userType === 'student') {
        if (!matNo) {
            log('warn', 'Student login failed: No matriculation number');
            return res.status(400).json({ message: 'Matriculation number is required' });
        }

        const [students] = await db.query(
            'SELECT * FROM students WHERE mat_no = ?', 
            [matNo.trim()]
        );
        
        if (students.length === 0) {
            log('warn', 'Student login failed: Not found', { matNo });
            return res.status(404).json({ message: 'Student not found' });
        }
        
        const student = students[0];
        const token = jwt.sign(
            { id: student.id, type: 'student', matNo: student.mat_no }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );
        
        // Remove sensitive data
        delete student.face_scan_path;
        
        log('info', 'Student login successful', { matNo, studentId: student.id });
        res.json({ 
            message: 'Login successful', 
            token, 
            user: student 
        });

    } else { // lecturer or admin
        const validationError = validateInput(req.body, ['email', 'password']);
        if (validationError) {
            log('warn', 'Login failed: Validation error', validationError);
            return res.status(400).json({ message: validationError });
        }

        const table = userType === 'lecturer' ? 'lecturers' : 'admins';
        const [users] = await db.query(
            `SELECT * FROM ${table} WHERE email = ?`, 
            [email.trim()]
        );
        
        if (users.length === 0) {
            log('warn', 'Login failed: User not found', { userType, email });
            return res.status(404).json({ message: 'User not found' });
        }
        
        const user = users[0];
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!isValidPassword) {
            log('warn', 'Login failed: Invalid password', { userType, email });
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        
        const token = jwt.sign(
            { 
                id: user.id, 
                type: userType,
                email: user.email 
            }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );
        
        // Remove sensitive data
        delete user.password_hash;
        
        log('info', 'Login successful', { userType, email, userId: user.id });
        res.json({ 
            message: 'Login successful', 
            token, 
            user 
        });
    }
}));
// *** NEW ROUTE FOR STUDENT FACE LOGIN ***
app.post('/api/login/student', asyncHandler(async (req, res) => {
    const { matNo } = req.body;
    if (!matNo) {
        return res.status(400).json({ message: 'Matriculation number is required' });
    }
    const [students] = await db.query('SELECT * FROM students WHERE mat_no = ?', [matNo.trim()]);
    if (students.length === 0) {
        return res.status(404).json({ message: 'Student not found.' });
    }
    const student = students[0];
    const token = jwt.sign({ id: student.id, type: 'student', matNo: student.mat_no }, JWT_SECRET, { expiresIn: '5m' });
    
    res.json({
        faceScanPath: student.face_scan_path,
        token: token,
        user: { id: student.id, name: student.name, mat_no: student.mat_no }
    });
}));
// --- PROTECTED ROUTES ---

// Create course route
app.post('/api/courses', verifyToken, asyncHandler(async (req, res) => {
    if (req.user.type !== 'lecturer') {
        log('warn', 'Course creation denied: Not a lecturer', { userId: req.user.id, userType: req.user.type });
        return res.status(403).json({ message: 'Access denied: Lecturers only' });
    }
    
    const { courseCode, courseTitle } = req.body;
    const validationError = validateInput(req.body, ['courseCode', 'courseTitle']);
    if (validationError) {
        log('warn', 'Course creation failed: Validation error', validationError);
        return res.status(400).json({ message: validationError });
    }

    try {
        // Check if course already exists
        const [existing] = await db.query(
            'SELECT id FROM courses WHERE course_code = ? AND lecturer_id = ?',
            [courseCode.trim(), req.user.id]
        );

        if (existing.length > 0) {
            return res.status(409).json({ message: 'Course with this code already exists' });
        }

        await db.query(
            'INSERT INTO courses (course_code, course_title, lecturer_id) VALUES (?, ?, ?)',
            [courseCode.trim(), courseTitle.trim(), req.user.id]
        );
        
        log('info', 'Course created successfully', { courseCode, lecturerId: req.user.id });
        res.status(201).json({ message: 'Course created successfully' });
    } catch (error) {
        log('error', 'Course creation error', error);
        return res.status(500).json({ message: 'Database error during course creation' });
    }
}));
// --- MISSING ROUTES TO ADD TO SERVER.JS ---

// Get all courses for a lecturer
app.get('/api/courses', verifyToken, asyncHandler(async (req, res) => {
    if (req.user.type !== 'lecturer') {
        log('warn', 'Course listing access denied: Not a lecturer', { userId: req.user.id, userType: req.user.type });
        return res.status(403).json({ message: 'Access denied: Lecturers only' });
    }
    
    try {
        const [courses] = await db.query(`
            SELECT 
                id,
                course_code, 
                course_title, 
                created_at,
                lecturer_id
            FROM courses 
            WHERE lecturer_id = ?
            ORDER BY course_code ASC
        `, [req.user.id]);
        
        log('info', 'Courses retrieved for lecturer', { lecturerId: req.user.id, courseCount: courses.length });
        res.json(courses);
        
    } catch (error) {
        log('error', 'Course listing error', {
            error: error.message,
            lecturerId: req.user.id
        });
        
        return res.status(500).json({ 
            message: 'Database error while fetching courses',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
}));

// Get all attendance records for a course (general endpoint)
app.get('/api/attendance/:courseId', verifyToken, asyncHandler(async (req, res) => {
    if (req.user.type !== 'lecturer') {
        log('warn', 'Attendance records access denied: Not a lecturer', { userId: req.user.id, userType: req.user.type });
        return res.status(403).json({ message: 'Access denied: Lecturers only' });
    }

    const { courseId } = req.params;
    
    if (!courseId) {
        log('warn', 'Attendance records failed: Missing courseId');
        return res.status(400).json({ message: 'courseId parameter is required' });
    }
    
    try {
        // Verify the lecturer owns this course
        const [courseCheck] = await db.query(`
            SELECT id FROM courses WHERE id = ? AND lecturer_id = ?
        `, [courseId, req.user.id]);
        
        if (courseCheck.length === 0) {
            log('warn', 'Course access denied', { courseId, lecturerId: req.user.id });
            return res.status(403).json({ message: 'Access denied: Course not found or not owned by lecturer' });
        }
        
        // Get all attendance records for this course
        const [records] = await db.query(`
            SELECT 
                ar.id,
                ar.marked_at,
                s.name as student_name, 
                s.mat_no,
                s.id as student_id,
                ar.course_id,
                c.course_code,
                c.course_title,
                DATE(ar.marked_at) as attendance_date,
                TIME(ar.marked_at) as attendance_time
            FROM attendance_records ar 
            JOIN students s ON ar.student_id = s.id 
            JOIN courses c ON ar.course_id = c.id
            WHERE ar.course_id = ?
            ORDER BY ar.marked_at DESC
        `, [courseId]);
        
        log('info', 'Attendance records retrieved', { courseId, recordCount: records.length });
        res.json(records);
        
    } catch (error) {
        log('error', 'Attendance records query error', {
            error: error.message,
            courseId: courseId,
            userId: req.user.id
        });
        
        return res.status(500).json({ 
            message: 'Database error while fetching attendance records',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
}));

// Get student's attendance records
app.get('/api/student/attendance', verifyToken, asyncHandler(async (req, res) => {
    if (req.user.type !== 'student') {
        log('warn', 'Student attendance access denied: Not a student', { userId: req.user.id, userType: req.user.type });
        return res.status(403).json({ message: 'Access denied: Students only' });
    }
    
    try {
        const [records] = await db.query(`
            SELECT 
                ar.id,
                ar.marked_at,
                ar.course_id,
                c.course_code,
                c.course_title,
                DATE(ar.marked_at) as attendance_date,
                TIME(ar.marked_at) as attendance_time
            FROM attendance_records ar 
            JOIN courses c ON ar.course_id = c.id
            WHERE ar.student_id = ?
            ORDER BY ar.marked_at DESC
        `, [req.user.id]);
        
        log('info', 'Student attendance records retrieved', { studentId: req.user.id, recordCount: records.length });
        res.json(records);
        
    } catch (error) {
        log('error', 'Student attendance query error', {
            error: error.message,
            studentId: req.user.id
        });
        
        return res.status(500).json({ 
            message: 'Database error while fetching student attendance',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
}));

// Get active attendance codes (for debugging - remove in production)
app.get('/api/debug/codes', verifyToken, asyncHandler(async (req, res) => {
    if (req.user.type !== 'lecturer' && process.env.NODE_ENV !== 'development') {
        return res.status(403).json({ message: 'Access denied' });
    }
    
    try {
        const [codes] = await db.query(`
            SELECT 
                code,
                course_id,
                expires_at,
                UTC_TIMESTAMP() as current_time,
                TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), expires_at) as seconds_left,
                lecturer_lat,
                lecturer_lon
            FROM attendance_codes 
            WHERE expires_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 HOUR)
            ORDER BY expires_at DESC
        `);
        
        res.json({
            timestamp: new Date().toISOString(),
            codes: codes
        });
        
    } catch (error) {
        log('error', 'Debug codes query error', error);
        res.status(500).json({ message: 'Database error' });
    }
}));

// Health check with database status
app.get('/api/health/db', asyncHandler(async (req, res) => {
    try {
        const [result] = await db.query('SELECT UTC_TIMESTAMP() as db_time, 1 as status');
        
        res.json({
            status: 'ok',
            database: 'connected',
            serverTime: new Date().toISOString(),
            databaseTime: result[0].db_time,
            uptime: process.uptime()
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            database: 'disconnected',
            error: error.message,
            serverTime: new Date().toISOString()
        });
    }
}));

// Generate attendance code - FIXED VERSION
app.post('/api/generate-code', verifyToken, asyncHandler(async (req, res) => {
    if (req.user.type !== 'lecturer') {
        log('warn', 'Code generation denied: Not a lecturer', { userId: req.user.id, userType: req.user.type });
        return res.status(403).json({ message: 'Access denied: Lecturers only' });
    }
    
    const { courseId, lat, lon } = req.body;
    const validationError = validateInput(req.body, ['courseId', 'lat', 'lon']);
    if (validationError) {
        log('warn', 'Code generation failed: Validation error', validationError);
        return res.status(400).json({ message: validationError });
    }

    try {
        // Generate unique 6-character code
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        // FIXED: Use UTC timestamps consistently
        const [result] = await db.query(`
            INSERT INTO attendance_codes (code, course_id, lecturer_lat, lecturer_lon, expires_at) 
            VALUES (?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE))
        `, [code, parseInt(courseId, 10), parseFloat(lat), parseFloat(lon)]);
        
        // Get the actual expiration time from the database
        const [codeInfo] = await db.query(`
            SELECT 
                expires_at,
                UTC_TIMESTAMP() as current_utc,
                TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), expires_at) as seconds_until_expiry
            FROM attendance_codes 
            WHERE id = ?
        `, [result.insertId]);
        
        const dbInfo = codeInfo[0];
        const expiresAt = new Date(dbInfo.expires_at);
        
        log('info', 'Attendance code generated with timezone info', { 
            code, 
            courseId,
            serverTime: new Date().toISOString(),
            dbCurrentTime: dbInfo.current_utc,
            dbExpiresAt: dbInfo.expires_at,
            secondsUntilExpiry: dbInfo.seconds_until_expiry,
            insertId: result.insertId 
        });
        
        res.json({ 
            code, 
            expiresAt: expiresAt.toISOString(),
            message: 'Attendance code generated successfully',
            debug: process.env.NODE_ENV === 'development' ? {
                serverTime: new Date().toISOString(),
                dbTime: dbInfo.current_utc,
                secondsValid: dbInfo.seconds_until_expiry
            } : undefined
        });
        
    } catch (error) {
        log('error', 'Code generation error', error);
        
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(400).json({ message: 'Invalid course ID. Course does not exist.' });
        }
        
        return res.status(500).json({ 
            message: 'Database error during code generation',
            error: error.message
        });
    }
}));

// FIXED: Mark attendance with proper timezone handling
app.post('/api/mark-attendance', verifyToken, asyncHandler(async (req, res) => {
    if (req.user.type !== 'student') {
        log('warn', 'Attendance marking denied: Not a student', { userId: req.user.id, userType: req.user.type });
        return res.status(403).json({ message: 'Access denied: Students only' });
    }
    
    const { code, lat, lon } = req.body;
    const validationError = validateInput(req.body, ['code', 'lat', 'lon']);
    if (validationError) {
        log('warn', 'Attendance marking failed: Validation error', validationError);
        return res.status(400).json({ message: validationError });
    }

    const studentId = req.user.id;
    const cleanedCode = String(code).trim().toUpperCase();
    
    log('info', 'Processing attendance marking with timezone info', {
        code: cleanedCode,
        studentId,
        serverTime: new Date().toISOString()
    });

    try {
        // STEP 1: Check if code exists and is valid using UTC timestamps
        const [codes] = await db.query(`
            SELECT *, 
                   expires_at,
                   UTC_TIMESTAMP() as current_utc_time,
                   TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), expires_at) as seconds_left
            FROM attendance_codes 
            WHERE code = ? AND expires_at > UTC_TIMESTAMP()
        `, [cleanedCode]);
        
        // Enhanced debugging with timezone info
        const [allActiveCodes] = await db.query(`
            SELECT code, 
                   expires_at, 
                   UTC_TIMESTAMP() as current_utc_time,
                   TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), expires_at) as seconds_left
            FROM attendance_codes 
            WHERE expires_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 HOUR) 
            ORDER BY expires_at DESC 
        `);

        log('info', 'Code lookup results with timezone info', { 
            searchedFor: cleanedCode,
            foundMatches: codes.length,
            serverTime: new Date().toISOString(),
            allRecentCodes: allActiveCodes.map(c => ({
                code: c.code,
                expires_at: c.expires_at,
                current_utc_time: c.current_utc_time,
                seconds_left: c.seconds_left,
                exactMatch: c.code === cleanedCode
            }))
        });
        
        if (codes.length === 0) {
         // server.js line 618
            const [codes] = await db.query(`
               SELECT *, 
                 expires_at,
                 UTC_TIMESTAMP() as current_utc_time,
                 TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), expires_at) as seconds_left
                 FROM attendance_codes 
                 WHERE code = ? AND expires_at > UTC_TIMESTAMP()
        `, [cleanedCode]);
            
            if (expiredCodes.length > 0) {
                const expiredCode = expiredCodes[0];
                const minutesExpired = Math.floor(expiredCode.seconds_expired / 60);
                const secondsExpired = expiredCode.seconds_expired % 60;
                
                log('warn', 'Attendance marking failed: Code expired', { 
                    code: cleanedCode, 
                    studentId,
                    expiredAt: expiredCode.expires_at,
                    currentTime: expiredCode.current_utc_time,
                    secondsExpired: expiredCode.seconds_expired
                });
                
                return res.status(400).json({ 
                    message: `Attendance code expired ${minutesExpired} minutes and ${secondsExpired} seconds ago`,
                    expiredAt: expiredCode.expires_at,
                    currentTime: expiredCode.current_utc_time
                });
            } else {
                return res.status(400).json({ 
                    message: 'Invalid attendance code. Please check the code and try again.'
                });
            }
        }
        
        const validCode = codes[0];
        log('info', 'Valid code found', { 
            code: cleanedCode, 
            courseId: validCode.course_id,
            secondsLeft: validCode.seconds_left,
            expiresAt: validCode.expires_at
        });
        
        // Continue with distance check and attendance marking...
        const distance = getDistance(
            parseFloat(lat), 
            parseFloat(lon), 
            validCode.lecturer_lat, 
            validCode.lecturer_lon
        );
        
        const MAX_DISTANCE = 100; // meters
        if (distance > MAX_DISTANCE) {
            log('warn', 'Attendance marking failed: Too far', { 
                distance: Math.round(distance), 
                maxDistance: MAX_DISTANCE, 
                studentId,
                code: cleanedCode
            });
            return res.status(403).json({ 
                message: `You are too far from the class location (${Math.round(distance)}m away). Maximum allowed distance: ${MAX_DISTANCE}m`
            });
        }

        // Check if student already marked attendance for this course today (using UTC)
        const [existing] = await db.query(`
            SELECT id FROM attendance_records 
            WHERE student_id = ? AND course_id = ? AND DATE(CONVERT_TZ(marked_at, '+00:00', '+01:00')) = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+01:00'))
        `, [studentId, validCode.course_id]);
        
        if (existing.length > 0) {
            log('warn', 'Attendance marking failed: Already marked', { 
                studentId, 
                courseId: validCode.course_id,
                code: cleanedCode
            });
            return res.status(409).json({ message: 'Attendance already marked for today' });
        }

        // Record attendance using UTC timestamp
        const [attendanceResult] = await db.query(`
            INSERT INTO attendance_records (student_id, course_id, marked_at) 
            VALUES (?, ?, UTC_TIMESTAMP())
        `, [studentId, validCode.course_id]);
        
        log('info', 'Attendance marked successfully', { 
            studentId, 
            courseId: validCode.course_id,
            code: cleanedCode,
            distance: Math.round(distance),
            attendanceId: attendanceResult.insertId,
            markedAt: new Date().toISOString()
        });
        
        res.json({ 
            message: 'Attendance marked successfully',
            distance: Math.round(distance),
            courseId: validCode.course_id,
            markedAt: new Date().toISOString()
        });
        
    } catch (error) {
        log('error', 'Attendance marking error', {
            error: error.message,
            stack: error.stack,
            code: cleanedCode,
            studentId
        });
        return res.status(500).json({ 
            message: 'Database error during attendance marking',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
}));

// Get attendance records
// ENHANCED ATTENDANCE BACKEND WITH ORGANIZED REPORTS

// Add this new route to get attendance records grouped by date/session
app.get('/api/attendance/:courseId/sessions', verifyToken, asyncHandler(async (req, res) => {
    if (req.user.type !== 'lecturer') {
        log('warn', 'Attendance sessions access denied: Not a lecturer', { userId: req.user.id, userType: req.user.type });
        return res.status(403).json({ message: 'Access denied: Lecturers only' });
    }

    const { courseId } = req.params;
    
    if (!courseId) {
        log('warn', 'Attendance sessions failed: Missing courseId');
        return res.status(400).json({ message: 'courseId parameter is required' });
    }
    
    try {
        // Get attendance records grouped by date with session information
        const [sessions] = await db.query(`
            SELECT 
                DATE(ar.marked_at) as attendance_date,
                COUNT(ar.id) as total_students,
                MIN(ar.marked_at) as session_start,
                MAX(ar.marked_at) as session_end,
                c.course_code,
                c.course_title
            FROM attendance_records ar 
            JOIN courses c ON ar.course_id = c.id
            WHERE ar.course_id = ? 
            GROUP BY DATE(ar.marked_at), c.course_code, c.course_title
            ORDER BY attendance_date DESC
        `, [courseId]);
        
        log('info', 'Attendance sessions retrieved', { courseId, sessionCount: sessions.length });
        res.json(sessions);
        
    } catch (error) {
        log('error', 'Attendance sessions query error', {
            error: error.message,
            courseId: courseId,
            userId: req.user.id
        });
        
        if (process.env.NODE_ENV === 'development') {
            return res.status(500).json({ 
                message: 'Database error while fetching attendance sessions',
                error: error.message,
                sqlState: error.sqlState,
                code: error.code
            });
        }
        
        return res.status(500).json({ 
            message: 'Internal server error while fetching attendance sessions'
        });
    }
}));

// Enhanced route to get attendance records for a specific date/session
app.get('/api/attendance/:courseId/date/:date', verifyToken, asyncHandler(async (req, res) => {
    if (req.user.type !== 'lecturer') {
        log('warn', 'Attendance records by date access denied: Not a lecturer', { userId: req.user.id, userType: req.user.type });
        return res.status(403).json({ message: 'Access denied: Lecturers only' });
    }

    const { courseId, date } = req.params;
    
    if (!courseId || !date) {
        log('warn', 'Attendance records by date failed: Missing parameters');
        return res.status(400).json({ message: 'courseId and date parameters are required' });
    }
    
    try {
        // Get attendance records for specific course and date
        const [records] = await db.query(`
            SELECT 
                ar.id,
                ar.marked_at,
                s.name as student_name, 
                s.mat_no,
                s.id as student_id,
                ar.course_id,
                c.course_code,
                c.course_title,
                DATE(ar.marked_at) as attendance_date,
                TIME(ar.marked_at) as attendance_time
            FROM attendance_records ar 
            JOIN students s ON ar.student_id = s.id 
            JOIN courses c ON ar.course_id = c.id
            WHERE ar.course_id = ? AND DATE(ar.marked_at) = ?
            ORDER BY ar.marked_at ASC
        `, [courseId, date]);
        
        log('info', 'Attendance records by date retrieved', { courseId, date, recordCount: records.length });
        res.json(records);
        
    } catch (error) {
        log('error', 'Attendance records by date query error', {
            error: error.message,
            courseId: courseId,
            date: date,
            userId: req.user.id
        });
        
        if (process.env.NODE_ENV === 'development') {
            return res.status(500).json({ 
                message: 'Database error while fetching attendance records by date',
                error: error.message,
                sqlState: error.sqlState,
                code: error.code
            });
        }
        
        return res.status(500).json({ 
            message: 'Internal server error while fetching attendance records by date'
        });
    }
}));

// Enhanced route to get comprehensive course statistics
app.get('/api/courses/:courseId/stats', verifyToken, asyncHandler(async (req, res) => {
    if (req.user.type !== 'lecturer') {
        log('warn', 'Course stats access denied: Not a lecturer', { userId: req.user.id, userType: req.user.type });
        return res.status(403).json({ message: 'Access denied: Lecturers only' });
    }

    const { courseId } = req.params;
    
    try {
        // Get comprehensive course statistics
        const [courseInfo] = await db.query(`
            SELECT course_code, course_title FROM courses WHERE id = ? AND lecturer_id = ?
        `, [courseId, req.user.id]);

        if (courseInfo.length === 0) {
            return res.status(404).json({ message: 'Course not found or access denied' });
        }

        const [stats] = await db.query(`
            SELECT 
                COUNT(DISTINCT ar.student_id) as unique_students,
                COUNT(ar.id) as total_attendance_records,
                COUNT(DISTINCT DATE(ar.marked_at)) as total_sessions,
                MIN(DATE(ar.marked_at)) as first_session,
                MAX(DATE(ar.marked_at)) as latest_session
            FROM attendance_records ar 
            WHERE ar.course_id = ?
        `, [courseId]);

        const result = {
            course: courseInfo[0],
            statistics: stats[0]
        };
        
        log('info', 'Course statistics retrieved', { courseId, stats: result });
        res.json(result);
        
    } catch (error) {
        log('error', 'Course statistics query error', {
            error: error.message,
            courseId: courseId,
            userId: req.user.id
        });
        
        return res.status(500).json({ 
            message: 'Internal server error while fetching course statistics'
        });
    }
}));
// Add these routes to your server.js file after your existing routes
// These should be placed before the "Handle 404" section


// Handle 404
app.use((req, res) => {
    log('warn', '404 - Route not found', { url: req.url, method: req.method });
    res.status(404).json({ message: 'Route not found' });
});

// --- START SERVER ---
const server = app.listen(PORT, () => {
    log('info', `Server started successfully`, {
        port: PORT,
        uploadsDir: path.resolve(uploadsDir),
        nodeEnv: process.env.NODE_ENV || 'development'
    });
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
    log('info', `${signal} received. Shutting down gracefully...`);
    server.close(() => {
        log('info', 'Server closed');
        pool.end();
        process.exit(0);
    });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));