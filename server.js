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
const { createClient } = require('@supabase/supabase-js');
dotenv.config();

// --- INITIALIZATION ---
const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
// STEP 3: Add Supabase configuration (add these to your .env file)
const supabaseUrl = process.env.SUPABASE_URL; // Your Supabase project URL
const supabaseKey = process.env.SUPABASE_ANON_KEY; // Your Supabase anon/public key
const supabase = createClient(supabaseUrl, supabaseKey);
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
app.use('/models', express.static(path.join(__dirname, 'frontend/models'))); // Serves face-api.js models
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
const storage = multer.memoryStorage(); // This ensures faceFile.buffer exists

const upload = multer({ 
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
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

// STEP 4: Replace the handleStudentRegistration function in server.js
const handleStudentRegistration = asyncHandler(async (req, res) => {
    log('info', 'Processing student registration with Supabase storage');
    
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
        // Check if student already exists
        const [existing] = await db.query(
            'SELECT id FROM students WHERE mat_no = ? OR email = ?', 
            [matNo.trim(), email.trim()]
        );

        if (existing.length > 0) {
            return res.status(409).json({ message: 'Student already exists' });
        }

        // CHANGED: Upload to Supabase instead of local storage
        const fileName = `faces/${matNo.trim()}-${Date.now()}.jpg`;
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('face-scans') // This bucket name - you'll need to create it
            .upload(fileName, faceFile.buffer, {
                contentType: faceFile.mimetype,
                upsert: false
            });

        if (uploadError) {
            log('error', 'Supabase upload failed', uploadError);
            return res.status(500).json({ message: 'Failed to upload face scan' });
        }

        // Store the Supabase file path instead of local path
        await db.query(
            'INSERT INTO students (mat_no, name, email, phone, face_scan_path) VALUES (?, ?, ?, ?, ?)',
            [matNo.trim(), name.trim(), email.trim(), phone.trim(), fileName]
        );

        log('info', 'Student registered successfully with Supabase storage');
        return res.status(201).json({ message: 'Student registered successfully' });

    } catch (error) {
        log('error', 'Student registration error', error);
        return res.status(500).json({ message: 'Database error during student registration' });
    }
});


// ADD THIS ROUTE TO YOUR SERVER.JS - IT'S COMPLETELY MISSING
// Place this BEFORE your main /api/login route (around line 450)

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
    
    // CHANGED: Download from Supabase instead of reading local file
    let faceScanData = null;
    if (student.face_scan_path) {
        try {
            const { data: fileData, error: downloadError } = await supabase.storage
                .from('face-scans')
                .download(student.face_scan_path);

            if (downloadError) {
                log('error', 'Failed to download face scan from Supabase', downloadError);
                return res.status(500).json({ message: 'Failed to load face scan data' });
            }

            // Convert blob to base64
            const buffer = await fileData.arrayBuffer();
            faceScanData = Buffer.from(buffer).toString('base64');
            
            log('info', 'Face scan data downloaded from Supabase', { matNo, fileSize: buffer.byteLength });
        } catch (fileError) {
            log('error', 'Failed to process face scan file', fileError);
            return res.status(500).json({ message: 'Failed to load face scan data' });
        }
    }
    
    if (!faceScanData) {
        log('warn', 'No face scan data available', { matNo });
        return res.status(404).json({ message: 'No face scan data found for this student' });
    }
    
    const token = jwt.sign(
        { id: student.id, type: 'student', matNo: student.mat_no }, 
        JWT_SECRET, 
        { expiresIn: '24h' }
    );
    
    log('info', 'Student login data prepared', { matNo, studentId: student.id });
    res.json({ 
        message: 'Student found, face verification required', 
        token, 
        user: {
            id: student.id,
            name: student.name,
            mat_no: student.mat_no
        },
        faceScanData: faceScanData
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

// REMOVE the duplicate student login route you have (the /api/login/student one)
// It's causing conflicts
// --- PROTECTED ROUTES ---

// Create course route
app.post('/api/courses', verifyToken, asyncHandler(async (req, res) => {
    if (req.user.type !== 'lecturer' && req.user.type !== 'admin' ) {
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
    if (req.user.type !== 'lecturer' && req.user.type !== 'admin') {
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
    if (req.user.type !== 'lecturer' && req.user.type !== 'admin') {
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
    if (req.user.type !== 'lecturer' && req.user.type !== 'admin') {
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
// ============================================
// ADMIN ROUTES - Add these to your server.js
// Place these BEFORE the "Handle 404" section
// ============================================

// Middleware to verify admin access
const verifyAdmin = (req, res, next) => {
    if (req.user.type !== 'admin') {
        log('warn', 'Admin access denied', { userId: req.user.id, userType: req.user.type });
        return res.status(403).json({ message: 'Access denied: Admins only' });
    }
    next();
};

// --- DASHBOARD STATISTICS ---

app.get('/api/admin/stats', verifyToken, verifyAdmin, asyncHandler(async (req, res) => {
    try {
        const [students] = await db.query('SELECT COUNT(*) as count FROM students');
        const [lecturers] = await db.query('SELECT COUNT(*) as count FROM lecturers');
        const [courses] = await db.query('SELECT COUNT(*) as count FROM courses');
        const [attendance] = await db.query('SELECT COUNT(*) as count FROM attendance_records');
        
        res.json({
            students: students[0].count,
            lecturers: lecturers[0].count,
            courses: courses[0].count,
            attendance: attendance[0].count
        });
        
        log('info', 'Admin stats retrieved', { adminId: req.user.id });
    } catch (error) {
        log('error', 'Admin stats error', error);
        res.status(500).json({ message: 'Failed to retrieve statistics' });
    }
}));

// --- STUDENT MANAGEMENT ---

app.get('/api/admin/students', verifyToken, verifyAdmin, asyncHandler(async (req, res) => {
    try {
        const [students] = await db.query(`
            SELECT 
                id, 
                mat_no, 
                name, 
                email, 
                phone, 
                created_at,
                (SELECT COUNT(*) FROM attendance_records WHERE student_id = students.id) as attendance_count
            FROM students 
            ORDER BY created_at DESC
        `);
        
        res.json(students);
        log('info', 'Students list retrieved', { adminId: req.user.id, count: students.length });
    } catch (error) {
        log('error', 'Students list error', error);
        res.status(500).json({ message: 'Failed to retrieve students' });
    }
}));

app.get('/api/admin/students/:id', verifyToken, verifyAdmin, asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        
        const [students] = await db.query(`
            SELECT 
                s.*,
                (SELECT COUNT(*) FROM attendance_records WHERE student_id = s.id) as total_attendance,
                (SELECT COUNT(DISTINCT course_id) FROM attendance_records WHERE student_id = s.id) as courses_attended
            FROM students s
            WHERE s.id = ?
        `, [id]);
        
        if (students.length === 0) {
            return res.status(404).json({ message: 'Student not found' });
        }
        
        const [attendance] = await db.query(`
            SELECT 
                ar.marked_at,
                c.course_code,
                c.course_title
            FROM attendance_records ar
            JOIN courses c ON ar.course_id = c.id
            WHERE ar.student_id = ?
            ORDER BY ar.marked_at DESC
            LIMIT 20
        `, [id]);
        
        res.json({
            student: students[0],
            recentAttendance: attendance
        });
        
    } catch (error) {
        log('error', 'Student details error', error);
        res.status(500).json({ message: 'Failed to retrieve student details' });
    }
}));

app.delete('/api/admin/students/:id', verifyToken, verifyAdmin, asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        
        // Delete attendance records first (foreign key constraint)
        await db.query('DELETE FROM attendance_records WHERE student_id = ?', [id]);
        
        // Delete student
        const [result] = await db.query('DELETE FROM students WHERE id = ?', [id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Student not found' });
        }
        
        log('info', 'Student deleted', { adminId: req.user.id, studentId: id });
        res.json({ message: 'Student deleted successfully' });
        
    } catch (error) {
        log('error', 'Student deletion error', error);
        res.status(500).json({ message: 'Failed to delete student' });
    }
}));

// --- LECTURER MANAGEMENT ---

app.get('/api/admin/lecturers', verifyToken, verifyAdmin, asyncHandler(async (req, res) => {
    try {
        const [lecturers] = await db.query(`
            SELECT 
                l.id, 
                l.lecturer_id,
                l.name, 
                l.email,
                l.phone,
                l.created_at,
                (SELECT COUNT(*) FROM courses WHERE lecturer_id = l.id) as course_count
            FROM lecturers l
            ORDER BY l.created_at DESC
        `);
        
        res.json(lecturers);
        log('info', 'Lecturers list retrieved', { adminId: req.user.id, count: lecturers.length });
    } catch (error) {
        log('error', 'Lecturers list error', error);
        res.status(500).json({ message: 'Failed to retrieve lecturers' });
    }
}));

app.get('/api/admin/lecturers/:id', verifyToken, verifyAdmin, asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        
        const [lecturers] = await db.query(`
            SELECT 
                l.*,
                (SELECT COUNT(*) FROM courses WHERE lecturer_id = l.id) as total_courses
            FROM lecturers l
            WHERE l.id = ?
        `, [id]);
        
        if (lecturers.length === 0) {
            return res.status(404).json({ message: 'Lecturer not found' });
        }
        
        const [courses] = await db.query(`
            SELECT 
                c.id,
                c.course_code,
                c.course_title,
                c.created_at,
                (SELECT COUNT(*) FROM attendance_records WHERE course_id = c.id) as attendance_count
            FROM courses c
            WHERE c.lecturer_id = ?
            ORDER BY c.created_at DESC
        `, [id]);
        
        res.json({
            lecturer: lecturers[0],
            courses: courses
        });
        
    } catch (error) {
        log('error', 'Lecturer details error', error);
        res.status(500).json({ message: 'Failed to retrieve lecturer details' });
    }
}));

app.delete('/api/admin/lecturers/:id', verifyToken, verifyAdmin, asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get all courses by this lecturer
        const [courses] = await db.query('SELECT id FROM courses WHERE lecturer_id = ?', [id]);
        
        // Delete attendance records for all their courses
        for (const course of courses) {
            await db.query('DELETE FROM attendance_records WHERE course_id = ?', [course.id]);
        }
        
        // Delete attendance codes
        for (const course of courses) {
            await db.query('DELETE FROM attendance_codes WHERE course_id = ?', [course.id]);
        }
        
        // Delete courses
        await db.query('DELETE FROM courses WHERE lecturer_id = ?', [id]);
        
        // Delete lecturer
        const [result] = await db.query('DELETE FROM lecturers WHERE id = ?', [id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Lecturer not found' });
        }
        
        log('info', 'Lecturer deleted', { adminId: req.user.id, lecturerId: id });
        res.json({ message: 'Lecturer and associated data deleted successfully' });
        
    } catch (error) {
        log('error', 'Lecturer deletion error', error);
        res.status(500).json({ message: 'Failed to delete lecturer' });
    }
}));

