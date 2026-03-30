const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../database');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'pet-service-platform-secret-key-2024';

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

// Create order
router.post('/', authMiddleware, (req, res) => {
  try {
    const { items, receiver_name, receiver_phone, receiver_address, remark, use_balance } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'No items' });
    }

    // Calculate total
    let totalAmount = 0;
    for (const item of items) {
      const product = db.get("SELECT price, stock, status FROM products WHERE id = ?", [item.product_id]);
      if (product && product.status === 1 && product.stock >= item.quantity) {
        totalAmount += product.price * item.quantity;
      }
    }

    if (totalAmount === 0) {
      return res.status(400).json({ success: false, message: 'No valid items' });
    }

    // Use balance if checked
    let balanceUsed = 0;
    let payAmount = totalAmount;

    if (use_balance) {
      const user = db.get("SELECT balance FROM users WHERE id = ?", [req.user.id]);
      if (user && user.balance > 0) {
        balanceUsed = Math.min(user.balance, totalAmount);
        payAmount = totalAmount - balanceUsed;
      }
    }

    // Generate order number
    const orderNo = 'ORD' + Date.now() + Math.random().toString(36).substr(2, 6).toUpperCase();

    // Create order
    const orderResult = db.run(
      "INSERT INTO orders (order_no, user_id, total_amount, pay_amount, balance_used, status, receiver_name, receiver_phone, receiver_address, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [orderNo, req.user.id, totalAmount, payAmount, balanceUsed, 1, receiver_name, receiver_phone, receiver_address, remark || null]
    );

    const orderId = orderResult.lastInsertRowid;

    // Insert order items
    for (const item of items) {
      const product = db.get("SELECT name, price, image FROM products WHERE id = ?", [item.product_id]);
      if (product) {
        db.run(
          "INSERT INTO order_items (order_id, product_id, product_name, product_image, price, quantity, specification) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [orderId, item.product_id, product.name, product.image, product.price, item.quantity, item.specification || null]
        );

        // Update stock
        db.run("UPDATE products SET stock = stock - ?, sales = sales + ? WHERE id = ?",
          [item.quantity, item.quantity, item.product_id]);
      }
    }

    // Deduct balance
    if (balanceUsed > 0) {
      const user = db.get("SELECT balance FROM users WHERE id = ?", [req.user.id]);
      db.run("UPDATE users SET balance = ? WHERE id = ?", [user.balance - balanceUsed, req.user.id]);
      db.run("INSERT INTO balance_logs (user_id, type, amount, before_balance, after_balance, reason) VALUES (?, 'deduct', ?, ?, ?, ?)",
        [req.user.id, balanceUsed, user.balance, user.balance - balanceUsed, 'Order payment: ' + orderNo]);
    }

    // Clear cart
    db.run("DELETE FROM cart WHERE user_id = ?", [req.user.id]);

    res.json({ success: true, data: { order_id: orderId, order_no: orderNo, pay_amount: payAmount } });
  } catch (e) {
    console.error('Create order error:', e);
    res.status(500).json({ success: false, message: 'Failed to create order' });
  }
});

// Get orders
router.get('/', authMiddleware, (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = "SELECT * FROM orders WHERE user_id = ?";
    let params = [req.user.id];

    if (status) {
      sql += " AND status = ?";
      params.push(parseInt(status));
    }

    sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), offset);

    const orders = db.all(sql, params);

    // Get order items
    for (const order of orders) {
      order.items = db.all("SELECT * FROM order_items WHERE order_id = ?", [order.id]);
    }

    const total = db.get("SELECT COUNT(*) as count FROM orders WHERE user_id = ?", [req.user.id]);

    res.json({ success: true, data: orders, pagination: { total: total.count, page: parseInt(page), limit: parseInt(limit) } });
  } catch (e) {
    console.error('Get orders error:', e);
    res.status(500).json({ success: false, message: 'Failed to get orders' });
  }
});

// Cancel order
router.put('/:id/cancel', authMiddleware, (req, res) => {
  try {
    const order = db.get("SELECT * FROM orders WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.status !== 1) {
      return res.status(400).json({ success: false, message: 'Cannot cancel this order' });
    }

    // Refund balance
    if (order.balance_used > 0) {
      const user = db.get("SELECT balance FROM users WHERE id = ?", [req.user.id]);
      db.run("UPDATE users SET balance = ? WHERE id = ?", [user.balance + order.balance_used, req.user.id]);
      db.run("INSERT INTO balance_logs (user_id, type, amount, before_balance, after_balance, reason) VALUES (?, 'refund', ?, ?, ?, ?)",
        [req.user.id, order.balance_used, user.balance, user.balance + order.balance_used, 'Order cancelled: ' + order.order_no]);
    }

    // Restore stock
    const items = db.all("SELECT product_id, quantity FROM order_items WHERE order_id = ?", [order.id]);
    for (const item of items) {
      db.run("UPDATE products SET stock = stock + ? WHERE id = ?", [item.quantity, item.product_id]);
    }

    // Update order status
    db.run("UPDATE orders SET status = 5, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [order.id]);

    res.json({ success: true, message: 'Order cancelled' });
  } catch (e) {
    console.error('Cancel order error:', e);
    res.status(500).json({ success: false, message: 'Failed to cancel order' });
  }
});

module.exports = router;
