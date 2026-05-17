'use strict';

const router = require('express').Router();
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// Full log (filtered by role)
router.get('/', async (req, res, next) => {
  try {
    const { direction, source, restaurant_id, item_id, limit = 100, offset = 0 } = req.query;
    const { role, restaurant_id: userRestaurant } = req.user;

    const conditions = [];
    const values = [];

    // Restaurant staff only sees their own restaurant's movements
    if (role === 'restaurant_staff') {
      values.push(userRestaurant);
      conditions.push(`sm.restaurant_id = $${values.length}`);
    } else if (restaurant_id) {
      values.push(restaurant_id);
      conditions.push(`sm.restaurant_id = $${values.length}`);
    }

    if (direction) {
      values.push(direction);
      conditions.push(`sm.direction = $${values.length}`);
    }
    if (source) {
      values.push(source);
      conditions.push(`sm.source = $${values.length}`);
    }
    if (item_id) {
      values.push(item_id);
      conditions.push(`sm.item_id = $${values.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    values.push(parseInt(limit), parseInt(offset));

    const { rows } = await query(
      `SELECT sm.id, sm.direction, sm.source, sm.quantity,
              sm.quantity_before, sm.quantity_after, sm.notes, sm.created_at,
              i.name AS item_name, i.unit, i.category,
              r.name AS restaurant_name,
              so.order_ref,
              u.full_name AS performed_by
       FROM stock_movements sm
       JOIN items i ON i.id = sm.item_id
       LEFT JOIN restaurants r ON r.id = sm.restaurant_id
       LEFT JOIN stock_orders so ON so.id = sm.order_id
       LEFT JOIN users u ON u.id = sm.performed_by
       ${where}
       ORDER BY sm.created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Delete a movement log entry (admin only)
router.delete('/:id', async (req, res, next) => {
  try {
    if (req.user.role !== 'administrator') {
      return res.status(403).json({ error: 'Only administrators can delete stock log entries' });
    }
    await query(`DELETE FROM stock_movements WHERE id = $1`, [req.params.id]);
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

module.exports = router;
