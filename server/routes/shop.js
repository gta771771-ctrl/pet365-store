const express = require('express');
const db = require('../database');

const router = express.Router();

// Get products
router.get('/products', (req, res) => {
  try {
    const { category, keyword, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = "SELECT * FROM products WHERE status = 1";
    let params = [];

    if (category) {
      sql += " AND category = ?";
      params.push(category);
    }

    if (keyword) {
      sql += " AND (name LIKE ? OR description LIKE ?)";
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    sql += " ORDER BY id DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), offset);

    const products = db.all(sql, params);

    res.json({ success: true, data: products });
  } catch (e) {
    console.error('Products error:', e);
    res.status(500).json({ success: false, message: 'Failed to get products' });
  }
});

// Get categories
router.get('/categories', (req, res) => {
  try {
    const categories = db.all("SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND status = 1");
    res.json({ success: true, data: categories.map(c => c.category) });
  } catch (e) {
    console.error('Categories error:', e);
    res.status(500).json({ success: false, message: 'Failed to get categories' });
  }
});

// Get cart
router.get('/cart', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const jwt = require('jsonwebtoken');
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'pet-service-platform-secret-key-2024');

    const cartItems = db.all(`
      SELECT c.*, p.name, p.price, p.image, p.stock as product_stock, p.status as product_status
      FROM cart c
      JOIN products p ON c.product_id = p.id
      WHERE c.user_id = ?
    `, [decoded.id]);

    const totalAmount = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

    res.json({ success: true, data: cartItems, totalAmount });
  } catch (e) {
    console.error('Cart error:', e);
    res.status(500).json({ success: false, message: 'Failed to get cart' });
  }
});

// Add to cart
router.post('/cart', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const jwt = require('jsonwebtoken');
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'pet-service-platform-secret-key-2024');

    const { product_id, quantity = 1, specification } = req.body;

    if (!product_id) {
      return res.status(400).json({ success: false, message: 'Product ID required' });
    }

    // Check if already in cart
    const existing = db.get("SELECT * FROM cart WHERE user_id = ? AND product_id = ?",
      [decoded.id, product_id]);

    if (existing) {
      db.run("UPDATE cart SET quantity = quantity + ? WHERE id = ?", [quantity, existing.id]);
    } else {
      db.run("INSERT INTO cart (user_id, product_id, quantity, specification) VALUES (?, ?, ?, ?)",
        [decoded.id, product_id, quantity, specification || null]);
    }

    res.json({ success: true, message: 'Added to cart' });
  } catch (e) {
    console.error('Add to cart error:', e);
    res.status(500).json({ success: false, message: 'Failed to add to cart' });
  }
});

// Update cart item
router.put('/cart/:id', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const jwt = require('jsonwebtoken');
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'pet-service-platform-secret-key-2024');

    const { quantity } = req.body;

    const cartItem = db.get("SELECT * FROM cart WHERE id = ? AND user_id = ?", [req.params.id, decoded.id]);
    if (!cartItem) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    if (quantity <= 0) {
      db.run("DELETE FROM cart WHERE id = ?", [req.params.id]);
    } else {
      db.run("UPDATE cart SET quantity = ? WHERE id = ?", [quantity, req.params.id]);
    }

    res.json({ success: true, message: 'Cart updated' });
  } catch (e) {
    console.error('Update cart error:', e);
    res.status(500).json({ success: false, message: 'Failed to update cart' });
  }
});

// Delete cart item
router.delete('/cart/:id', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const jwt = require('jsonwebtoken');
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'pet-service-platform-secret-key-2024');

    db.run("DELETE FROM cart WHERE id = ? AND user_id = ?", [req.params.id, decoded.id]);

    res.json({ success: true, message: 'Item removed' });
  } catch (e) {
    console.error('Delete cart error:', e);
    res.status(500).json({ success: false, message: 'Failed to remove item' });
  }
});

module.exports = router;
