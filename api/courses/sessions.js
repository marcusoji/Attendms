const db = require('../../lib/db');
const { verifyToken } = require('../../lib/auth');
const { asyncHandler } = require('../../lib/utils');

const handler = asyncHandler(async (req, res) => {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }
    if (req.user.type !== 'lecturer') {
        return res.status(403).json({ message: 'Access denied: Lecturers only' });
    }

    const { courseId } = req.query;
    if (!courseId) {
        return res.status(400).json({ message: 'courseId parameter is required' });
    }

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

    res.status(200).json(sessions);
});

export default verifyToken(handler);