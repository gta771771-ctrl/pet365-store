const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { run, get, all, save } = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;
  let sql = 'SELECT * FROM orders WHERE user_id = ?';
  const params = [req.user.id];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  const total = get(sql.replace('SELECT *', 'SELECT COUNT(*) as total'), params)?.total || 0;
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);
  const orders = all(sql, params);
  orders.forEach(o => { o.items = all('SELECT * FROM order_items WHERE order_id = ?', [o.id]); });
  res.json({ success: true, data: orders, pagination: { total, page: parseInt(page), limit: parseInt(limit) } });
});

router.get('/:id', authMiddleware, (req, res) => {
  const order = get('SELECT * FROM orders WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  order.items = all('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
  res.json({ success: true, data: order });
});

router.post('/', authMiddleware, (req, res) => {
  try {
    const { items, receiver_name, receiver_phone, receiver_address, remark, use_balance } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ success: false, message: 'No items' });

    const user = get('SELECT balance FROM users WHERE id = ?', [req.user.id]);
    let totalAmount = 0;
    const orderItems = [];
    for (const item of items) {
      const prod = get('SELECT * FROM products WHERE id = ? AND status = 1', [item.product_id]);
      if (!prod) return res.status(400).json({ success: false, message: `Product ${item.product_id} not available` });
      if (prod.stock < item.quantity) return res.status(400).json({ success: false, message: `Insufficient stock for ${prod.name}` });
      totalAmount += prod.price * item.quantity;
      orderItems.push({ ...prod, quantity: item.quantity, specification: item.specification || '' });
    }

    let discountAmount = 0;
    if (use_balance && user.balance > 0) discountAmount = Math.min(user.balance, totalAmount);
    const payAmount = totalAmount - discountAmount;
    const orderNo = 'ORD' + Date.now() + uuidv4().substring(0, 4).toUpperCase();

    const result = run('INSERT INTO orders (order_no, user_id, total_amount, discount_amount, pay_amount, use_balance, receiver_name, receiver_phone, receiver_address, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [orderNo, req.user.id, totalAmount, discountAmount, payAmount, discountAmount > 0 ? 1 : 0, receiver_name, receiver_phone, receiver_address, remark]);
    const orderId = result.lastInsertRowid;

    orderItems.forEach(item => {
      run('INSERT INTO order_items (order_id, product_id, product_name, product_image, price, quantity, specification) VALUES (?, ?, ?, ?, ?, ?, ?)', [orderId, item.id, item.name, item.image, item.price, item.quantity, item.specification]);
      run('UPDATE products SET stock = stock - ?, sales = sales + ? WHERE id = ?', [item.quantity, item.quantity, item.id]);
    });

    if (discountAmount > 0) {
      run('UPDATE users SET balance = balance - ? WHERE id = ?', [discountAmount, req.user.id]);
      run('INSERT INTO balance_logs (user_id, type, amount, before_balance, after_balance, reason) VALUES (?, ?, ?, ?, ?, ?)', [req.user.id, 'deduct', discountAmount, user.balance, user.balance - discountAmount, `Order ${orderNo}`]);
    }

    run('DELETE FROM cart WHERE user_id = ?', [req.user.id]);
    save();
    res.json({ success: true, data: { orderId, orderNo, payAmount } });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

router.put('/:id/cancel', authMiddleware, (req, res) => {
  const order = get('SELECT * FROM orders WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  if (order.status !== 1) return res.status(400).json({ success: false, message: 'Cannot cancel this order' });

  run('UPDATE orders SET status = 5 WHERE id = ?', [req.params.id]);
  const items = all('SELECT * FROM order_items WHERE order_id = ?', [req.params.id]);
  items.forEach(i => run('UPDATE products SET stock = stock + ?, sales = sales - ? WHERE id = ?', [i.quantity, i.quantity, i.product_id]));

  if (order.use_balance && order.discount_amount > 0) {
    const user = get('SELECT balance FROM users WHERE id = ?', [req.user.id]);
    run('UPDATE users SET balance = balance + ? WHERE id = ?', [order.discount_amount, req.user.id]);
    run('INSERT INTO balance_logs (user_id, type, amount, before_balance, after_balance, reason) VALUES (?, ?, ?, ?, ?, ?)', [req.user.id, 'refund', order.discount_amount, user.balance, user.balance + order.discount_amount, `Order ${order.order_no} cancelled`]);
  }
  save();
  res.json({ success: true });
});

module.exports = router;