// --- COURSE MANAGEMENT ---

app.get('/api/admin/courses', verifyToken, verifyAdmin, asyncHandler(async (req, res) => {
    try {
        const [courses] = await db.query(`
            SELECT 
                c.id,
                c.course_code,
                c.course_title,
                c.created_at,
                l.name as lecturer_name,
                l.lecturer_id,
                (SELECT COUNT(*) FROM attendance_records WHERE course_id = c.id) as attendance_count,
                (SELECT COUNT(DISTINCT student_id) FROM attendance_records WHERE course_id = c.id) as unique_students
            FROM courses c
            JOIN lecturers l ON c.lecturer_id = l.id
            ORDER BY c.created_at DESC
        `);
        
        res.json(courses);
        log('info', 'Courses list retrieved', { adminId: req.user.id, count: courses.length });
    } catch (error) {
        log('error', 'Courses list error', error);
        res.status(500).json({ message: 'Failed to retrieve courses' });
    }
}));

app.get('/api/admin/courses/:id', verifyToken, verifyAdmin, asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        
        const [courses] = await db.query(`
            SELECT 
                c.*,
                l.name as lecturer_name,
                l.email as lecturer_email,
                (SELECT COUNT(*) FROM attendance_records WHERE course_id = c.id) as total_attendance,
                (SELECT COUNT(DISTINCT student_id) FROM attendance_records WHERE course_id = c.id) as unique_students,
                (SELECT COUNT(DISTINCT DATE(marked_at)) FROM attendance_records WHERE course_id = c.id) as total_sessions
            FROM courses c
            JOIN lecturers l ON c.lecturer_id = l.id
            WHERE c.id = ?
        `, [id]);
        
        if (courses.length === 0) {
            return res.status(404).json({ message: 'Course not found' });
        }
        
        const [recentAttendance] = await db.query(`
            SELECT 
                DATE(ar.marked_at) as date,
                COUNT(*) as student_count
            FROM attendance_records ar
            WHERE ar.course_id = ?
            GROUP BY DATE(ar.marked_at)
            ORDER BY date DESC
            LIMIT 10
        `, [id]);
        
        res.json({
            course: courses[0],
            recentSessions: recentAttendance
        });
        
    } catch (error) {
        log('error', 'Course details error', error);
        res.status(500).json({ message: 'Failed to retrieve course details' });
    }
}));

