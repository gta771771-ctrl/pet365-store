const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'pet-service-platform-secret-key-2024';

function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Unauthorized' });
  try { req.user = jwt.verify(h.split(' ')[1], JWT_SECRET); next(); }
  catch (e) { return res.status(401).json({ success: false, message: 'Invalid token' }); }
}

// Get orders
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let sql = "SELECT * FROM orders WHERE user_id = $1";
    const params = [req.user.id];
    if (status) { sql += " AND status = $" + (params.length + 1); params.push(parseInt(status)); }
    sql += " ORDER BY created_at DESC LIMIT $" + (params.length + 1) + " OFFSET $" + (params.length + 2);
    params.push(parseInt(limit), offset);
    const orders = await db.all(sql, params);
    for (const order of orders) {
      order.items = await db.all("SELECT * FROM order_items WHERE order_id = $1", [order.id]);
    }
    const total = await db.get("SELECT COUNT(*) as count FROM orders WHERE user_id = $1", [req.user.id]);
    res.json({ success: true, data: orders, pagination: { total: parseInt(total.count), page: parseInt(page), limit: parseInt(limit) } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Create order
router.post('/', auth, async (req, res) => {
  try {
    const { items, receiver_name, receiver_phone, receiver_address, use_balance, remark } = req.body;
    if (!items || !items.length) return res.status(400).json({ success: false, message: 'No items' });
    let totalAmount = 0;
    const orderItems = [];
    for (const item of items) {
      const product = await db.get("SELECT * FROM products WHERE id = $1 AND status = 1", [item.product_id]);
      if (!product) return res.status(400).json({ success: false, message: 'Product not found: ' + item.product_id });
      if (product.stock < item.quantity) return res.status(400).json({ success: false, message: 'Insufficient stock: ' + product.name });
      totalAmount += product.price * item.quantity;
      orderItems.push({ product_id: product.id, product_name: product.name, product_image: product.image, price: product.price, quantity: item.quantity, specification: item.specification || '' });
    }
    const user = await db.get("SELECT balance FROM users WHERE id = $1", [req.user.id]);
    let balanceUsed = 0;
    let payAmount = totalAmount;
    if (use_balance && user.balance > 0) {
      balanceUsed = Math.min(user.balance, totalAmount);
      payAmount = totalAmount - balanceUsed;
    }
    const orderNo = 'ORD' + Date.now() + Math.random().toString(36).substr(2, 4).toUpperCase();
    const result = await db.run(
      "INSERT INTO orders (order_no, user_id, total_amount, pay_amount, balance_used, status, receiver_name, receiver_phone, receiver_address, remark) VALUES ($1,$2,$3,$4,$5,1,$6,$7,$8,$9)",
      [orderNo, req.user.id, totalAmount, payAmount, balanceUsed, receiver_name || '', receiver_phone || '', receiver_address || '', remark || '']
    );
    const orderId = result.lastInsertRowid;
    for (const item of orderItems) {
      await db.run("INSERT INTO order_items (order_id, product_id, product_name, product_image, price, quantity, specification) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [orderId, item.product_id, item.product_name, item.product_image, item.price, item.quantity, item.specification]);
      await db.run("UPDATE products SET stock = stock - $1, sales = sales + $2 WHERE id = $3", [item.quantity, item.quantity, item.product_id]);
    }
    if (balanceUsed > 0) {
      const newBalance = user.balance - balanceUsed;
      await db.run("UPDATE users SET balance = $1 WHERE id = $2", [newBalance, req.user.id]);
      await db.run("INSERT INTO balance_logs (user_id, type, amount, before_balance, after_balance, reason) VALUES ($1,'deduct',$2,$3,$4,$5)",
        [req.user.id, balanceUsed, user.balance, newBalance, 'Order payment: ' + orderNo]);
    }
    await db.run("DELETE FROM cart WHERE user_id = $1", [req.user.id]);
    res.json({ success: true, data: { order_no: orderNo, total_amount: totalAmount, pay_amount: payAmount, balance_used: balanceUsed } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Get order detail
router.get('/:id', auth, async (req, res) => {
  try {
    const order = await db.get("SELECT * FROM orders WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    order.items = await db.all("SELECT * FROM order_items WHERE order_id = $1", [order.id]);
    res.json({ success: true, data: order });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
