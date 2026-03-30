const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'pet-service-platform-secret-key-2024';

// Admin login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'Username and password required' });
    const admin = db.get("SELECT * FROM admin_users WHERE username = ?", [username]);
    if (!admin || !bcrypt.compareSync(password, admin.password)) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    const token = jwt.sign({ id: admin.id, username: admin.username, isAdmin: true }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, data: { token, user: { id: admin.id, username: admin.username } } });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.isAdmin) return res.status(403).json({ success: false, message: 'Forbidden' });
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
    const activeDiscount = db.get("SELECT COUNT(*) as count FROM member_discount_enrollments WHERE status = 'active'");
    const activeWellness = db.get("SELECT COUNT(*) as count FROM member_wellness_enrollments WHERE status = 'active'");
    const pendingClaims = db.get("SELECT COUNT(*) as count FROM reimbursement_claims WHERE status = 'pending'");
    const recentOrders = db.all("SELECT o.*, u.username FROM orders o LEFT JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC LIMIT 10");
    res.json({
      success: true,
      data: {
        totalUsers: totalUsers.count, totalOrders: totalOrders.count, totalProducts: totalProducts.count,
        totalRevenue: totalRevenue.total.toFixed(2), activeDiscount: activeDiscount.count, activeWellness: activeWellness.count,
        pendingClaims: pendingClaims.count, recentOrders
      }
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ===== USERS =====
router.get('/users', adminAuth, (req, res) => {
  try {
    const { page = 1, limit = 20, keyword } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let sql = "SELECT u.*, p.username as parent_name FROM users u LEFT JOIN users p ON u.parent_id = p.id";
    let params = [];
    if (keyword) { sql += " WHERE u.username LIKE ? OR u.email LIKE ? OR u.phone LIKE ?"; params.push('%'+keyword+'%', '%'+keyword+'%', '%'+keyword+'%'); }
    sql += " ORDER BY u.created_at DESC LIMIT ? OFFSET ?"; params.push(parseInt(limit), offset);
    const users = db.all(sql, params);
    res.json({ success: true, data: users });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/users/:id/status', adminAuth, (req, res) => {
  try {
    db.run("UPDATE users SET status = ? WHERE id = ?", [req.body.status, req.params.id]);
    res.json({ success: true, message: 'Status updated' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/users/:id/balance', adminAuth, (req, res) => {
  try {
    const { type, amount, reason } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'Invalid amount' });
    const user = db.get("SELECT * FROM users WHERE id = ?", [req.params.id]);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    let newBalance;
    if (type === 'add') newBalance = user.balance + amount;
    else if (type === 'deduct') newBalance = Math.max(0, user.balance - amount);
    else if (type === 'set') newBalance = amount;
    else return res.status(400).json({ success: false, message: 'Invalid type' });
    db.run("UPDATE users SET balance = ? WHERE id = ?", [newBalance, req.params.id]);
    db.run("INSERT INTO balance_logs (user_id, type, amount, before_balance, after_balance, reason) VALUES (?, ?, ?, ?, ?, ?)",
      [req.params.id, type, amount, user.balance, newBalance, reason || 'Admin adjustment']);
    res.json({ success: true, message: 'Balance updated', data: { newBalance } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ===== PRODUCTS =====
router.get('/products', adminAuth, (req, res) => {
  try {
    const { page = 1, limit = 20, keyword } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let sql = "SELECT * FROM products";
    let params = [];
    if (keyword) { sql += " WHERE name LIKE ?"; params.push('%'+keyword+'%'); }
    sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?"; params.push(parseInt(limit), offset);
    res.json({ success: true, data: db.all(sql, params) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/products', adminAuth, (req, res) => {
  try {
    const { name, description, price, original_price, image, category, stock, status } = req.body;
    const result = db.run("INSERT INTO products (name, description, price, original_price, image, category, stock, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [name, description||null, price||0, original_price||null, image||null, category||null, stock||0, status||1]);
    res.json({ success: true, data: db.get("SELECT * FROM products WHERE id = ?", [result.lastInsertRowid]) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/products/:id', adminAuth, (req, res) => {
  try {
    const { name, description, price, original_price, image, category, stock, status } = req.body;
    db.run("UPDATE products SET name=?, description=?, price=?, original_price=?, image=?, category=?, stock=?, status=? WHERE id=?",
      [name, description||null, price||0, original_price||null, image||null, category||null, stock||0, status||1, req.params.id]);
    res.json({ success: true, data: db.get("SELECT * FROM products WHERE id = ?", [req.params.id]) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/products/:id', adminAuth, (req, res) => {
  try { db.run("DELETE FROM products WHERE id = ?", [req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ===== ORDERS =====
router.get('/orders', adminAuth, (req, res) => {
  try {
    const { page = 1, limit = 20, keyword, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let sql = "SELECT o.*, u.username FROM orders o LEFT JOIN users u ON o.user_id = u.id";
    let params = [];
    if (keyword) { sql += " WHERE o.order_no LIKE ? OR u.username LIKE ?"; params.push('%'+keyword+'%', '%'+keyword+'%'); }
    if (status) { sql += (keyword ? " AND" : " WHERE") + " o.status = ?"; params.push(parseInt(status)); }
    sql += " ORDER BY o.created_at DESC LIMIT ? OFFSET ?"; params.push(parseInt(limit), offset);
    const orders = db.all(sql, params);
    for (const o of orders) { o.items = db.all("SELECT * FROM order_items WHERE order_id = ?", [o.id]); }
    res.json({ success: true, data: orders });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/orders/:id/status', adminAuth, (req, res) => {
  try { db.run("UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [req.body.status, req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ===== ARTICLES =====
router.get('/articles', adminAuth, (req, res) => {
  try { res.json({ success: true, data: db.all("SELECT * FROM articles ORDER BY created_at DESC") }); } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/articles', adminAuth, (req, res) => {
  try {
    const { title, content, excerpt, image, category, status } = req.body;
    const result = db.run("INSERT INTO articles (title, content, excerpt, image, category, status) VALUES (?, ?, ?, ?, ?, ?)",
      [title, content||null, excerpt||null, image||null, category||null, status||1]);
    res.json({ success: true, data: db.get("SELECT * FROM articles WHERE id = ?", [result.lastInsertRowid]) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/articles/:id', adminAuth, (req, res) => {
  try {
    const { title, content, excerpt, image, category, status } = req.body;
    db.run("UPDATE articles SET title=?, content=?, excerpt=?, image=?, category=?, status=? WHERE id=?",
      [title, content||null, excerpt||null, image||null, category||null, status||1, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/articles/:id', adminAuth, (req, res) => {
  try { db.run("DELETE FROM articles WHERE id = ?", [req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ===== BALANCE LOGS =====
router.get('/balance-logs', adminAuth, (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    res.json({ success: true, data: db.all("SELECT bl.*, u.username FROM balance_logs bl LEFT JOIN users u ON bl.user_id = u.id ORDER BY bl.created_at DESC LIMIT ? OFFSET ?", [parseInt(limit), offset]) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ===== FILES =====
router.get('/files', adminAuth, (req, res) => {
  try {
    const { page = 1, limit = 50, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let sql = "SELECT f.*, u.username FROM uploaded_files f LEFT JOIN users u ON f.user_id = u.id";
    let params = [];
    if (status !== undefined && status !== '') { sql += " WHERE f.status = ?"; params.push(parseInt(status)); }
    sql += " ORDER BY f.created_at DESC LIMIT ? OFFSET ?"; params.push(parseInt(limit), offset);
    res.json({ success: true, data: db.all(sql, params) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/files/:id/review', adminAuth, (req, res) => {
  try { db.run("UPDATE uploaded_files SET status = ?, admin_remark = ? WHERE id = ?", [req.body.status, req.body.admin_remark||null, req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/files/:id', adminAuth, (req, res) => {
  try {
    const file = db.get("SELECT * FROM uploaded_files WHERE id = ?", [req.params.id]);
    if (file) { try { require('fs').unlinkSync(path.join(__dirname,'../../',file.file_path)); } catch(e){} }
    db.run("DELETE FROM uploaded_files WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ===== VET CLINICS (Admin) =====
router.get('/vet-clinics', adminAuth, (req, res) => {
  try { res.json({ success: true, data: db.all("SELECT * FROM vet_clinics ORDER BY name") }); } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/vet-clinics', adminAuth, (req, res) => {
  try {
    const { name, address, city, state, zip, phone, email, website, description, services, hours } = req.body;
    const result = db.run("INSERT INTO vet_clinics (name, address, city, state, zip, phone, email, website, description, services, hours) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [name, address||null, city||null, state||null, zip||null, phone||null, email||null, website||null, description||null, services||null, hours||null]);
    res.json({ success: true, data: db.get("SELECT * FROM vet_clinics WHERE id = ?", [result.lastInsertRowid]) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/vet-clinics/:id', adminAuth, (req, res) => {
  try {
    const { name, address, city, state, zip, phone, email, website, description, services, hours, status } = req.body;
    db.run("UPDATE vet_clinics SET name=?, address=?, city=?, state=?, zip=?, phone=?, email=?, website=?, description=?, services=?, hours=?, status=? WHERE id=?",
      [name, address||null, city||null, state||null, zip||null, phone||null, email||null, website||null, description||null, services||null, hours||null, status||1, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/vet-clinics/:id', adminAuth, (req, res) => {
  try { db.run("DELETE FROM vet_clinics WHERE id = ?", [req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ===== DISCOUNT PLANS (Admin) =====
router.get('/discount-plans', adminAuth, (req, res) => {
  try { res.json({ success: true, data: db.all("SELECT * FROM discount_plans ORDER BY monthly_fee") }); } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/discount-plans', adminAuth, (req, res) => {
  try {
    const { name, description, discount_percent, monthly_fee, features, max_pets, status } = req.body;
    const result = db.run("INSERT INTO discount_plans (name, description, discount_percent, monthly_fee, features, max_pets, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [name, description||null, discount_percent||0, monthly_fee||0, features||null, max_pets||1, status||1]);
    res.json({ success: true, data: db.get("SELECT * FROM discount_plans WHERE id = ?", [result.lastInsertRowid]) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/discount-plans/:id', adminAuth, (req, res) => {
  try {
    const { name, description, discount_percent, monthly_fee, features, max_pets, status } = req.body;
    db.run("UPDATE discount_plans SET name=?, description=?, discount_percent=?, monthly_fee=?, features=?, max_pets=?, status=? WHERE id=?",
      [name, description||null, discount_percent||0, monthly_fee||0, features||null, max_pets||1, status||1, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/discount-plans/:id', adminAuth, (req, res) => {
  try { db.run("DELETE FROM discount_plans WHERE id = ?", [req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ===== WELLNESS PLANS (Admin) =====
router.get('/wellness-plans', adminAuth, (req, res) => {
  try { res.json({ success: true, data: db.all("SELECT * FROM wellness_plans ORDER BY annual_fee") }); } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/wellness-plans', adminAuth, (req, res) => {
  try {
    const { name, description, annual_fee, reimbursement_percent, max_reimbursement, features, status } = req.body;
    const result = db.run("INSERT INTO wellness_plans (name, description, annual_fee, reimbursement_percent, max_reimbursement, features, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [name, description||null, annual_fee||0, reimbursement_percent||0, max_reimbursement||0, features||null, status||1]);
    res.json({ success: true, data: db.get("SELECT * FROM wellness_plans WHERE id = ?", [result.lastInsertRowid]) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/wellness-plans/:id', adminAuth, (req, res) => {
  try {
    const { name, description, annual_fee, reimbursement_percent, max_reimbursement, features, status } = req.body;
    db.run("UPDATE wellness_plans SET name=?, description=?, annual_fee=?, reimbursement_percent=?, max_reimbursement=?, features=?, status=? WHERE id=?",
      [name, description||null, annual_fee||0, reimbursement_percent||0, max_reimbursement||0, features||null, status||1, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/wellness-plans/:id', adminAuth, (req, res) => {
  try { db.run("DELETE FROM wellness_plans WHERE id = ?", [req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ===== REIMBURSEMENT CLAIMS (Admin) =====
router.get('/reimbursements', adminAuth, (req, res) => {
  try {
    const { page = 1, limit = 50, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let sql = "SELECT rc.*, u.username, p.name as pet_name FROM reimbursement_claims rc LEFT JOIN users u ON rc.user_id = u.id LEFT JOIN pets p ON p.id = rc.pet_id";
    let params = [];
    if (status) { sql += " WHERE rc.status = ?"; params.push(status); }
    sql += " ORDER BY rc.created_at DESC LIMIT ? OFFSET ?"; params.push(parseInt(limit), offset);
    res.json({ success: true, data: db.all(sql, params) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/reimbursements/:id/review', adminAuth, (req, res) => {
  try {
    const { status, admin_remark } = req.body;
    const claim = db.get("SELECT * FROM reimbursement_claims WHERE id = ?", [req.params.id]);
    if (!claim) return res.status(404).json({ success: false, message: 'Claim not found' });
    db.run("UPDATE reimbursement_claims SET status = ?, admin_remark = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ? WHERE id = ?",
      [status, admin_remark||null, req.admin.id, req.params.id]);
    // If approved, add balance to user
    if (status === 'approved') {
      const user = db.get("SELECT balance FROM users WHERE id = ?", [claim.user_id]);
      const newBalance = user.balance + claim.reimbursement_amount;
      db.run("UPDATE users SET balance = ? WHERE id = ?", [newBalance, claim.user_id]);
      db.run("INSERT INTO balance_logs (user_id, type, amount, before_balance, after_balance, reason) VALUES (?, 'reimbursement', ?, ?, ?, ?)",
        [claim.user_id, claim.reimbursement_amount, user.balance, newBalance, 'Wellness reimbursement: ' + claim.description]);
      db.run("UPDATE reimbursement_claims SET reimbursement_amount = ? WHERE id = ?", [claim.reimbursement_amount, req.params.id]);
    }
    res.json({ success: true, message: 'Claim ' + status });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ===== VET TRANSACTIONS (Admin) =====
router.get('/vet-transactions', adminAuth, (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    res.json({ success: true, data: db.all("SELECT vt.*, u.username, p.name as pet_name, c.name as clinic_name FROM vet_transactions vt LEFT JOIN users u ON vt.user_id = u.id LEFT JOIN pets p ON p.id = vt.pet_id LEFT JOIN vet_clinics c ON c.id = vt.clinic_id ORDER BY vt.transaction_date DESC LIMIT ? OFFSET ?", [parseInt(limit), offset]) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ===== PETS (Admin) =====
router.get('/pets', adminAuth, (req, res) => {
  try { res.json({ success: true, data: db.all("SELECT p.*, u.username FROM pets p LEFT JOIN users u ON p.user_id = u.id ORDER BY p.created_at DESC") }); } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ===== ENROLLMENTS (Admin) =====
router.get('/enrollments', adminAuth, (req, res) => {
  try {
    const discount = db.all("SELECT me.*, u.username, dp.name as plan_name FROM member_discount_enrollments me LEFT JOIN users u ON me.user_id = u.id LEFT JOIN discount_plans dp ON dp.id = me.plan_id ORDER BY me.created_at DESC");
    const wellness = db.all("SELECT mw.*, u.username, wp.name as plan_name FROM member_wellness_enrollments mw LEFT JOIN users u ON mw.user_id = u.id LEFT JOIN wellness_plans wp ON wp.id = mw.plan_id ORDER BY mw.created_at DESC");
    res.json({ success: true, data: { discount, wellness } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;