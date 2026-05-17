'use strict';

const router = require('express').Router();
const bcrypt = require('bcrypt');
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.use(authorize('administrator'));

// List users
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.full_name, u.email, u.role, u.is_active, u.created_at,
              u.restaurant_id, r.name AS restaurant_name
       FROM users u LEFT JOIN restaurants r ON r.id = u.restaurant_id
       ORDER BY u.created_at DESC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Create user
router.post('/', async (req, res, next) => {
  try {
    const { full_name, email, password, role, restaurant_id } = req.body;
    if (!full_name || !email || !password || !role)
      return res.status(400).json({ error: 'Missing required fields' });

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await query(
      `INSERT INTO users (full_name, email, password_hash, role, restaurant_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, full_name, email, role, restaurant_id, created_at`,
      [full_name, email, hash, role, restaurant_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    next(err);
  }
});

// Update user
router.patch('/:id', async (req, res, next) => {
  try {
    const { full_name, email, role, restaurant_id, is_active, password } = req.body;
    let password_hash = null;
    if (password) password_hash = await bcrypt.hash(password, 12);

    const { rows } = await query(
      `UPDATE users SET
         full_name     = COALESCE($1, full_name),
         email         = COALESCE($2, email),
         role          = COALESCE($3, role),
         restaurant_id = COALESCE($4, restaurant_id),
         is_active     = COALESCE($5, is_active),
         password_hash = COALESCE($6, password_hash)
       WHERE id = $7
       RETURNING id, full_name, email, role, restaurant_id, is_active`,
      [full_name, email, role, restaurant_id, is_active, password_hash, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Delete user
router.delete('/:id', async (req, res, next) => {
  try {
    await query(`DELETE FROM users WHERE id = $1`, [req.params.id]);
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

module.exports = router;
