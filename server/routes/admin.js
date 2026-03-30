const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const db = require('../database');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'pet-service-platform-secret-key-2024';

// Admin login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }

    const admin = db.get("SELECT * FROM admin_users WHERE username = ?", [username]);

    if (!admin || !bcrypt.compareSync(password, admin.password)) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: admin.id, username: admin.username, isAdmin: true }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ success: true, data: { token, user: { id: admin.id, username: admin.username } } });
  } catch (e) {
    console.error('Admin login error:', e);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// Admin middleware
function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.isAdmin) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    req.admin = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

// Get stats
router.get('/stats', adminAuth, (req, res) => {
  try {
    const totalUsers = db.get("SELECT COUNT(*) as count FROM users");
    const totalOrders = db.get("SELECT COUNT(*) as count FROM orders");
    const totalProducts = db.get("SELECT COUNT(*) as count FROM products");
    const totalRevenue = db.get("SELECT COALESCE(SUM(pay_amount), 0) as total FROM orders WHERE status = 4");
    const recentOrders = db.all("SELECT o.*, u.username FROM orders o LEFT JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC LIMIT 10");

    res.json({
      success: true,
      data: {
        totalUsers: totalUsers.count,
        totalOrders: totalOrders.count,
        totalProducts: totalProducts.count,
        totalRevenue: totalRevenue.total.toFixed(2),
        recentOrders
      }
    });
  } catch (e) {
    console.error('Stats error:', e);
    res.status(500).json({ success: false, message: 'Failed to get stats' });
  }
});

