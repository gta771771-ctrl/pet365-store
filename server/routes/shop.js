const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../database');
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'pet-service-platform-secret-key-2024';

function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Unauthorized' });
  try { req.user = jwt.verify(h.split(' ')[1], JWT_SECRET); next(); }
  catch (e) { return res.status(401).json({ success: false, message: 'Invalid token' }); }
}

// Get products
router.get('/products', async (req, res) => {
  try {
    const { category, keyword, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let sql = "SELECT * FROM products WHERE status = 1";
    const params = [];
    if (category) { sql += " AND category = $" + (params.length + 1); params.push(category); }
    if (keyword) {
      sql += " AND (name LIKE $" + (params.length + 1) + " OR description LIKE $" + (params.length + 2) + ")";
      params.push('%' + keyword + '%', '%' + keyword + '%');
    }
    sql += " ORDER BY id DESC LIMIT $" + (params.length + 1) + " OFFSET $" + (params.length + 2);
    params.push(parseInt(limit), offset);
    const products = await db.all(sql, params);
    res.json({ success: true, data: products });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Get categories
router.get('/categories', async (req, res) => {
  try {
    const cats = await db.all("SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND status = 1");
    res.json({ success: true, data: cats.map(c => c.category) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Get cart
router.get('/cart', auth, async (req, res) => {
  try {
    const items = await db.all(
      "SELECT c.*, p.name, p.price, p.image, p.stock as product_stock FROM cart c JOIN products p ON c.product_id = p.id WHERE c.user_id = $1",
      [req.user.id]
    );
    const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    res.json({ success: true, data: items, totalAmount });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Add to cart
router.post('/cart', auth, async (req, res) => {
  try {
    const { product_id, quantity = 1, specification } = req.body;
    if (!product_id) return res.status(400).json({ success: false, message: 'Product ID required' });
    const existing = await db.get("SELECT * FROM cart WHERE user_id = $1 AND product_id = $2", [req.user.id, product_id]);
    if (existing) {
      await db.run("UPDATE cart SET quantity = quantity + $1 WHERE id = $2", [quantity, existing.id]);
    } else {
      await db.run("INSERT INTO cart (user_id, product_id, quantity, specification) VALUES ($1,$2,$3,$4)",
        [req.user.id, product_id, quantity, specification || null]);
    }
    res.json({ success: true, message: 'Added to cart' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Update cart item
router.put('/cart/:id', auth, async (req, res) => {
  try {
    const { quantity } = req.body;
    const item = await db.get("SELECT id FROM cart WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    if (quantity <= 0) {
      await db.run("DELETE FROM cart WHERE id = $1", [req.params.id]);
    } else {
      await db.run("UPDATE cart SET quantity = $1 WHERE id = $2", [quantity, req.params.id]);
    }
    res.json({ success: true, message: 'Cart updated' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Delete cart item
router.delete('/cart/:id', auth, async (req, res) => {
  try {
    await db.run("DELETE FROM cart WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    res.json({ success: true, message: 'Item removed' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
