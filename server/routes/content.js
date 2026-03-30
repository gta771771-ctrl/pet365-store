const express = require('express');
const db = require('../database');

const router = express.Router();

// Get services
router.get('/services', (req, res) => {
  try {
    const services = db.all("SELECT * FROM services WHERE status = 1");
    for (const s of services) {
      if (s.features) {
        try { s.features = JSON.parse(s.features); } catch (e) {}
      }
    }
    res.json({ success: true, data: services });
  } catch (e) {
    console.error('Services error:', e);
    res.status(500).json({ success: false, message: 'Failed to get services' });
  }
});

// Get articles
router.get('/articles', (req, res) => {
  try {
    const { category, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = "SELECT * FROM articles WHERE status = 1";
    let params = [];

    if (category) {
      sql += " AND category = ?";
      params.push(category);
    }

    sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), offset);

    const articles = db.all(sql, params);
    res.json({ success: true, data: articles });
  } catch (e) {
    console.error('Articles error:', e);
    res.status(500).json({ success: false, message: 'Failed to get articles' });
  }
});

// Get home page data
router.get('/home', (req, res) => {
  try {
    const services = db.all("SELECT * FROM services WHERE status = 1 LIMIT 4");
    const products = db.all("SELECT * FROM products WHERE status = 1 ORDER BY sales DESC LIMIT 8");
    const articles = db.all("SELECT * FROM articles WHERE status = 1 ORDER BY views DESC LIMIT 3");

    for (const s of services) {
      if (s.features) {
        try { s.features = JSON.parse(s.features); } catch (e) {}
      }
    }

    res.json({ success: true, data: { services, products, articles } });
  } catch (e) {
    console.error('Home data error:', e);
    res.status(500).json({ success: false, message: 'Failed to get home data' });
  }
});

module.exports = router;
