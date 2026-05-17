'use strict';

const router = require('express').Router();
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// List
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, sku, name,  category, unit, description, is_active, created_at
       FROM items WHERE is_active = TRUE ORDER BY category, name`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Get categories list
router.get('/meta/categories', async (req, res) => {
  res.json([
    'Sashimi/Sushi', 'Korean Seafood', 'BBQ Meat',
    'Raw Meat', 'Vegetables', 'Dessert', 'Kitchen Essentials'
  ]);
});

// Get units list
router.get('/meta/units', async (req, res) => {
  res.json(['kg', 'g', 'litre', 'ml', 'box', 'crate']);
});

// Get one
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT * FROM items WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Create
router.post('/', authorize('administrator', 'central_management'), async (req, res, next) => {
  try {
    const { name, category, unit, description } = req.body;
    if (!name || !category || !unit)
      return res.status(400).json({ error: 'name, category and unit are required' });
    const { rows } = await query(
      `INSERT INTO items (name, sku,  category, unit, description)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, sku || null, category, unit, description]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Item already exists' });
    next(err);
  }
});

// Update
router.patch('/:id', authorize('administrator', 'central_management', 'restaurant_staff'), async (req, res, next) => {
  try {
    const { name, sku,  category, unit, description, is_active } = req.body;
    const { rows } = await query(
      `UPDATE items SET
         name = COALESCE($1, name),
	 sku = COALESCE($2, sku),
         category = COALESCE($3, category),
         unit = COALESCE($4, unit),
         description = COALESCE($5, description),
         is_active = COALESCE($6, is_active)
       WHERE id = $7 RETURNING *`,
      [name, sku, category, unit, description, is_active, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
