'use strict';

const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth',             require('./routes/auth'));
app.use('/api/users',            require('./routes/users'));
app.use('/api/restaurants',      require('./routes/restaurants'));
app.use('/api/items',            require('./routes/items'));
app.use('/api/kitchen/stock',    require('./routes/kitchenStock'));
app.use('/api/restaurant-stock', require('./routes/restaurantStock'));
app.use('/api/orders',           require('./routes/orders'));
app.use('/api/movements',        require('./routes/movements'));
app.use('/api/low-stock-reasons', require('./routes/lowStockReasons'));

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
