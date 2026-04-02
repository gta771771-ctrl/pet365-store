const express = require('express');
const db = require('../database');
const router = express.Router();

// Get vet discount plans
router.get('/discount-plans', async (req, res) => {
  try {
    const plans = await db.all("SELECT * FROM vet_discount_plans WHERE status = 1 ORDER BY price ASC");
    for (const p of plans) {
      if (p.features) { try { p.features = JSON.parse(p.features); } catch (e) {} }
    }
    res.json({ success: true, data: plans });
  } catch (e) {
    console.error('Discount plans error:', e);
    res.status(500).json({ success: false, message: 'Failed to get discount plans' });
  }
});

// Get wellness plans
router.get('/wellness-plans', async (req, res) => {
  try {
    const plans = await db.all("SELECT * FROM wellness_plans WHERE status = 1 ORDER BY price ASC");
    for (const p of plans) {
      if (p.features) { try { p.features = JSON.parse(p.features); } catch (e) {} }
    }
    res.json({ success: true, data: plans });
  } catch (e) {
    console.error('Wellness plans error:', e);
    res.status(500).json({ success: false, message: 'Failed to get wellness plans' });
  }
});

// Get vet clinics
router.get('/clinics', async (req, res) => {
  try {
    const clinics = await db.all("SELECT * FROM vet_clinics WHERE status = 1 LIMIT 50");
    res.json({ success: true, data: clinics });
  } catch (e) {
    console.error('Clinics error:', e);
    res.status(500).json({ success: false, message: 'Failed to get clinics' });
  }
});

// Submit vet visit (savings claim)
router.post('/vet-transactions', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET || 'pet-service-platform-secret-key-2024');
    const { clinic_id, amount } = req.body;
    if (!clinic_id || !amount) {
      return res.status(400).json({ success: false, message: 'Clinic and amount required' });
    }
    const savings = amount * 0.25;
    const result = await db.run(
      "INSERT INTO vet_transactions (user_id, clinic_id, amount, savings) VALUES ($1,$2,$3,$4)",
      [decoded.id, clinic_id, amount, savings]
    );
    res.json({ success: true, data: { id: result.lastInsertRowid, savings } });
  } catch (e) {
    console.error('Vet transaction error:', e);
    res.status(500).json({ success: false, message: 'Failed to submit vet visit' });
  }
});

// Get vet transactions
router.get('/vet-transactions', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET || 'pet-service-platform-secret-key-2024');
    const txns = await db.all(
      "SELECT vt.*, vc.name as clinic_name FROM vet_transactions vt LEFT JOIN vet_clinics vc ON vc.id = vt.clinic_id WHERE vt.user_id = $1 ORDER BY vt.created_at DESC LIMIT 50",
      [decoded.id]
    );
    res.json({ success: true, data: txns });
  } catch (e) {
    console.error('Vet transactions error:', e);
    res.status(500).json({ success: false, message: 'Failed to get vet transactions' });
  }
});

// Public endpoints
router.get('/discount', async (req, res) => {
  try {
    const plans = await db.all("SELECT * FROM vet_discount_plans WHERE status = 1 ORDER BY price ASC");
    res.json({ success: true, data: plans });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/wellness', async (req, res) => {
  try {
    const plans = await db.all("SELECT * FROM wellness_plans WHERE status = 1 ORDER BY price ASC");
    res.json({ success: true, data: plans });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});


// Wellness Plan Enrollment with payment
router.post('/enroll-wellness', auth, async (req, res) => {
  try {
    const { plan_id, payment_method, paypal_order_id } = req.body;
    const user = req.user;
    
    // Get plan details
    const plan = await db.get('SELECT * FROM wellness_plans WHERE id = $1 AND status = 1', [plan_id]);
    if (!plan) return res.status(400).json({ success: false, message: 'Plan not found' });
    
    // Get PayPal email from settings
    const settings = await db.get('SELECT value FROM settings WHERE key = "paypal_email"');
    const paypalEmail = settings ? settings.value : '';
    
    // If PayPal payment, verify with backend first (simplified - just record intent)
    if (payment_method === 'paypal' && !paypal_order_id) {
      // Create PayPal order - simplified, return mock URL for demo
      const mockPayPalUrl = 'https://www.paypal.com/checkoutnow?token=demo-' + Date.now();
      return res.json({ 
        success: true, 
        paypal_url: mockPayPalUrl,
        message: 'Redirect to PayPal'
      });
    }
    
    // For demo: Check user balance or create pending payment
    const userData = await db.get('SELECT balance FROM users WHERE id = $1', [user.id]);
    const balance = userData ? userData.balance : 0;
    
    // For now, allow balance payment or create subscription
    if (payment_method === 'balance' || balance >= plan.price) {
      // Deduct from balance
      const newBalance = balance - plan.price;
      await db.run('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, user.id]);
      
      // Record transaction
      await db.run(
        "INSERT INTO balance_logs (user_id, type, amount, before_balance, after_balance, reason) VALUES ($1, 'deduct', $2, $3, $4, $5)",
        [user.id, plan.price, balance, newBalance, 'Wellness Plan: ' + plan.name]
      );
    }
    
    // Record subscription (simplified - would need wellness_subscriptions table)
    res.json({ 
      success: true, 
      message: 'Enrolled in ' + plan.name + '!',
      plan: plan
    });
  } catch (e) { 
    console.error('Enroll wellness error:', e);
    res.status(500).json({ success: false, message: e.message }); 
  }
});

// Get PayPal settings for frontend
router.get('/settings/paypal', async (req, res) => {
  try {
    const settings = await db.get('SELECT value FROM settings WHERE key = "paypal_email"');
    res.json({ 
      success: true, 
      paypal_email: settings ? settings.value : '' 
    });
  } catch (e) { 
    res.status(500).json({ success: false, message: e.message }); 
  }
});

module.exports = router;
