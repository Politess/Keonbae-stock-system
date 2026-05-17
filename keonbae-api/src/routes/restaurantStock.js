'use strict';

const router = require('express').Router();
const { query, withTransaction } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

function ownRestaurantOrPrivileged(req, res, next) {
  const { role, restaurant_id } = req.user;
  if (role === 'administrator' || role === 'central_management') return next();
  if (restaurant_id === req.params.restaurant_id) return next();
  return res.status(403).json({ error: 'Access denied' });
}

router.get('/:restaurant_id', ownRestaurantOrPrivileged, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT rs.id, i.id AS item_id, i.sku, i.name, i.category, i.unit,
              rs.quantity, rs.min_quantity, rs.updated_at,
              (rs.quantity < rs.min_quantity) AS is_low
       FROM restaurant_stock rs
       JOIN items i ON i.id = rs.item_id
       WHERE rs.restaurant_id = $1
       ORDER BY i.category, i.name`,
      [req.params.restaurant_id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:restaurant_id/low', ownRestaurantOrPrivileged, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT * FROM vw_restaurant_low_stock WHERE restaurant_id = $1`,
      [req.params.restaurant_id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.put('/:restaurant_id/:item_id',
  authorize('administrator', 'central_management', 'restaurant_staff'),
  ownRestaurantOrPrivileged,
  async (req, res, next) => {
    try {
      const { quantity, min_quantity } = req.body;
      if (quantity == null) return res.status(400).json({ error: 'quantity is required' });
      const { rows } = await query(
        `INSERT INTO restaurant_stock (restaurant_id, item_id, quantity, min_quantity)
         VALUES ($1, $2, $3, COALESCE($4, 0))
         ON CONFLICT (restaurant_id, item_id) DO UPDATE SET
           quantity = EXCLUDED.quantity,
           min_quantity = COALESCE(EXCLUDED.min_quantity, restaurant_stock.min_quantity),
           updated_at = NOW()
         RETURNING *`,
        [req.params.restaurant_id, req.params.item_id, quantity, min_quantity]
      );
      res.json(rows[0]);
    } catch (err) { next(err); }
  }
);

router.delete('/:restaurant_id/:item_id',
  authorize('administrator', 'central_management', 'restaurant_staff'),
  ownRestaurantOrPrivileged,
  async (req, res, next) => {
    try {
      await query(`DELETE FROM restaurant_stock WHERE restaurant_id = $1 AND item_id = $2`,
        [req.params.restaurant_id, req.params.item_id]);
      res.json({ deleted: true });
    } catch (err) { next(err); }
  }
);

router.patch('/:restaurant_id/:item_id/adjust',
  authorize('administrator', 'central_management', 'restaurant_staff'),
  ownRestaurantOrPrivileged,
  async (req, res, next) => {
    try {
      const { adjustment, notes, source } = req.body;
      if (adjustment == null) return res.status(400).json({ error: 'adjustment required' });
      await withTransaction(async (client) => {
        const { rows } = await client.query(
          `SELECT quantity FROM restaurant_stock
           WHERE restaurant_id = $1 AND item_id = $2 FOR UPDATE`,
          [req.params.restaurant_id, req.params.item_id]
        );
        if (!rows[0]) throw Object.assign(new Error('Stock record not found'), { status: 404 });
        const before = parseFloat(rows[0].quantity);
        const after = before + parseFloat(adjustment);
        if (after < 0) throw Object.assign(new Error('Stock cannot go negative'), { status: 400 });
        await client.query(
          `UPDATE restaurant_stock SET quantity = $1, updated_at = NOW()
           WHERE restaurant_id = $2 AND item_id = $3`,
          [after, req.params.restaurant_id, req.params.item_id]
        );
        await client.query(
          `INSERT INTO stock_movements
             (item_id, restaurant_id, direction, source, quantity,
              quantity_before, quantity_after, performed_by, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [req.params.item_id, req.params.restaurant_id,
           adjustment >= 0 ? 'IN' : 'OUT',
           source || 'manual_adjustment',
           Math.abs(adjustment), before, after, req.user.id, notes || null]
        );
        res.json({ quantity_before: before, quantity_after: after });
      });
    } catch (err) { next(err); }
  }
);

module.exports = router;
