'use strict';

require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3000;

// Only listen if running locally (not on Vercel)
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`Keonbae API running on port ${PORT}`);
  });
}

module.exports = app;
