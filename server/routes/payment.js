const express = require('express');
const router = express.Router();
const db = require('../database');

// Simple auth middleware
function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  next();
}

// Create PayPal payment order
router.post('/paypal/create', auth, async (req, res) => {
  try {
    const { amount, plan_id, type } = req.body;
    
    // Get PayPal email from settings
    const settings = await db.get('SELECT value FROM settings WHERE key = "paypal_email"');
    
    if (!settings || !settings.value) {
      return res.json({ success: false, message: 'PayPal not configured' });
    }
    
    // In production, this would call PayPal API to create an order
    // For now, return a demo link
    const orderId = 'DEMO-' + Date.now();
    const paypalUrl = `https://www.paypal.com/checkoutnow?token=${orderId}`;
    
    res.json({
      success: true,
      order_id: orderId,
      paypal_url: paypalUrl,
      amount: amount
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PayPal webhook callback (for verification)
router.post('/paypal/webhook', async (req, res) => {
  try {
    const { order_id, status } = req.body;
    
    // Verify payment with PayPal API in production
    
    if (status === 'COMPLETED') {
      // Update order status, create subscription, etc.
      console.log('Payment completed:', order_id);
    }
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;