app.delete('/api/admin/courses/:id', verifyToken, verifyAdmin, asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        
        // Delete attendance records
        await db.query('DELETE FROM attendance_records WHERE course_id = ?', [id]);
        
        // Delete attendance codes
        await db.query('DELETE FROM attendance_codes WHERE course_id = ?', [id]);
        
        // Delete course
        const [result] = await db.query('DELETE FROM courses WHERE id = ?', [id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Course not found' });
        }
        
        log('info', 'Course deleted', { adminId: req.user.id, courseId: id });
        res.json({ message: 'Course and associated data deleted successfully' });
        
    } catch (error) {
        log('error', 'Course deletion error', error);
        res.status(500).json({ message: 'Failed to delete course' });
    }
}));

// --- REPORTS ---

app.get('/api/admin/reports/attendance', verifyToken, verifyAdmin, asyncHandler(async (req, res) => {
    try {
        const { startDate, endDate, courseId } = req.query;
        
        let query = `
            SELECT 
                DATE(ar.marked_at) as date,
                c.course_code,
                c.course_title,
                COUNT(*) as attendance_count,
                COUNT(DISTINCT ar.student_id) as unique_students
            FROM attendance_records ar
            JOIN courses c ON ar.course_id = c.id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (startDate) {
            query += ' AND DATE(ar.marked_at) >= ?';
            params.push(startDate);
        }
        
        if (endDate) {
            query += ' AND DATE(ar.marked_at) <= ?';
            params.push(endDate);
        }
        
        if (courseId) {
            query += ' AND c.id = ?';
            params.push(courseId);
        }
        
        query += ' GROUP BY DATE(ar.marked_at), c.id ORDER BY date DESC';
        
        const [results] = await db.query(query, params);
        
        res.json(results);
        log('info', 'Attendance report generated', { adminId: req.user.id });
        
    } catch (error) {
        log('error', 'Attendance report error', error);
        res.status(500).json({ message: 'Failed to generate report' });
    }
}));

app.get('/api/admin/reports/activity', verifyToken, verifyAdmin, asyncHandler(async (req, res) => {
    try {
        const [codes] = await db.query(`
            SELECT 
                ac.code,
                ac.created_at,
                ac.expires_at,
                c.course_code,
                c.course_title,
                l.name as lecturer_name,
                CASE 
                    WHEN ac.expires_at > UTC_TIMESTAMP() THEN 'Active'
                    ELSE 'Expired'
                END as status
            FROM attendance_codes ac
            JOIN courses c ON ac.course_id = c.id
            JOIN lecturers l ON c.lecturer_id = l.id
            ORDER BY ac.created_at DESC
            LIMIT 50
        `);
        
        const [recentAttendance] = await db.query(`
            SELECT 
                ar.marked_at,
                s.name as student_name,
                s.mat_no,
                c.course_code
            FROM attendance_records ar
            JOIN students s ON ar.student_id = s.id
            JOIN courses c ON ar.course_id = c.id
            ORDER BY ar.marked_at DESC
            LIMIT 50
        `);
        
        res.json({
            codes: codes,
            recentAttendance: recentAttendance
        });
        
        log('info', 'Activity report generated', { adminId: req.user.id });
        
    } catch (error) {
        log('error', 'Activity report error', error);
        res.status(500).json({ message: 'Failed to generate activity report' });
    }
}));

// --- SYSTEM MANAGEMENT ---

app.delete('/api/admin/system/clear-expired-codes', verifyToken, verifyAdmin, asyncHandler(async (req, res) => {
    try {
        const [result] = await db.query('DELETE FROM attendance_codes WHERE expires_at < UTC_TIMESTAMP()');
        
        log('info', 'Expired codes cleared', { adminId: req.user.id, deletedCount: result.affectedRows });
        res.json({ 
            message: 'Expired codes cleared successfully', 
            deletedCount: result.affectedRows 
        });
        
    } catch (error) {
        log('error', 'Clear expired codes error', error);
        res.status(500).json({ message: 'Failed to clear expired codes' });
    }
}));

app.get('/api/admin/system/active-codes', verifyToken, verifyAdmin, asyncHandler(async (req, res) => {
    try {
        const [codes] = await db.query(`
            SELECT 
                ac.code,
                ac.expires_at,
                c.course_code,
                c.course_title,
                l.name as lecturer_name,
                TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), ac.expires_at) as seconds_remaining
            FROM attendance_codes ac
            JOIN courses c ON ac.course_id = c.id
            JOIN lecturers l ON c.lecturer_id = l.id
            WHERE ac.expires_at > UTC_TIMESTAMP()
            ORDER BY ac.expires_at ASC
        `);
        
        res.json(codes);
        
    } catch (error) {
        log('error', 'Active codes query error', error);
        res.status(500).json({ message: 'Failed to retrieve active codes' });
    }
}));
// ============================================
// CSV EXPORT BACKEND ROUTES
// Add these to your server.js (with other admin routes)
// ============================================

// --- EXPORT: All Attendance Records (Detailed) ---
app.get('/api/admin/export/attendance-records', verifyToken, verifyAdmin, asyncHandler(async (req, res) => {
    try {
        log('info', 'Exporting all attendance records', { adminId: req.user.id });
        
        const [records] = await db.query(`
            SELECT 
                ar.id,
                s.name as student_name,
                s.mat_no,
                c.course_code,
                c.course_title,
                l.name as lecturer_name,
                ar.marked_at,
                DATE(ar.marked_at) as attendance_date,
                TIME(ar.marked_at) as attendance_time
            FROM attendance_records ar
            JOIN students s ON ar.student_id = s.id
            JOIN courses c ON ar.course_id = c.id
            JOIN lecturers l ON c.lecturer_id = l.id
            ORDER BY ar.marked_at DESC
        `);
        
        log('info', 'Attendance records exported', { 
            adminId: req.user.id, 
            recordCount: records.length 
        });
        
        res.json(records);
        
    } catch (error) {
        log('error', 'Attendance records export error', error);
        res.status(500).json({ message: 'Failed to export attendance records' });
    }
}));

// --- EXPORT: Attendance by Date Range ---
app.get('/api/admin/export/attendance-range', verifyToken, verifyAdmin, asyncHandler(async (req, res) => {
    try {
        const { startDate, endDate, courseId } = req.query;
        
        let query = `
            SELECT 
                ar.id,
                s.name as student_name,
                s.mat_no,
                c.course_code,
                c.course_title,
                l.name as lecturer_name,
                ar.marked_at,
                DATE(ar.marked_at) as attendance_date,
                TIME(ar.marked_at) as attendance_time
            FROM attendance_records ar
            JOIN students s ON ar.student_id = s.id
            JOIN courses c ON ar.course_id = c.id
            JOIN lecturers l ON c.lecturer_id = l.id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (startDate) {
            query += ' AND DATE(ar.marked_at) >= ?';
            params.push(startDate);
        }
        
        if (endDate) {
            query += ' AND DATE(ar.marked_at) <= ?';
            params.push(endDate);
        }
        
        if (courseId) {
            query += ' AND c.id = ?';
            params.push(courseId);
        }
        
        query += ' ORDER BY ar.marked_at DESC';
        
        const [records] = await db.query(query, params);
        
        log('info', 'Date range export completed', {
            adminId: req.user.id,
            startDate,
            endDate,
            courseId,
            recordCount: records.length
        });
        
        res.json(records);
        
    } catch (error) {
        log('error', 'Date range export error', error);
        res.status(500).json({ message: 'Failed to export date range' });
    }
}));

