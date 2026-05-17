'use strict';

const router = require('express').Router();
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// List all
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, name, location, contact_email, contact_phone, is_active, created_at
       FROM restaurants ORDER BY name`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Get one
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT * FROM restaurants WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Create
router.post('/', authorize('administrator'), async (req, res, next) => {
  try {
    const { name, location, contact_email, contact_phone } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const { rows } = await query(
      `INSERT INTO restaurants (name, location, contact_email, contact_phone)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, location, contact_email, contact_phone]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// Update
router.patch('/:id', authorize('administrator'), async (req, res, next) => {
  try {
    const { name, location, contact_email, contact_phone, is_active } = req.body;
    const { rows } = await query(
      `UPDATE restaurants SET
         name = COALESCE($1, name),
         location = COALESCE($2, location),
         contact_email = COALESCE($3, contact_email),
         contact_phone = COALESCE($4, contact_phone),
         is_active = COALESCE($5, is_active)
       WHERE id = $6 RETURNING *`,
      [name, location, contact_email, contact_phone, is_active, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
