const express = require('express');
const db = require('../database');
const router = express.Router();

// Get services
router.get('/services', async (req, res) => {
  try {
    const services = await db.all("SELECT * FROM services WHERE status = 1");
    for (const s of services) {
      if (s.features) { try { s.features = JSON.parse(s.features); } catch (e) {} }
    }
    res.json({ success: true, data: services });
  } catch (e) { res.status(500).json({ success: false, message: 'Failed to get services' }); }
});

// Get articles
router.get('/articles', async (req, res) => {
  try {
    const { category, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let sql = "SELECT * FROM articles WHERE status = 1";
    const params = [];
    if (category) { sql += " AND category = $1"; params.push(category); }
    sql += " ORDER BY created_at DESC LIMIT $" + (params.length + 1) + " OFFSET $" + (params.length + 2);
    params.push(parseInt(limit), offset);
    const articles = await db.all(sql, params);
    res.json({ success: true, data: articles });
  } catch (e) { res.status(500).json({ success: false, message: 'Failed to get articles' }); }
});

// Get home page data
router.get('/home', async (req, res) => {
  try {
    const [services, products, articles] = await Promise.all([
      db.all("SELECT * FROM services WHERE status = 1 LIMIT 4"),
      db.all("SELECT * FROM products WHERE status = 1 ORDER BY sales DESC LIMIT 8"),
      db.all("SELECT * FROM articles WHERE status = 1 ORDER BY views DESC LIMIT 3")
    ]);
    for (const s of services) {
      if (s.features) { try { s.features = JSON.parse(s.features); } catch (e) {} }
    }
    res.json({ success: true, data: { services, products, articles } });
  } catch (e) { res.status(500).json({ success: false, message: 'Failed to get home data' }); }
});

module.exports = router;