// --- EXPORT: Student Statistics Report ---
app.get('/api/admin/export/student-stats', verifyToken, verifyAdmin, asyncHandler(async (req, res) => {
    try {
        const [stats] = await db.query(`
            SELECT 
                s.id,
                s.mat_no,
                s.name,
                s.email,
                s.phone,
                COUNT(ar.id) as total_attendance,
                COUNT(DISTINCT ar.course_id) as courses_attended,
                COUNT(DISTINCT DATE(ar.marked_at)) as days_attended,
                MIN(ar.marked_at) as first_attendance,
                MAX(ar.marked_at) as last_attendance,
                s.created_at as registration_date
            FROM students s
            LEFT JOIN attendance_records ar ON s.id = ar.student_id
            GROUP BY s.id, s.mat_no, s.name, s.email, s.phone, s.created_at
            ORDER BY s.name ASC
        `);
        
        log('info', 'Student statistics exported', {
            adminId: req.user.id,
            studentCount: stats.length
        });
        
        res.json(stats);
        
    } catch (error) {
        log('error', 'Student stats export error', error);
        res.status(500).json({ message: 'Failed to export student statistics' });
    }
}));

// --- EXPORT: Course Statistics Report ---
app.get('/api/admin/export/course-stats', verifyToken, verifyAdmin, asyncHandler(async (req, res) => {
    try {
        const [stats] = await db.query(`
            SELECT 
                c.id,
                c.course_code,
                c.course_title,
                l.name as lecturer_name,
                l.lecturer_id,
                l.email as lecturer_email,
                COUNT(DISTINCT ar.student_id) as unique_students,
                COUNT(ar.id) as total_attendance,
                COUNT(DISTINCT DATE(ar.marked_at)) as total_sessions,
                MIN(DATE(ar.marked_at)) as first_session,
                MAX(DATE(ar.marked_at)) as last_session,
                c.created_at as course_created
            FROM courses c
            JOIN lecturers l ON c.lecturer_id = l.id
            LEFT JOIN attendance_records ar ON c.id = ar.course_id
            GROUP BY c.id, c.course_code, c.course_title, l.name, l.lecturer_id, l.email, c.created_at
            ORDER BY c.course_code ASC
        `);
        
        log('info', 'Course statistics exported', {
            adminId: req.user.id,
            courseCount: stats.length
        });
        
        res.json(stats);
        
    } catch (error) {
        log('error', 'Course stats export error', error);
        res.status(500).json({ message: 'Failed to export course statistics' });
    }
}));

