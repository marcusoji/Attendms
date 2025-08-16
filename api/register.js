// api/register.js
const bcrypt = require('bcrypt');
const multer = require('multer');
const mysql = require('mysql2/promise');

const upload = multer({ storage: multer.memoryStorage() });

let connectionPool;

async function getDbConnection() {
    if (!connectionPool) {
        connectionPool = mysql.createPool({
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT) || 3306,  // Added port
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            waitForConnections: true,
            connectionLimit: 5,
            queueLimit: 0,
            acquireTimeout: 60000,
            timeout: 60000,
            reconnect: true
        });
    }
    return connectionPool;
}

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

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        await runMiddleware(req, res, upload.single('faceScan'));

        const { userType, name, matNo, email, phone, lecturer_id, password } = req.body;
        
        if (!userType) {
            return res.status(400).json({ message: 'User type is required' });
        }

        console.log('Registration attempt for:', userType);

        const db = await getDbConnection();

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

    } catch (error) {
        console.error('Registration API Error:', error);
        return res.status(500).json({ 
            message: 'Database connection failed',
            error: error.message
        });
    }
};
            return res.status(201).json({ message: 'Student registered successfully!' });

        } else if (userType === 'lecturer') {
            if (!name || !lecturer_id || !email || !phone || !password) {
                return res.status(400).json({ 
                    message: 'All fields are required for lecturer registration',
                    received: {
                        name: !!name,
                        lecturer_id: !!lecturer_id,
                        email: !!email,
                        phone: !!phone,
                        password: !!password
                    }
                });
            }
            
            // Check for existing lecturer
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

    } catch (error) {
        console.error('Registration API Error:', error);
        
        // Return proper JSON error response
        return res.status(500).json({ 
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
        });
    }
};