// Get users
router.get('/users', adminAuth, (req, res) => {
  try {
    const { page = 1, limit = 20, keyword } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = "SELECT u.*, p.username as parent_name FROM users u LEFT JOIN users p ON u.parent_id = p.id";
    let params = [];

    if (keyword) {
      sql += " WHERE u.username LIKE ? OR u.email LIKE ? OR u.phone LIKE ?";
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    sql += " ORDER BY u.created_at DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), offset);

    const users = db.all(sql, params);

    res.json({ success: true, data: users });
  } catch (e) {
    console.error('Users error:', e);
    res.status(500).json({ success: false, message: 'Failed to get users' });
  }
});

// Update user status
router.put('/users/:id/status', adminAuth, (req, res) => {
  try {
    const { status } = req.body;
    db.run("UPDATE users SET status = ? WHERE id = ?", [status, req.params.id]);
    res.json({ success: true, message: 'Status updated' });
  } catch (e) {
    console.error('Update status error:', e);
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
});

// Update user balance
router.post('/users/:id/balance', adminAuth, (req, res) => {
  try {
    const { type, amount, reason } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    const user = db.get("SELECT * FROM users WHERE id = ?", [req.params.id]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    let newBalance;
    if (type === 'add') {
      newBalance = user.balance + amount;
    } else if (type === 'deduct') {
      newBalance = Math.max(0, user.balance - amount);
    } else if (type === 'set') {
      newBalance = amount;
    } else {
      return res.status(400).json({ success: false, message: 'Invalid type' });
    }

    db.run("UPDATE users SET balance = ? WHERE id = ?", [newBalance, req.params.id]);
    db.run("INSERT INTO balance_logs (user_id, type, amount, before_balance, after_balance, reason) VALUES (?, ?, ?, ?, ?, ?)",
      [req.params.id, type, amount, user.balance, newBalance, reason || 'Admin adjustment']);

    res.json({ success: true, message: 'Balance updated' });
  } catch (e) {
    console.error('Update balance error:', e);
    res.status(500).json({ success: false, message: 'Failed to update balance' });
  }
});

// Get products
router.get('/products', adminAuth, (req, res) => {
  try {
    const { page = 1, limit = 20, keyword } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = "SELECT * FROM products";
    let params = [];

    if (keyword) {
      sql += " WHERE name LIKE ?";
      params.push(`%${keyword}%`);
    }

    sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), offset);

    const products = db.all(sql, params);
    res.json({ success: true, data: products });
  } catch (e) {
    console.error('Products error:', e);
    res.status(500).json({ success: false, message: 'Failed to get products' });
  }
});

// Get orders
router.get('/orders', adminAuth, (req, res) => {
  try {
    const { page = 1, limit = 20, keyword, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = "SELECT o.*, u.username FROM orders o LEFT JOIN users u ON o.user_id = u.id";
    let params = [];

    if (keyword) {
      sql += " WHERE o.order_no LIKE ? OR u.username LIKE ?";
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    if (status) {
      sql += (keyword ? " AND" : " WHERE") + " o.status = ?";
      params.push(parseInt(status));
    }

    sql += " ORDER BY o.created_at DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), offset);

    const orders = db.all(sql, params);
    res.json({ success: true, data: orders });
  } catch (e) {
    console.error('Orders error:', e);
    res.status(500).json({ success: false, message: 'Failed to get orders' });
  }
});

// Update order status
router.put('/orders/:id/status', adminAuth, (req, res) => {
  try {
    const { status } = req.body;
    db.run("UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [status, req.params.id]);
    res.json({ success: true, message: 'Status updated' });
  } catch (e) {
    console.error('Update order status error:', e);
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
});

// Get articles
router.get('/articles', adminAuth, (req, res) => {
  try {
    const articles = db.all("SELECT * FROM articles ORDER BY created_at DESC");
    res.json({ success: true, data: articles });
  } catch (e) {
    console.error('Articles error:', e);
    res.status(500).json({ success: false, message: 'Failed to get articles' });
  }
});

// Delete article
router.delete('/articles/:id', adminAuth, (req, res) => {
  try {
    db.run("DELETE FROM articles WHERE id = ?", [req.params.id]);
    res.json({ success: true, message: 'Article deleted' });
  } catch (e) {
    console.error('Delete article error:', e);
    res.status(500).json({ success: false, message: 'Failed to delete article' });
  }
});

// Get balance logs
router.get('/balance-logs', adminAuth, (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const logs = db.all(`
      SELECT bl.*, u.username FROM balance_logs bl
      LEFT JOIN users u ON bl.user_id = u.id
      ORDER BY bl.created_at DESC
      LIMIT ? OFFSET ?
    `, [parseInt(limit), offset]);

    res.json({ success: true, data: logs });
  } catch (e) {
    console.error('Balance logs error:', e);
    res.status(500).json({ success: false, message: 'Failed to get balance logs' });
  }
});

// Get files
router.get('/files', adminAuth, (req, res) => {
  try {
    const { page = 1, limit = 50, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = `SELECT f.*, u.username FROM uploaded_files f LEFT JOIN users u ON f.user_id = u.id`;
    let params = [];

    if (status !== undefined && status !== '') {
      sql += " WHERE f.status = ?";
      params.push(parseInt(status));
    }

    sql += " ORDER BY f.created_at DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), offset);

    const files = db.all(sql, params);
    res.json({ success: true, data: files });
  } catch (e) {
    console.error('Files error:', e);
    res.status(500).json({ success: false, message: 'Failed to get files' });
  }
});

// Review file
router.put('/files/:id/review', adminAuth, (req, res) => {
  try {
    const { status, admin_remark } = req.body;
    db.run("UPDATE uploaded_files SET status = ?, admin_remark = ? WHERE id = ?",
      [status, admin_remark || null, req.params.id]);
    res.json({ success: true, message: 'File reviewed' });
  } catch (e) {
    console.error('Review file error:', e);
    res.status(500).json({ success: false, message: 'Failed to review file' });
  }
});

// Delete file
router.delete('/files/:id', adminAuth, (req, res) => {
  try {
    const file = db.get("SELECT * FROM uploaded_files WHERE id = ?", [req.params.id]);
    if (file) {
      // Try to delete physical file
      const filePath = path.join(__dirname, '../../', file.file_path);
      try { require('fs').unlinkSync(filePath); } catch (e) {}
    }
    db.run("DELETE FROM uploaded_files WHERE id = ?", [req.params.id]);
    res.json({ success: true, message: 'File deleted' });
  } catch (e) {
    console.error('Delete file error:', e);
    res.status(500).json({ success: false, message: 'Failed to delete file' });
  }
});

module.exports = router;
