const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');

const JWT_SECRET = process.env.JWT_SECRET || 'your-fallback-secret';

let connectionPool;

async function getDbConnection() {
    if (!connectionPool) {
        connectionPool = mysql.createPool({
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT) || 3306,
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

module.exports = async (req, res) => {
    // Set CORS headers
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
        const { userType, matNo, email, password } = req.body;
        
        if (!userType) {
            return res.status(400).json({ message: 'User type is required' });
        }

        console.log('Login attempt for:', userType);

        const db = await getDbConnection();

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
            
            return res.status(200).json({
                message: 'Student data retrieved for face verification',
                token,
                faceScanData: student.face_scan_path,
                user: { 
                    id: student.id, 
                    name: student.name, 
                    mat_no: student.mat_no 
                }
            });

        } else if (userType === 'lecturer' || userType === 'admin') {
            if (!email || !password) {
                return res.status(400).json({ message: 'Email and password are required' });
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
            
            // Remove password hash before sending
            const userResponse = { ...user };
            delete userResponse.password_hash;
            
            return res.status(200).json({ 
                message: 'Login successful', 
                token, 
                user: userResponse 
            });
        } else {
            return res.status(400).json({ message: 'Invalid user type' });
        }

    } catch (error) {
        console.error('Login API Error:', error);
        
        // Always return JSON, never plain text
        return res.status(500).json({ 
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Database connection failed'
        });
    }
};            const token = jwt.sign(
                { id: user.id, type: userType, email: user.email }, 
                JWT_SECRET, 
                { expiresIn: '24h' }
            );
            
            const userResponse = { ...user };
            delete userResponse.password_hash;
            
            return res.status(200).json({ 
                message: 'Login successful', 
                token, 
                user: userResponse 
            });
        } else {
            return res.status(400).json({ message: 'Invalid user type' });
        }

    } catch (error) {
        console.error('Login API Error:', error);
        return res.status(500).json({ 
            message: 'Database connection failed',
            error: error.message
        });
    }
};                { id: user.id, type: userType, email: user.email }, 
                JWT_SECRET, 
                { expiresIn: '24h' }
            );
            
            const userResponse = { ...user };
            delete userResponse.password_hash;
            
            return res.status(200).json({ 
                message: 'Login successful', 
                token, 
                user: userResponse 
            });
        } else {
            return res.status(400).json({ message: 'Invalid user type' });
        }

    } catch (error) {
        console.error('Login API Error:', error);
        return res.status(500).json({ 
            message: 'Database connection failed',
            error: error.message
        });
    }
};
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
            
            // Remove password hash before sending
            const userResponse = { ...user };
            delete userResponse.password_hash;
            
            return res.status(200).json({ 
                message: 'Login successful', 
                token, 
                user: userResponse 
            });
        } else {
            return res.status(400).json({ message: 'Invalid user type' });
        }

    } catch (error) {
        console.error('Login API Error:', error);
        
        // Return proper JSON error response
        return res.status(500).json({ 
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
        });
    }
};