// --- EXPORT: Daily Attendance Summary ---
app.get('/api/admin/export/daily-summary', verifyToken, verifyAdmin, asyncHandler(async (req, res) => {
    try {
        const [summary] = await db.query(`
            SELECT 
                DATE(ar.marked_at) as date,
                c.course_code,
                c.course_title,
                l.name as lecturer_name,
                COUNT(ar.id) as attendance_count,
                COUNT(DISTINCT ar.student_id) as unique_students,
                MIN(TIME(ar.marked_at)) as first_marked,
                MAX(TIME(ar.marked_at)) as last_marked
            FROM attendance_records ar
            JOIN courses c ON ar.course_id = c.id
            JOIN lecturers l ON c.lecturer_id = l.id
            GROUP BY DATE(ar.marked_at), c.id, c.course_code, c.course_title, l.name
            ORDER BY date DESC, c.course_code ASC
        `);
        
        log('info', 'Daily summary exported', {
            adminId: req.user.id,
            recordCount: summary.length
        });
        
        res.json(summary);
        
    } catch (error) {
        log('error', 'Daily summary export error', error);
        res.status(500).json({ message: 'Failed to export daily summary' });
    }
}));

// --- EXPORT: Lecturer Performance Report ---
app.get('/api/admin/export/lecturer-performance', verifyToken, verifyAdmin, asyncHandler(async (req, res) => {
    try {
        const [performance] = await db.query(`
            SELECT 
                l.id,
                l.lecturer_id,
                l.name as lecturer_name,
                l.email,
                COUNT(DISTINCT c.id) as total_courses,
                COUNT(DISTINCT ar.student_id) as total_students_taught,
                COUNT(ar.id) as total_attendance_records,
                COUNT(DISTINCT DATE(ar.marked_at)) as total_sessions_held,
                MIN(ar.marked_at) as first_session,
                MAX(ar.marked_at) as last_session,
                l.created_at as joined_date
            FROM lecturers l
            LEFT JOIN courses c ON l.id = c.lecturer_id
            LEFT JOIN attendance_records ar ON c.id = ar.course_id
            GROUP BY l.id, l.lecturer_id, l.name, l.email, l.created_at
            ORDER BY l.name ASC
        `);
        
        log('info', 'Lecturer performance exported', {
            adminId: req.user.id,
            lecturerCount: performance.length
        });
        
        res.json(performance);
        
    } catch (error) {
        log('error', 'Lecturer performance export error', error);
        res.status(500).json({ message: 'Failed to export lecturer performance' });
    }
}));

