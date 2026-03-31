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

module.exports = router;
