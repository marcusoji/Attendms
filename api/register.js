const bcrypt = require('bcrypt');
const multer = require('multer');
const db = require('../lib/db');
const { asyncHandler, log } = require('../lib/utils');

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

const handler = asyncHandler(async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    await runMiddleware(req, res, upload.single('faceScan'));

    const { userType, name, matNo, email, phone, lecturer_id, password } = req.body;
    log('info', 'Registration attempt', { userType });

    if (userType === 'student') {
        const faceScanFile = req.file;
        if (!name || !matNo || !email || !phone || !faceScanFile) {
            return res.status(400).json({ message: 'All fields and face scan are required for student registration' });
        }
        
        const [existing] = await db.query('SELECT id FROM students WHERE mat_no = ? OR email = ?', [matNo.trim(), email.trim()]);
        if (existing.length > 0) {
            return res.status(409).json({ message: 'Student with this Matriculation No. or Email already exists' });
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
            return res.status(400).json({ message: 'All fields are required for lecturer registration' });
        }
        
        const [existing] = await db.query('SELECT id FROM lecturers WHERE lecturer_id = ? OR email = ?', [lecturer_id.trim(), email.trim()]);
        if (existing.length > 0) {
            return res.status(409).json({ message: 'Lecturer with this ID or Email already exists' });
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
});

// Vercel needs this config for multipart form data
export const config = {
    api: {
        bodyParser: false,
    },
};

export default handler;