// --- EXPORT: Attendance Codes History ---
app.get('/api/admin/export/codes-history', verifyToken, verifyAdmin, asyncHandler(async (req, res) => {
    try {
        const [codes] = await db.query(`
            SELECT 
                ac.id,
                ac.code,
                c.course_code,
                c.course_title,
                l.name as lecturer_name,
                ac.created_at as generated_at,
                ac.expires_at,
                CASE 
                    WHEN ac.expires_at > UTC_TIMESTAMP() THEN 'Active'
                    ELSE 'Expired'
                END as status,
                TIMESTAMPDIFF(MINUTE, ac.created_at, ac.expires_at) as validity_minutes,
                (SELECT COUNT(*) 
                 FROM attendance_records ar 
                 WHERE ar.course_id = ac.course_id 
                 AND DATE(ar.marked_at) = DATE(ac.created_at)) as students_marked
            FROM attendance_codes ac
            JOIN courses c ON ac.course_id = c.id
            JOIN lecturers l ON c.lecturer_id = l.id
            ORDER BY ac.created_at DESC
        `);
        
        log('info', 'Codes history exported', {
            adminId: req.user.id,
            codeCount: codes.length
        });
        
        res.json(codes);
        
    } catch (error) {
        log('error', 'Codes history export error', error);
        res.status(500).json({ message: 'Failed to export codes history' });
    }
}));

