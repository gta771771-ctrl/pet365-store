const express = require('express');
const { run, get, all } = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/categories', (req, res) => {
  const cats = all('SELECT * FROM categories WHERE status = 1 ORDER BY sort_order');
  res.json({ success: true, data: cats });
});

router.get('/products', (req, res) => {
  const { category_id, keyword, page = 1, limit = 12 } = req.query;
  const offset = (page - 1) * limit;
  let sql = 'SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.status = 1';
  const params = [];
  if (category_id) { sql += ' AND p.category_id = ?'; params.push(category_id); }
  if (keyword) { sql += ' AND (p.name LIKE ? OR p.description LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
  const total = get(sql.replace('SELECT p.*, c.name as category_name', 'SELECT COUNT(*) as total'), params)?.total || 0;
  sql += ' ORDER BY p.sales DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);
  const products = all(sql, params);
  res.json({ success: true, data: products, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / limit) } });
});

router.get('/products/:id', (req, res) => {
  const product = get('SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?', [req.params.id]);
  if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
  res.json({ success: true, data: product });
});

router.get('/cart', authMiddleware, (req, res) => {
  const items = all('SELECT c.*, p.name, p.price, p.image, p.stock, p.status as product_status FROM cart c JOIN products p ON c.product_id = p.id WHERE c.user_id = ?', [req.user.id]);
  const totalAmount = items.reduce((s, i) => s + i.price * i.quantity, 0);
  res.json({ success: true, data: items, totalAmount });
});

router.post('/cart', authMiddleware, (req, res) => {
  const { product_id, quantity = 1, specification = '' } = req.body;
  const existing = get('SELECT * FROM cart WHERE user_id = ? AND product_id = ? AND specification = ?', [req.user.id, product_id, specification]);
  if (existing) {
    run('UPDATE cart SET quantity = quantity + ? WHERE id = ?', [quantity, existing.id]);
  } else {
    run('INSERT INTO cart (user_id, product_id, quantity, specification) VALUES (?, ?, ?, ?)', [req.user.id, product_id, quantity, specification]);
  }
  res.json({ success: true, message: 'Added to cart' });
});

router.put('/cart/:id', authMiddleware, (req, res) => {
  const { quantity } = req.body;
  if (quantity < 1) return res.status(400).json({ success: false, message: 'Invalid quantity' });
  const item = get('SELECT * FROM cart WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
  run('UPDATE cart SET quantity = ? WHERE id = ?', [quantity, req.params.id]);
  res.json({ success: true });
});

router.delete('/cart/:id', authMiddleware, (req, res) => {
  run('DELETE FROM cart WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  res.json({ success: true });
});

module.exports = router;
