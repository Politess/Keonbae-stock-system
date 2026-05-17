'use strict';

const router = require('express').Router();
const bcrypt = require('bcrypt');
const { query } = require('../db');
const { authenticate, signToken } = require('../middleware/auth');

// Login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const { rows } = await query(
      `SELECT id, full_name, email, password_hash, role, restaurant_id, is_active
       FROM users WHERE email = $1`,
      [email]
    );
    const user = rows[0];
    if (!user || !user.is_active) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    delete user.password_hash;
    res.json({ user, token: signToken(user) });
  } catch (err) { next(err); }
});

// Current user info
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.full_name, u.email, u.role, u.restaurant_id, r.name AS restaurant_name
       FROM users u LEFT JOIN restaurants r ON r.id = u.restaurant_id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