// --- EXPORT: Complete System Backup (All Data) ---
app.get('/api/admin/export/full-backup', verifyToken, verifyAdmin, asyncHandler(async (req, res) => {
    try {
        log('info', 'Full system backup initiated', { adminId: req.user.id });
        
        // Get all data
        const [students] = await db.query('SELECT * FROM students');
        const [lecturers] = await db.query('SELECT id, lecturer_id, name, email, phone, created_at FROM lecturers');
        const [courses] = await db.query('SELECT * FROM courses');
        const [attendance] = await db.query('SELECT * FROM attendance_records');
        const [codes] = await db.query('SELECT * FROM attendance_codes');
        
        const backup = {
            exportDate: new Date().toISOString(),
            exportedBy: req.user.email || req.user.id,
            statistics: {
                students: students.length,
                lecturers: lecturers.length,
                courses: courses.length,
                attendance: attendance.length,
                codes: codes.length
            },
            data: {
                students,
                lecturers,
                courses,
                attendance_records: attendance,
                attendance_codes: codes
            }
        };
        
        log('info', 'Full backup completed', {
            adminId: req.user.id,
            totalRecords: students.length + lecturers.length + courses.length + attendance.length + codes.length
        });
        
        res.json(backup);
        
    } catch (error) {
        log('error', 'Full backup error', error);
        res.status(500).json({ message: 'Failed to create full backup' });
    }
}));

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