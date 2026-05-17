'use strict';

const router = require('express').Router();
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// List reasons for a restaurant
router.get('/:restaurant_id', async (req, res, next) => {
  try {
    const { role, restaurant_id } = req.user;
    if (role === 'restaurant_staff' && restaurant_id !== req.params.restaurant_id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { rows } = await query(
      `SELECT lsr.*, i.name AS item_name, i.sku, i.category, i.unit,
              u.full_name AS reported_by_name
       FROM low_stock_reasons lsr
       JOIN items i ON i.id = lsr.item_id
       LEFT JOIN users u ON u.id = lsr.reported_by
       WHERE lsr.restaurant_id = $1
       ORDER BY lsr.created_at DESC`,
      [req.params.restaurant_id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Create a reason
router.post('/',
  authorize('restaurant_staff', 'central_management', 'administrator'),
  async (req, res, next) => {
    try {
      const { item_id, reason, notes, quantity_at_report, min_quantity_at_report } = req.body;
      const restaurant_id = req.body.restaurant_id || req.user.restaurant_id;
      
      if (!restaurant_id || !item_id || !reason) {
        return res.status(400).json({ error: 'restaurant_id, item_id and reason are required' });
      }
      
      const { rows } = await query(
        `INSERT INTO low_stock_reasons 
           (restaurant_id, item_id, reason, notes, reported_by, quantity_at_report, min_quantity_at_report)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [restaurant_id, item_id, reason, notes || null, req.user.id, 
         quantity_at_report || null, min_quantity_at_report || null]
      );
      res.status(201).json(rows[0]);
    } catch (err) { next(err); }
  }
);

// Mark resolved
router.patch('/:id/resolve', async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE low_stock_reasons SET is_resolved = TRUE WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
