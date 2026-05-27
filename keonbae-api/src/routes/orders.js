'use strict';

const router = require('express').Router();
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

async function getOrder(id) {
  const { rows } = await query(
    `SELECT so.*, r.name AS restaurant_name, u.full_name AS requested_by_name
     FROM stock_orders so
     JOIN restaurants r ON r.id = so.restaurant_id
     JOIN users u ON u.id = so.requested_by
     WHERE so.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function getOrderItems(order_id) {
  const { rows } = await query(
    `SELECT oi.*, i.name AS item_name, i.unit, i.category, i.sku
     FROM order_items oi JOIN items i ON i.id = oi.item_id
     WHERE oi.order_id = $1`,
    [order_id]
  );
  return rows;
}

router.get('/', async (req, res, next) => {
  try {
    const { status, restaurant_id } = req.query;
    const { role, restaurant_id: userRestaurant } = req.user;
    const filterRestaurant = role === 'restaurant_staff' ? userRestaurant : restaurant_id || null;
    const { include_archived } = req.query;
    const conditions = [];
    const values = [];
    if (filterRestaurant) { values.push(filterRestaurant); conditions.push(`so.restaurant_id = $${values.length}`); }
    if (status) { values.push(status); conditions.push(`so.status = $${values.length}`); }
    if (include_archived !== 'true') {
      conditions.push(`so.is_archived = FALSE`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT so.id, so.order_ref, r.name AS restaurant,
              so.status, so.needed_by_date, so.created_at,
              so.dispatched_at, so.received_at, so.rejection_reason, so.is_archived,
              u.full_name AS requested_by
       FROM stock_orders so
       JOIN restaurants r ON r.id = so.restaurant_id
       JOIN users u ON u.id = so.requested_by
       ${where} ORDER BY so.created_at DESC`,
      values
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const order = await getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Not found' });
    const { role, restaurant_id } = req.user;
    if (role === 'restaurant_staff' && order.restaurant_id !== restaurant_id)
      return res.status(403).json({ error: 'Access denied' });
    order.items = await getOrderItems(order.id);
    res.json(order);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { items, notes, needed_by_date } = req.body;
    const restaurant_id = req.body.restaurant_id || req.user.restaurant_id;
    if (!restaurant_id) return res.status(400).json({ error: 'restaurant_id required' });
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items array required' });
    for (const it of items) {
      if (!it.item_id || !it.quantity || it.quantity <= 0)
        return res.status(400).json({ error: 'Each item needs item_id and quantity > 0' });
    }
    const { rows: orderRows } = await query(
      `INSERT INTO stock_orders (order_ref, restaurant_id, requested_by, notes, needed_by_date)
       VALUES (next_order_ref(), $1, $2, $3, $4) RETURNING *`,
      [restaurant_id, req.user.id, notes || null, needed_by_date || null]
    );
    const order = orderRows[0];
    for (const it of items) {
      await query(
        `INSERT INTO order_items (order_id, item_id, requested_quantity, notes)
         VALUES ($1, $2, $3, $4)`,
        [order.id, it.item_id, it.quantity, it.notes || null]
      );
    }
    order.items = await getOrderItems(order.id);
    res.status(201).json(order);
  } catch (err) { next(err); }
});

router.patch('/:id/approve', authorize('administrator', 'central_management'),
  async (req, res, next) => {
    try {
      const order = await getOrder(req.params.id);
      if (!order) return res.status(404).json({ error: 'Not found' });
      if (order.status !== 'pending')
        return res.status(400).json({ error: `Cannot approve order with status: ${order.status}` });
      const { approved_items } = req.body;
      if (Array.isArray(approved_items)) {
        for (const ai of approved_items) {
          await query(
            `UPDATE order_items SET approved_quantity = $1 WHERE order_id = $2 AND item_id = $3`,
            [ai.approved_quantity, order.id, ai.item_id]
          );
        }
      }
      const { rows } = await query(
        `UPDATE stock_orders SET status = 'approved', approved_by = $1, approved_at = NOW()
         WHERE id = $2 RETURNING *`,
        [req.user.id, order.id]
      );
      rows[0].items = await getOrderItems(order.id);
      res.json(rows[0]);
    } catch (err) { next(err); }
  }
);

