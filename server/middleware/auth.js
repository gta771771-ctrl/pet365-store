const jwt = require('jsonwebtoken');
const JWT_SECRET = 'petpaw-platform-secret-key-2024';

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ success: false, message: 'No token provided' });
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Invalid token format' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) { return res.status(401).json({ success: false, message: 'Invalid or expired token' }); }
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin access required' });
  next();
}

function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role || 'user' }, JWT_SECRET, { expiresIn: '7d' });
}

module.exports = { authMiddleware, adminMiddleware, generateToken, JWT_SECRET };
