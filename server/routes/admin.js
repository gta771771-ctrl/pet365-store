const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../database');
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'pet-service-platform-secret-key-2024';
const ADMIN_JWT_SECRET = JWT_SECRET + '-admin';

function adminAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Unauthorized' });
  try { req.admin = jwt.verify(h.split(' ')[1], ADMIN_JWT_SECRET); next(); }
  catch (e) { return res.status(401).json({ success: false, message: 'Invalid token' }); }
}

// Admin login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'Username and password required' });
    const admin = await db.get("SELECT * FROM admin_users WHERE username = $1", [username]);
    if (!admin || !bcrypt.compareSync(password, admin.password)) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: admin.id, username: admin.username, role: 'admin' }, ADMIN_JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, data: { token, admin: { id: admin.id, username: admin.username } } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Dashboard stats
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const [totalUsers, totalOrders, totalProducts, totalRevenue, recentOrders] = await Promise.all([
      db.get("SELECT COUNT(*) as count FROM users"),
      db.get("SELECT COUNT(*) as count FROM orders"),
      db.get("SELECT COUNT(*) as count FROM products"),
      db.get("SELECT COALESCE(SUM(pay_amount), 0) as total FROM orders WHERE status != 0"),
      db.all("SELECT o.*, u.username FROM orders o LEFT JOIN users u ON u.id = o.user_id ORDER BY o.created_at DESC LIMIT 5")
    ]);
    res.json({ success: true, data: {
      totalUsers: parseInt(totalUsers.count),
      totalOrders: parseInt(totalOrders.count),
      totalProducts: parseInt(totalProducts.count),
      totalRevenue: parseFloat(totalRevenue.total) || 0,
      recentOrders
    }});
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Users
router.get('/users', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, keyword } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let sql = "SELECT id, username, email, phone, balance, invite_code, level, status, created_at FROM users WHERE 1=1";
    const params = [];
    if (keyword) {
      sql += " AND (username LIKE $" + (params.length + 1) + " OR email LIKE $" + (params.length + 2) + ")";
      params.push('%' + keyword + '%', '%' + keyword + '%');
    }
    sql += " ORDER BY created_at DESC LIMIT $" + (params.length + 1) + " OFFSET $" + (params.length + 2);
    params.push(parseInt(limit), offset);
    const users = await db.all(sql, params);
    const total = await db.get("SELECT COUNT(*) as count FROM users");
    res.json({ success: true, data: users, pagination: { total: parseInt(total.count), page: parseInt(page), limit: parseInt(limit) } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/users/:id/status', adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    await db.run("UPDATE users SET status = $1 WHERE id = $2", [status, req.params.id]);
    res.json({ success: true, message: 'User status updated' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/users/:id/balance', adminAuth, async (req, res) => {
  try {
    const { amount, type, reason } = req.body;
    const user = await db.get("SELECT balance FROM users WHERE id = $1", [req.params.id]);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const newBalance = type === 'add' ? user.balance + amount : Math.max(0, user.balance - amount);
    await db.run("UPDATE users SET balance = $1 WHERE id = $2", [newBalance, req.params.id]);
    await db.run("INSERT INTO balance_logs (user_id, type, amount, before_balance, after_balance, reason) VALUES ($1,$2,$3,$4,$5,$6)",
      [req.params.id, type, amount, user.balance, newBalance, reason || 'Admin adjustment']);
    res.json({ success: true, data: { newBalance } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Products
router.get('/products', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, keyword, category } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let sql = "SELECT * FROM products WHERE 1=1";
    const params = [];
    if (keyword) { sql += " AND name LIKE $" + (params.length + 1); params.push('%' + keyword + '%'); }
    if (category) { sql += " AND category = $" + (params.length + 1); params.push(category); }
    sql += " ORDER BY created_at DESC LIMIT $" + (params.length + 1) + " OFFSET $" + (params.length + 2);
    params.push(parseInt(limit), offset);
    const products = await db.all(sql, params);
    const total = await db.get("SELECT COUNT(*) as count FROM products");
    res.json({ success: true, data: products, pagination: { total: parseInt(total.count), page: parseInt(page), limit: parseInt(limit) } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/products', adminAuth, async (req, res) => {
  try {
    const { name, description, price, original_price, image, category, stock } = req.body;
    if (!name || !price) return res.status(400).json({ success: false, message: 'Name and price required' });
    const result = await db.run(
      "INSERT INTO products (name, description, price, original_price, image, category, stock) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [name, description || '', parseFloat(price), parseFloat(original_price) || null, image || '', category || '', parseInt(stock) || 0]
    );
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/products/:id', adminAuth, async (req, res) => {
  try {
    const { name, description, price, original_price, image, category, stock, status } = req.body;
    await db.run(
      "UPDATE products SET name=$1, description=$2, price=$3, original_price=$4, image=$5, category=$6, stock=$7, status=$8 WHERE id=$9",
      [name, description || '', parseFloat(price), parseFloat(original_price) || null, image || '', category || '', parseInt(stock) || 0, status !== undefined ? status : 1, req.params.id]
    );
    res.json({ success: true, message: 'Product updated' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/products/:id', adminAuth, async (req, res) => {
  try {
    await db.run("UPDATE products SET status = 0 WHERE id = $1", [req.params.id]);
    res.json({ success: true, message: 'Product deleted' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Orders
router.get('/orders', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, keyword } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let sql = "SELECT o.*, u.username FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE 1=1";
    const params = [];
    if (status) { sql += " AND o.status = $" + (params.length + 1); params.push(parseInt(status)); }
    if (keyword) { sql += " AND (o.order_no LIKE $" + (params.length + 1) + " OR u.username LIKE $" + (params.length + 2) + ")"; params.push('%' + keyword + '%', '%' + keyword + '%'); }
    sql += " ORDER BY o.created_at DESC LIMIT $" + (params.length + 1) + " OFFSET $" + (params.length + 2);
    params.push(parseInt(limit), offset);
    const orders = await db.all(sql, params);
    const total = await db.get("SELECT COUNT(*) as count FROM orders");
    res.json({ success: true, data: orders, pagination: { total: parseInt(total.count), page: parseInt(page), limit: parseInt(limit) } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/orders/:id/status', adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    await db.run("UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [status, req.params.id]);
    res.json({ success: true, message: 'Order status updated' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Articles
router.get('/articles', adminAuth, async (req, res) => {
  try {
    const articles = await db.all("SELECT * FROM articles ORDER BY created_at DESC");
    res.json({ success: true, data: articles });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/articles', adminAuth, async (req, res) => {
  try {
    const { title, content, excerpt, image, category } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'Title required' });
    const result = await db.run("INSERT INTO articles (title, content, excerpt, image, category) VALUES ($1,$2,$3,$4,$5)",
      [title, content || '', excerpt || '', image || '', category || '']);
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/articles/:id', adminAuth, async (req, res) => {
  try {
    const { title, content, excerpt, image, category, status } = req.body;
    await db.run("UPDATE articles SET title=$1, content=$2, excerpt=$3, image=$4, category=$5, status=$6 WHERE id=$7",
      [title, content || '', excerpt || '', image || '', category || '', status !== undefined ? status : 1, req.params.id]);
    res.json({ success: true, message: 'Article updated' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/articles/:id', adminAuth, async (req, res) => {
  try {
    await db.run("DELETE FROM articles WHERE id = $1", [req.params.id]);
    res.json({ success: true, message: 'Article deleted' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Balance logs
router.get('/balance-logs', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const logs = await db.all(
      "SELECT bl.*, u.username FROM balance_logs bl LEFT JOIN users u ON u.id = bl.user_id ORDER BY bl.created_at DESC LIMIT $1 OFFSET $2",
      [parseInt(limit), offset]
    );
    const total = await db.get("SELECT COUNT(*) as count FROM balance_logs");
    res.json({ success: true, data: logs, pagination: { total: parseInt(total.count), page: parseInt(page), limit: parseInt(limit) } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Files
router.get('/files', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let sql = "SELECT f.*, u.username FROM uploaded_files f LEFT JOIN users u ON u.id = f.user_id WHERE 1=1";
    const params = [];
    if (status !== undefined) { sql += " AND f.status = $" + (params.length + 1); params.push(parseInt(status)); }
    sql += " ORDER BY f.created_at DESC LIMIT $" + (params.length + 1) + " OFFSET $" + (params.length + 2);
    params.push(parseInt(limit), offset);
    const files = await db.all(sql, params);
    const total = await db.get("SELECT COUNT(*) as count FROM uploaded_files");
    res.json({ success: true, data: files, pagination: { total: parseInt(total.count), page: parseInt(page), limit: parseInt(limit) } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/files/:id/review', adminAuth, async (req, res) => {
  try {
    const { status, admin_remark } = req.body;
    await db.run("UPDATE uploaded_files SET status = $1, admin_remark = $2 WHERE id = $3", [status, admin_remark || '', req.params.id]);
    res.json({ success: true, message: 'File reviewed' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/files/:id', adminAuth, async (req, res) => {
  try {
    const file = await db.get("SELECT * FROM uploaded_files WHERE id = $1", [req.params.id]);
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });
    await db.run("DELETE FROM uploaded_files WHERE id = $1", [req.params.id]);
    res.json({ success: true, message: 'File deleted' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Wellness Plans
router.get('/wellness-plans', adminAuth, async (req, res) => {
  try {
    const plans = await db.all("SELECT * FROM wellness_plans ORDER BY price ASC");
    for (const p of plans) { if (p.features) { try { p.features = JSON.parse(p.features); } catch (e) {} } }
    res.json({ success: true, data: plans });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/wellness-plans', adminAuth, async (req, res) => {
  try {
    const { name, description, price, reimbursement_amount, duration_days, features, status } = req.body;
    if (!name || !price) return res.status(400).json({ success: false, message: 'Name and price required' });
    const result = await db.run(
      "INSERT INTO wellness_plans (name, description, price, reimbursement_amount, duration_days, features, status) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [name, description || '', parseFloat(price), parseFloat(reimbursement_amount) || 0, parseInt(duration_days) || 365, features || '[]', status !== undefined ? status : 1]
    );
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/wellness-plans/:id', adminAuth, async (req, res) => {
  try {
    const { name, description, price, reimbursement_amount, duration_days, features, status } = req.body;
    await db.run(
      "UPDATE wellness_plans SET name=$1, description=$2, price=$3, reimbursement_amount=$4, duration_days=$5, features=$6, status=$7 WHERE id=$8",
      [name, description || '', parseFloat(price), parseFloat(reimbursement_amount) || 0, parseInt(duration_days) || 365, features || '[]', status !== undefined ? status : 1, req.params.id]
    );
    res.json({ success: true, message: 'Wellness plan updated' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/wellness-plans/:id', adminAuth, async (req, res) => {
  try {
    await db.run("DELETE FROM wellness_plans WHERE id = $1", [req.params.id]);
    res.json({ success: true, message: 'Wellness plan deleted' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Vet Discount Plans
router.get('/discount-plans', adminAuth, async (req, res) => {
  try {
    const plans = await db.all("SELECT * FROM vet_discount_plans ORDER BY price ASC");
    for (const p of plans) { if (p.features) { try { p.features = JSON.parse(p.features); } catch (e) {} } }
    res.json({ success: true, data: plans });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/discount-plans', adminAuth, async (req, res) => {
  try {
    const { name, description, price, features, status } = req.body;
    if (!name || !price) return res.status(400).json({ success: false, message: 'Name and price required' });
    const result = await db.run(
      "INSERT INTO vet_discount_plans (name, description, price, features, status) VALUES ($1,$2,$3,$4,$5)",
      [name, description || '', parseFloat(price), features || '[]', status !== undefined ? status : 1]
    );
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/discount-plans/:id', adminAuth, async (req, res) => {
  try {
    const { name, description, price, features, status } = req.body;
    await db.run(
      "UPDATE vet_discount_plans SET name=$1, description=$2, price=$3, features=$4, status=$5 WHERE id=$6",
      [name, description || '', parseFloat(price), features || '[]', status !== undefined ? status : 1, req.params.id]
    );
    res.json({ success: true, message: 'Vet discount plan updated' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/discount-plans/:id', adminAuth, async (req, res) => {
  try {
    await db.run("DELETE FROM vet_discount_plans WHERE id = $1", [req.params.id]);
    res.json({ success: true, message: 'Vet discount plan deleted' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});


// PayPal Settings
router.get('/settings/paypal', adminAuth, async (req, res) => {
  try {
    const row = await db.get('SELECT value FROM settings WHERE key = "paypal_email"');
    res.json({ success: true, data: { paypal_email: row ? row.value : '' } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/settings/paypal', adminAuth, async (req, res) => {
  try {
    const { paypal_email } = req.body;
    await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES ("paypal_email", $1)', [paypal_email || '']);
    res.json({ success: true, message: 'PayPal email updated' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
