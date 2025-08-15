const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../lib/db');
const { asyncHandler, validateInput, log } = require('../lib/utils');
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

const handler = asyncHandler(async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { userType, matNo, email, password } = req.body;
    log('info', 'Login attempt', { userType });

    if (userType === 'student') {
        if (!matNo) return res.status(400).json({ message: 'Matriculation number is required' });

        const [students] = await db.query('SELECT * FROM students WHERE mat_no = ?', [matNo.trim()]);
        if (students.length === 0) return res.status(404).json({ message: 'Student not found' });
        
        const student = students[0];
        const token = jwt.sign({ id: student.id, type: 'student', matNo: student.mat_no }, JWT_SECRET, { expiresIn: '24h' });
        
        // Send the Base64 data, not the path
        res.json({
            message: 'Student data retrieved for face verification',
            token,
            faceScanData: student.face_scan_path, // This is now Base64
            user: { id: student.id, name: student.name, mat_no: student.mat_no }
        });

    } else { // Lecturer or Admin
        const validationError = validateInput(req.body, ['email', 'password']);
        if (validationError) return res.status(400).json({ message: validationError });

        const table = userType === 'lecturer' ? 'lecturers' : 'admins';
        const [users] = await db.query(`SELECT * FROM ${table} WHERE email = ?`, [email.trim()]);
        if (users.length === 0) return res.status(404).json({ message: 'User not found' });

        const user = users[0];
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) return res.status(401).json({ message: 'Invalid credentials' });

        const token = jwt.sign({ id: user.id, type: userType, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
        delete user.password_hash;
        
        res.json({ message: 'Login successful', token, user });
    }
});

export default handler;