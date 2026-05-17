'use strict';

const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'change-me';

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' });
    }
    next();
  };
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, restaurant_id: user.restaurant_id },
    SECRET,
    { expiresIn: '12h' }
  );
}

module.exports = { authenticate, authorize, signToken };
