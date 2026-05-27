'use strict';

const router = require('express').Router();
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.use(authorize('administrator', 'central_management'));

// Monthly summary: stock + cost + total per restaurant
router.get('/monthly', async (req, res, next) => {
  try {
    const { year, month, restaurant_id } = req.query;
    const targetYear = parseInt(year) || new Date().getFullYear();
    const targetMonth = parseInt(month) || (new Date().getMonth() + 1);

    const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const nextMonth = targetMonth === 12 ? 1 : targetMonth + 1;
    const nextYear = targetMonth === 12 ? targetYear + 1 : targetYear;
    const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    // Build the query for orders in this month
    const conditions = [
      `so.created_at >= $1`,
      `so.created_at < $2`,
      `so.status = 'received'`
    ];
    const values = [startDate, endDate];

    if (restaurant_id) {
      values.push(restaurant_id);
      conditions.push(`so.restaurant_id = $${values.length}`);
    }

    // Order-level summary with cost
    const orderSummary = await query(
      `SELECT 
        so.id, so.order_ref, so.created_at, so.received_at,
        r.name AS restaurant_name,
        u.full_name AS requested_by,
        COUNT(oi.id) AS item_count,
        SUM(COALESCE(oi.received_quantity, oi.dispatched_quantity, oi.approved_quantity, oi.requested_quantity)) AS total_quantity,
        SUM(COALESCE(oi.received_quantity, oi.dispatched_quantity, oi.approved_quantity, oi.requested_quantity) * COALESCE(i.unit_price, 0)) AS total_cost
       FROM stock_orders so
       JOIN restaurants r ON r.id = so.restaurant_id
       JOIN users u ON u.id = so.requested_by
       JOIN order_items oi ON oi.order_id = so.id
       JOIN items i ON i.id = oi.item_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY so.id, so.order_ref, so.created_at, so.received_at, r.name, u.full_name
       ORDER BY so.created_at DESC`,
      values
    );

    // Restaurant-level aggregate
    const restaurantSummary = await query(
      `SELECT 
        r.name AS restaurant_name,
        COUNT(DISTINCT so.id) AS order_count,
        SUM(COALESCE(oi.received_quantity, oi.dispatched_quantity, oi.approved_quantity, oi.requested_quantity)) AS total_quantity,
        SUM(COALESCE(oi.received_quantity, oi.dispatched_quantity, oi.approved_quantity, oi.requested_quantity) * COALESCE(i.unit_price, 0)) AS total_cost
       FROM stock_orders so
       JOIN restaurants r ON r.id = so.restaurant_id
       JOIN order_items oi ON oi.order_id = so.id
       JOIN items i ON i.id = oi.item_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY r.name
       ORDER BY total_cost DESC`,
      values
    );

    // Category breakdown
    const categorySummary = await query(
      `SELECT 
        i.category,
        COUNT(DISTINCT oi.id) AS line_count,
        SUM(COALESCE(oi.received_quantity, oi.dispatched_quantity, oi.approved_quantity, oi.requested_quantity)) AS total_quantity,
        SUM(COALESCE(oi.received_quantity, oi.dispatched_quantity, oi.approved_quantity, oi.requested_quantity) * COALESCE(i.unit_price, 0)) AS total_cost
       FROM stock_orders so
       JOIN order_items oi ON oi.order_id = so.id
       JOIN items i ON i.id = oi.item_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY i.category
       ORDER BY total_cost DESC`,
      values
    );

    // Detailed items list
    const itemsDetail = await query(
      `SELECT 
        i.sku, i.name, i.category, i.unit, i.unit_price,
        r.name AS restaurant_name,
        so.order_ref,
        so.created_at,
        COALESCE(oi.received_quantity, oi.dispatched_quantity, oi.approved_quantity, oi.requested_quantity) AS quantity,
        COALESCE(oi.received_quantity, oi.dispatched_quantity, oi.approved_quantity, oi.requested_quantity) * COALESCE(i.unit_price, 0) AS line_total
       FROM stock_orders so
       JOIN restaurants r ON r.id = so.restaurant_id
       JOIN order_items oi ON oi.order_id = so.id
       JOIN items i ON i.id = oi.item_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY so.created_at DESC, i.category, i.name`,
      values
    );

    // Grand totals
    const grandTotal = orderSummary.rows.reduce((sum, o) => sum + parseFloat(o.total_cost || 0), 0);
    const totalOrders = orderSummary.rows.length;
    const totalItems = itemsDetail.rows.length;

    res.json({
      period: { year: targetYear, month: targetMonth },
      grand_total: grandTotal,
      total_orders: totalOrders,
      total_items: totalItems,
      orders: orderSummary.rows,
      by_restaurant: restaurantSummary.rows,
      by_category: categorySummary.rows,
      items_detail: itemsDetail.rows
    });
  } catch (err) { next(err); }
});

module.exports = router;
