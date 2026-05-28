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

// Weekly usage: received - counted = used, with cost
router.get('/weekly', async (req, res, next) => {
  try {
    const { week_start, restaurant_id } = req.query;
    if (!week_start) return res.status(400).json({ error: 'week_start (YYYY-MM-DD) is required' });

    // Week range: week_start to week_start + 7 days
    const start = new Date(week_start);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    const recvConditions = [
      `so.received_at >= $1`,
      `so.received_at < $2`,
      `so.status = 'received'`
    ];
    const recvValues = [startStr, endStr];
    if (restaurant_id) {
      recvValues.push(restaurant_id);
      recvConditions.push(`so.restaurant_id = $${recvValues.length}`);
    }

    // Received quantities per item this week
    const received = await query(
      `SELECT 
        i.id AS item_id, i.sku, i.name, i.category, i.unit, COALESCE(i.unit_price,0) AS unit_price,
        r.id AS restaurant_id, r.name AS restaurant_name,
        SUM(COALESCE(oi.received_quantity, oi.dispatched_quantity, oi.approved_quantity, oi.requested_quantity)) AS received_qty
       FROM stock_orders so
       JOIN restaurants r ON r.id = so.restaurant_id
       JOIN order_items oi ON oi.order_id = so.id
       JOIN items i ON i.id = oi.item_id
       WHERE ${recvConditions.join(' AND ')}
       GROUP BY i.id, i.sku, i.name, i.category, i.unit, i.unit_price, r.id, r.name`,
      recvValues
    );

    // Stock counts in the same week
    const countConditions = [
      `sc.count_date >= $1`,
      `sc.count_date < $2`
    ];
    const countValues = [startStr, endStr];
    if (restaurant_id) {
      countValues.push(restaurant_id);
      countConditions.push(`sc.restaurant_id = $${countValues.length}`);
    }

    const counts = await query(
      `SELECT sc.item_id, sc.restaurant_id, sc.quantity_counted
       FROM stock_counts sc
       WHERE ${countConditions.join(' AND ')}`,
      countValues
    );

    // Build a lookup for counts
    const countMap = {};
    counts.rows.forEach(c => {
      countMap[`${c.restaurant_id}:${c.item_id}`] = parseFloat(c.quantity_counted);
    });

    // Calculate usage per item
    const usage = received.rows.map(r => {
      const receivedQty = parseFloat(r.received_qty);
      const key = `${r.restaurant_id}:${r.item_id}`;
      const counted = countMap[key];
      const hasCounts = counted !== undefined;
      const used = hasCounts ? Math.max(0, receivedQty - counted) : null;
      const unitPrice = parseFloat(r.unit_price);
      const usedCost = used !== null ? used * unitPrice : null;
      return {
        sku: r.sku,
        name: r.name,
        category: r.category,
        unit: r.unit,
        unit_price: unitPrice,
        restaurant_name: r.restaurant_name,
        received_qty: receivedQty,
        counted_qty: hasCounts ? counted : null,
        used_qty: used,
        used_cost: usedCost
      };
    });

    // Totals
    const totalUsedCost = usage.reduce((s, u) => s + (u.used_cost || 0), 0);
    const totalReceivedQty = usage.reduce((s, u) => s + u.received_qty, 0);
    const itemsCounted = usage.filter(u => u.counted_qty !== null).length;

    // Category breakdown of used cost
    const catMap = {};
    usage.forEach(u => {
      if (u.used_cost !== null) {
        if (!catMap[u.category]) catMap[u.category] = { category: u.category, used_cost: 0, used_qty: 0 };
        catMap[u.category].used_cost += u.used_cost;
        catMap[u.category].used_qty += u.used_qty;
      }
    });

    res.json({
      week_start: startStr,
      week_end: new Date(end.getTime() - 86400000).toISOString().split('T')[0],
      total_used_cost: totalUsedCost,
      total_received_qty: totalReceivedQty,
      items_counted: itemsCounted,
      total_items: usage.length,
      usage,
      by_category: Object.values(catMap).sort((a, b) => b.used_cost - a.used_cost)
    });
  } catch (err) { next(err); }
});

module.exports = router;
