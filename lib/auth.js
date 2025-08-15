const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

const verifyToken = (handler) => async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(403).json({ message: "Token required" });
        }

        const token = authHeader.split(' ')[1];
        req.user = jwt.verify(token, JWT_SECRET);
        return handler(req, res);
    } catch (err) {
        return res.status(401).json({ message: "Invalid token" });
    }
};

module.exports = { verifyToken };