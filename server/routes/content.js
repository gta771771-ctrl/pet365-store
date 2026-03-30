const express = require('express');
const { get, all } = require('../database');

const router = express.Router();

router.get('/services', (req, res) => {
  const services = all('SELECT * FROM services WHERE status = 1 ORDER BY sort_order');
  res.json({ success: true, data: services });
});

router.get('/articles', (req, res) => {
  const { category, page = 1, limit = 6 } = req.query;
  const offset = (page - 1) * limit;
  let sql = 'SELECT * FROM articles WHERE status = 1';
  const params = [];
  if (category) { sql += ' AND category = ?'; params.push(category); }
  const total = get(sql.replace('SELECT *', 'SELECT COUNT(*) as total'), params)?.total || 0;
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);
  const articles = all(sql, params);
  res.json({ success: true, data: articles, pagination: { total, page: parseInt(page), limit: parseInt(limit) } });
});

router.get('/articles/:id', (req, res) => {
  const article = get('SELECT * FROM articles WHERE id = ?', [req.params.id]);
  if (!article) return res.status(404).json({ success: false, message: 'Article not found' });
  run('UPDATE articles SET views = views + 1 WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: article });
});

router.get('/home', (req, res) => {
  const services = all('SELECT * FROM services WHERE status = 1 ORDER BY sort_order LIMIT 4');
  const products = all('SELECT * FROM products WHERE status = 1 ORDER BY sales DESC LIMIT 8');
  const articles = all('SELECT * FROM articles WHERE status = 1 ORDER BY created_at DESC LIMIT 3');
  res.json({ success: true, data: { services, products, articles } });
});

module.exports = router;
