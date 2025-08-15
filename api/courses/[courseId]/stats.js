const db = require('../../../lib/db');
const { verifyToken } = require('../../../lib/auth');
const { asyncHandler } = require('../../../lib/utils');

const handler = asyncHandler(async (req, res) => {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }
    if (req.user.type !== 'lecturer') {
        return res.status(403).json({ message: 'Access denied: Lecturers only' });
    }

    // In Vercel, the dynamic part of the path is in req.query
    const { courseId } = req.query;

    const [courseInfo] = await db.query(
        'SELECT course_code, course_title FROM courses WHERE id = ? AND lecturer_id = ?',
        [courseId, req.user.id]
    );

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

    res.status(200).json(result);
});

export default verifyToken(handler);