router.patch('/:id/reject', authorize('administrator', 'central_management'),
  async (req, res, next) => {
    try {
      const { reason } = req.body;
      if (!reason || !reason.trim()) {
        return res.status(400).json({ error: 'Rejection reason is required' });
      }
      const order = await getOrder(req.params.id);
      if (!order) return res.status(404).json({ error: 'Not found' });
      if (!['pending', 'approved'].includes(order.status))
        return res.status(400).json({ error: `Cannot reject order with status: ${order.status}` });
      const { rows } = await query(
        `UPDATE stock_orders SET status = 'rejected', approved_by = $1, approved_at = NOW(), rejection_reason = $2
         WHERE id = $3 RETURNING *`,
        [req.user.id, reason.trim(), order.id]
      );
      res.json(rows[0]);
    } catch (err) { next(err); }
  }
);

router.patch('/:id/dispatch', authorize('administrator', 'central_management'),
  async (req, res, next) => {
    try {
      const order = await getOrder(req.params.id);
      if (!order) return res.status(404).json({ error: 'Not found' });
      if (order.status !== 'approved')
        return res.status(400).json({ error: 'Order must be approved first' });
      const { rows } = await query(
        `UPDATE stock_orders SET status = 'dispatched', dispatched_by = $1
         WHERE id = $2 RETURNING *`,
        [req.user.id, order.id]
      );
      rows[0].items = await getOrderItems(order.id);
      res.json(rows[0]);
    } catch (err) {
      if (err.message && err.message.includes('Insufficient'))
        return res.status(400).json({ error: err.message });
      next(err);
    }
  }
);

router.patch('/:id/receive', authorize('administrator', 'central_management', 'restaurant_staff'),
  async (req, res, next) => {
    try {
      const order = await getOrder(req.params.id);
      if (!order) return res.status(404).json({ error: 'Not found' });
      if (order.status !== 'dispatched')
        return res.status(400).json({ error: 'Order must be dispatched first' });
      const { role, restaurant_id } = req.user;
      if (role === 'restaurant_staff' && order.restaurant_id !== restaurant_id)
        return res.status(403).json({ error: 'Access denied' });
      const { rows } = await query(
        `UPDATE stock_orders SET status = 'received', received_by = $1
         WHERE id = $2 RETURNING *`,
        [req.user.id, order.id]
      );
      rows[0].items = await getOrderItems(order.id);
      res.json(rows[0]);
    } catch (err) { next(err); }
  }
);
// Archive (hide from list)
router.patch('/:id/archive', authorize('administrator', 'central_management'),
  async (req, res, next) => {
    try {
      const order = await getOrder(req.params.id);
      if (!order) return res.status(404).json({ error: 'Not found' });
      const { rows } = await query(
        `UPDATE stock_orders SET is_archived = TRUE, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [order.id]
      );
      res.json(rows[0]);
    } catch (err) { next(err); }
  }
);

// Unarchive (show again)
router.patch('/:id/unarchive', authorize('administrator', 'central_management'),
  async (req, res, next) => {
    try {
      const order = await getOrder(req.params.id);
      if (!order) return res.status(404).json({ error: 'Not found' });
      const { rows } = await query(
        `UPDATE stock_orders SET is_archived = FALSE, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [order.id]
      );
      res.json(rows[0]);
    } catch (err) { next(err); }
  }
);
router.patch('/:id/cancel', async (req, res, next) => {
  try {
    const order = await getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Not found' });
    if (!['pending', 'approved'].includes(order.status))
      return res.status(400).json({ error: `Cannot cancel order with status: ${order.status}` });
    const { role, restaurant_id } = req.user;
    const isOwner = order.restaurant_id === restaurant_id;
    const isPrivileged = ['administrator', 'central_management'].includes(role);
    if (!isOwner && !isPrivileged) return res.status(403).json({ error: 'Access denied' });
    const { rows } = await query(
      `UPDATE stock_orders SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [order.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Delete a line item from an order (admin only)
router.delete('/:id/items/:item_id', authorize('administrator'),
  async (req, res, next) => {
    try {
      const order = await getOrder(req.params.id);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      
      await query(
        `DELETE FROM order_items WHERE id = $1 AND order_id = $2`,
        [req.params.item_id, req.params.id]
      );
      res.json({ deleted: true });
    } catch (err) { next(err); }
  }
);

module.exports = router;
