const db = require('../lib/db');
const { verifyToken } = require('../lib/auth');
const { asyncHandler, validateInput } = require('../lib/utils');

const handler = asyncHandler(async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });
    if (req.user.type !== 'lecturer') return res.status(403).json({ message: 'Access denied' });

    const { courseId, lat, lon } = req.body;
    const validationError = validateInput(req.body, ['courseId', 'lat', 'lon']);
    if (validationError) return res.status(400).json({ message: validationError });

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    await db.query(
        `INSERT INTO attendance_codes (code, course_id, lecturer_lat, lecturer_lon, expires_at) 
         VALUES (?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE))`,
        [code, parseInt(courseId), parseFloat(lat), parseFloat(lon)]
    );

    res.json({ code, message: 'Code generated successfully' });
});

export default verifyToken(handler);
