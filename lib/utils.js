const log = (level, message, data = null) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
    if (data) {
        console.log('Data:', JSON.stringify(data, null, 2));
    }
};

const getDistance = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const validateInput = (data, requiredFields) => {
    for (const field of requiredFields) {
        if (!data[field] || data[field].toString().trim() === '') {
            return `${field} is required`;
        }
    }
    return null;
};

const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
        log('error', 'Unhandled Exception', err);
        res.status(500).json({ message: 'An internal server error occurred' });
    });
};

module.exports = { log, getDistance, validateInput, asyncHandler };