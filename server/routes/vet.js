const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../database');
const router = express.Router();

// Auth middleware
function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET || 'pet-service-platform-secret-key-2024');
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

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

// Get PayPal settings
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

// Wellness Plan Enrollment
router.post('/enroll-wellness', auth, async (req, res) => {
  try {
    const { plan_id, payment_method } = req.body;
    const plan = await db.get('SELECT * FROM wellness_plans WHERE id = $1 AND status = 1', [plan_id]);
    if (!plan) return res.status(400).json({ success: false, message: 'Plan not found' });
    res.json({ success: true, message: 'Enrolled successfully', plan });
  } catch (e) { 
    res.status(500).json({ success: false, message: e.message }); 
  }
});

module.exports = router;