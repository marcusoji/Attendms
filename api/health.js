const db = require('../lib/db');

export default async function handler(req, res) {
    try {
        await db.execute('SELECT 1');
        res.status(200).json({ status: 'ok', database: 'connected' });
    } catch (error) {
        res.status(500).json({ status: 'error', database: 'disconnected' });
    }
}