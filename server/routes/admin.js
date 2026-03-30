const express = require('express');
const bcrypt = require('bcryptjs');
const { run, get, all, save } = require('../database');
const { authMiddleware, adminMiddleware, generateToken } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = get('SELECT * FROM users WHERE (username = ? OR email = ?) AND role = ?', [username, username, 'admin']);
    if (!user) return res.status(400).json({ success: false, message: 'Admin not found' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ success: false, message: 'Incorrect password' });
    const token = generateToken(user);
    res.json({ success: true, data: { token, user: { id: user.id, username: user.username } } });
  } catch (e) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.get('/stats', authMiddleware, adminMiddleware, (req, res) => {
  const totalUsers = get("SELECT COUNT(*) as c FROM users WHERE role = 'user'")?.c || 0;
  const totalOrders = get('SELECT COUNT(*) as c FROM orders')?.c || 0;
  const totalRevenue = get('SELECT COALESCE(SUM(pay_amount), 0) as s FROM orders WHERE status != 5')?.s || 0;
  const totalProducts = get('SELECT COUNT(*) as c FROM products')?.c || 0;
  const recentOrders = all('SELECT * FROM orders ORDER BY created_at DESC LIMIT 5');
  res.json({ success: true, data: { totalUsers, totalOrders, totalRevenue, totalProducts, recentOrders } });
});

router.get('/users', authMiddleware, adminMiddleware, (req, res) => {
  const { keyword, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  let sql = "SELECT u.*, p.username as parent_name FROM users u LEFT JOIN users p ON u.parent_id = p.id WHERE u.role = 'user'";
  const params = [];
  if (keyword) { sql += ' AND (u.username LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  const total = get(sql.replace('SELECT u.*, p.username as parent_name', 'SELECT COUNT(*) as total'), params)?.total || 0;
  sql += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);
  const users = all(sql, params);
  res.json({ success: true, data: users, pagination: { total, page: parseInt(page), limit: parseInt(limit) } });
});

router.put('/users/:id/status', authMiddleware, adminMiddleware, (req, res) => {
  const { status } = req.body;
  run('UPDATE users SET status = ? WHERE id = ?', [status, req.params.id]);
  save();
  res.json({ success: true });
});

router.post('/users/:id/balance', authMiddleware, adminMiddleware, (req, res) => {
  const { type, amount, reason } = req.body;
  const user = get('SELECT balance FROM users WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  let newBalance;
  if (type === 'add') newBalance = user.balance + amount;
  else if (type === 'deduct') newBalance = Math.max(0, user.balance - amount);
  else if (type === 'set') newBalance = amount;
  else return res.status(400).json({ success: false, message: 'Invalid type' });
  run('UPDATE users SET balance = ? WHERE id = ?', [newBalance, req.params.id]);
  run('INSERT INTO balance_logs (user_id, type, amount, before_balance, after_balance, reason) VALUES (?, ?, ?, ?, ?, ?)', [req.params.id, type, amount, user.balance, newBalance, reason || 'Admin adjustment']);
  save();
  res.json({ success: true, data: { balance: newBalance } });
});

router.get('/products', authMiddleware, adminMiddleware, (req, res) => {
  const { keyword, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  let sql = 'SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE 1=1';
  const params = [];
  if (keyword) { sql += ' AND p.name LIKE ?'; params.push(`%${keyword}%`); }
  const total = get(sql.replace('SELECT p.*, c.name as category_name', 'SELECT COUNT(*) as total'), params)?.total || 0;
  sql += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);
  const products = all(sql, params);
  res.json({ success: true, data: products, pagination: { total, page: parseInt(page), limit: parseInt(limit) } });
});

router.get('/orders', authMiddleware, adminMiddleware, (req, res) => {
  const { keyword, status, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  let sql = 'SELECT o.*, u.username FROM orders o JOIN users u ON o.user_id = u.id WHERE 1=1';
  const params = [];
  if (keyword) { sql += ' AND (o.order_no LIKE ? OR u.username LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
  if (status) { sql += ' AND o.status = ?'; params.push(status); }
  const total = get(sql.replace('SELECT o.*, u.username', 'SELECT COUNT(*) as total'), params)?.total || 0;
  sql += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);
  const orders = all(sql, params);
  res.json({ success: true, data: orders, pagination: { total, page: parseInt(page), limit: parseInt(limit) } });
});

router.put('/orders/:id/status', authMiddleware, adminMiddleware, (req, res) => {
  const { status } = req.body;
  run('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);
  save();
  res.json({ success: true });
});

router.get('/articles', authMiddleware, adminMiddleware, (req, res) => {
  const articles = all('SELECT * FROM articles ORDER BY created_at DESC');
  res.json({ success: true, data: articles });
});

router.delete('/articles/:id', authMiddleware, adminMiddleware, (req, res) => {
  run('DELETE FROM articles WHERE id = ?', [req.params.id]);
  save();
  res.json({ success: true });
});

router.get('/balance-logs', authMiddleware, adminMiddleware, (req, res) => {
  const logs = all('SELECT b.*, u.username FROM balance_logs b JOIN users u ON b.user_id = u.id ORDER BY b.created_at DESC LIMIT 100');
  res.json({ success: true, data: logs });
});

router.get('/files', authMiddleware, adminMiddleware, (req, res) => {
  const { status } = req.query;
  let sql = 'SELECT f.*, u.username FROM files f JOIN users u ON f.user_id = u.id WHERE 1=1';
  const params = [];
  if (status !== undefined && status !== '') { sql += ' AND f.status = ?'; params.push(status); }
  sql += ' ORDER BY f.created_at DESC';
  const files = all(sql, params);
  res.json({ success: true, data: files });
});

router.put('/files/:id/review', authMiddleware, adminMiddleware, (req, res) => {
  const { status, admin_remark } = req.body;
  run('UPDATE files SET status = ?, admin_remark = ? WHERE id = ?', [status, admin_remark || '', req.params.id]);
  save();
  res.json({ success: true });
});

router.delete('/files/:id', authMiddleware, adminMiddleware, (req, res) => {
  const file = get('SELECT * FROM files WHERE id = ?', [req.params.id]);
  if (file) {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(__dirname, '../../public', file.file_path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    run('DELETE FROM files WHERE id = ?', [req.params.id]);
    save();
  }
  res.json({ success: true });
});

module.exports = router;
