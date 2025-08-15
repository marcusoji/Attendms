const db = require('../lib/db');
const { verifyToken } = require('../lib/auth');
const { asyncHandler, validateInput, getDistance, log } = require('../lib/utils');

const handler = asyncHandler(async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });
    if (req.user.type !== 'student') return res.status(403).json({ message: 'Access denied' });

    const { code, lat, lon } = req.body;
    const validationError = validateInput(req.body, ['code', 'lat', 'lon']);
    if (validationError) return res.status(400).json({ message: validationError });

    const studentId = req.user.id;
    const cleanedCode = String(code).trim().toUpperCase();

    const [codes] = await db.query(
        'SELECT * FROM attendance_codes WHERE code = ? AND expires_at > UTC_TIMESTAMP()',
        [cleanedCode]
    );

    if (codes.length === 0) {
        log('warn', 'Attendance failed: Invalid or expired code', { code: cleanedCode });
        return res.status(400).json({ message: 'Invalid or expired attendance code' });
    }

    const validCode = codes[0];
    const distance = getDistance(parseFloat(lat), parseFloat(lon), validCode.lecturer_lat, validCode.lecturer_lon);
    const MAX_DISTANCE = 100; // meters

    if (distance > MAX_DISTANCE) {
        return res.status(403).json({ message: `You are too far from the class location (${Math.round(distance)}m away)` });
    }

    const [existing] = await db.query(
        `SELECT id FROM attendance_records WHERE student_id = ? AND course_id = ? AND DATE(marked_at) = CURDATE()`,
        [studentId, validCode.course_id]
    );

    if (existing.length > 0) {
        return res.status(409).json({ message: 'Attendance already marked for this course today' });
    }

    await db.query(
        'INSERT INTO attendance_records (student_id, course_id, marked_at) VALUES (?, ?, UTC_TIMESTAMP())',
        [studentId, validCode.course_id]
    );

    res.json({ message: 'Attendance marked successfully' });
});

export default verifyToken(handler);