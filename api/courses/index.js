const db = require('../../lib/db');
const { verifyToken } = require('../../lib/auth');
const { asyncHandler, validateInput } = require('../../lib/utils');

const handler = asyncHandler(async (req, res) => {
    if (req.user.type !== 'lecturer') {
        return res.status(403).json({ message: 'Access denied: Lecturers only' });
    }

    // Create a new course
    if (req.method === 'POST') {
        const { courseCode, courseTitle } = req.body;
        const validationError = validateInput(req.body, ['courseCode', 'courseTitle']);
        if (validationError) return res.status(400).json({ message: validationError });
        
        const [existing] = await db.query('SELECT id FROM courses WHERE course_code = ? AND lecturer_id = ?', [courseCode.trim(), req.user.id]);
        if (existing.length > 0) return res.status(409).json({ message: 'Course with this code already exists' });
        
        await db.query('INSERT INTO courses (course_code, course_title, lecturer_id) VALUES (?, ?, ?)', [courseCode.trim(), courseTitle.trim(), req.user.id]);
        return res.status(201).json({ message: 'Course created successfully' });
    }

    // Get all courses for the lecturer
    if (req.method === 'GET') {
        const [courses] = await db.query('SELECT id, course_code, course_title FROM courses WHERE lecturer_id = ? ORDER BY course_code ASC', [req.user.id]);
        return res.json(courses);
    }

    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
});

export default verifyToken(handler);