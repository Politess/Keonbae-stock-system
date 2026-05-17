'use strict';

const router = require('express').Router();
const { query, withTransaction } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// Full kitchen inventory
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT ks.id, i.id AS item_id, i.sku,  i.name, i.category, i.unit,
              ks.quantity, ks.min_quantity, ks.updated_at,
              (ks.quantity < ks.min_quantity) AS is_low
       FROM kitchen_stock ks
       JOIN items i ON i.id = ks.item_id
       ORDER BY i.category, i.name`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Low stock
router.get('/low', async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT * FROM vw_kitchen_low_stock`);
    res.json(rows);
  } catch (err) { next(err); }
});

// Upsert stock
router.put('/:item_id', authorize('administrator', 'central_management'), async (req, res, next) => {
  try {
    const { quantity, min_quantity } = req.body;
    if (quantity == null) return res.status(400).json({ error: 'quantity is required' });
    const { rows } = await query(
      `INSERT INTO kitchen_stock (item_id, quantity, min_quantity)
       VALUES ($1, $2, COALESCE($3, 0))
       ON CONFLICT (item_id) DO UPDATE SET
         quantity = EXCLUDED.quantity,
         min_quantity = COALESCE(EXCLUDED.min_quantity, kitchen_stock.min_quantity),
         updated_at = NOW()
       RETURNING *`,
      [req.params.item_id, quantity, min_quantity]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Manual adjustment with audit log
router.patch('/:item_id/adjust', authorize('administrator', 'central_management'), async (req, res, next) => {
  try {
    const { adjustment, notes, source } = req.body;
    if (adjustment == null) return res.status(400).json({ error: 'adjustment is required' });

    await withTransaction(async (client) => {
      const { rows: stockRows } = await client.query(
        `SELECT quantity FROM kitchen_stock WHERE item_id = $1 FOR UPDATE`,
        [req.params.item_id]
      );
      if (!stockRows[0]) throw Object.assign(new Error('Item not in stock'), { status: 404 });

      const before = parseFloat(stockRows[0].quantity);
      const after = before + parseFloat(adjustment);
      if (after < 0) throw Object.assign(new Error('Stock cannot go negative'), { status: 400 });

      await client.query(
        `UPDATE kitchen_stock SET quantity = $1, updated_at = NOW() WHERE item_id = $2`,
        [after, req.params.item_id]
      );

      await client.query(
        `INSERT INTO stock_movements
           (item_id, direction, source, quantity, quantity_before, quantity_after, performed_by, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          req.params.item_id,
          adjustment >= 0 ? 'IN' : 'OUT',
          source || 'manual_adjustment',
          Math.abs(adjustment),
          before, after,
          req.user.id,
          notes || null
        ]
      );

      res.json({ quantity_before: before, quantity_after: after });
    });
  } catch (err) { next(err); }
});

module.exports = router;
