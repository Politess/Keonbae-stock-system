'use strict';

const router = require('express').Router();
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// List counts for a restaurant (optionally filtered by date range)
router.get('/:restaurant_id', async (req, res, next) => {
  try {
    const { role, restaurant_id } = req.user;
    if (role === 'restaurant_staff' && restaurant_id !== req.params.restaurant_id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { from, to } = req.query;
    const conditions = ['sc.restaurant_id = $1'];
    const values = [req.params.restaurant_id];
    if (from) { values.push(from); conditions.push(`sc.count_date >= $${values.length}`); }
    if (to)   { values.push(to);   conditions.push(`sc.count_date <= $${values.length}`); }

    const { rows } = await query(
      `SELECT sc.*, i.name AS item_name, i.sku, i.category, i.unit, i.unit_price,
              u.full_name AS counted_by_name
       FROM stock_counts sc
       JOIN items i ON i.id = sc.item_id
       LEFT JOIN users u ON u.id = sc.counted_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY sc.count_date DESC, i.category, i.name`,
      values
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Record a stock count (upsert per item per date)
router.post('/',
  authorize('restaurant_staff', 'central_management', 'administrator'),
  async (req, res, next) => {
    try {
      const { item_id, count_date, quantity_counted, notes } = req.body;
      const restaurant_id = req.body.restaurant_id || req.user.restaurant_id;
      if (!restaurant_id || !item_id || !count_date || quantity_counted == null) {
        return res.status(400).json({ error: 'restaurant_id, item_id, count_date and quantity_counted are required' });
      }
      const { rows } = await query(
        `INSERT INTO stock_counts (restaurant_id, item_id, count_date, quantity_counted, counted_by, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (restaurant_id, item_id, count_date) DO UPDATE SET
           quantity_counted = EXCLUDED.quantity_counted,
           counted_by = EXCLUDED.counted_by,
           notes = EXCLUDED.notes
         RETURNING *`,
        [restaurant_id, item_id, count_date, quantity_counted, req.user.id, notes || null]
      );
      res.status(201).json(rows[0]);
    } catch (err) { next(err); }
  }
);

// Delete a count
router.delete('/:id', authorize('administrator', 'central_management', 'restaurant_staff'),
  async (req, res, next) => {
    try {
      await query(`DELETE FROM stock_counts WHERE id = $1`, [req.params.id]);
      res.json({ deleted: true });
    } catch (err) { next(err); }
  }
);

module.exports = router;
