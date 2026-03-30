const express = require('express');
const router = express.Router();
const db = require('../database');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const token = authHeader.split(' ')[1];
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'pet-service-platform-secret-key-2024';
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) { return res.status(401).json({ success: false, message: 'Invalid token' }); }
}

router.get('/clinics', (req, res) => {
  try { res.json({ success: true, data: db.all("SELECT * FROM vet_clinics WHERE status = 1 ORDER BY name") }); }
  catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/clinics/:id', (req, res) => {
  try {
    const clinic = db.get("SELECT * FROM vet_clinics WHERE id = ?", [req.params.id]);
    if (!clinic) return res.status(404).json({ success: false, message: 'Clinic not found' });
    res.json({ success: true, data: clinic });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/discount-plans', (req, res) => {
  try { res.json({ success: true, data: db.all("SELECT * FROM discount_plans WHERE status = 1 ORDER BY monthly_fee") }); }
  catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/wellness-plans', (req, res) => {
  try { res.json({ success: true, data: db.all("SELECT * FROM wellness_plans WHERE status = 1 ORDER BY annual_fee") }); }
  catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/my-enrollments', authMiddleware, (req, res) => {
  try {
    const discount = db.all("SELECT me.*, dp.name as plan_name, dp.discount_percent, dp.monthly_fee, dp.features FROM member_discount_enrollments me JOIN discount_plans dp ON dp.id = me.plan_id WHERE me.user_id = ? ORDER BY me.created_at DESC", [req.user.id]);
    const wellness = db.all("SELECT mw.*, wp.name as plan_name, wp.annual_fee, wp.reimbursement_percent, wp.max_reimbursement FROM member_wellness_enrollments mw JOIN wellness_plans wp ON wp.id = mw.plan_id WHERE mw.user_id = ? ORDER BY mw.created_at DESC", [req.user.id]);
    res.json({ success: true, data: { discount, wellness } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/enroll-discount', authMiddleware, (req, res) => {
  try {
    const { plan_id } = req.body;
    if (!plan_id) return res.status(400).json({ success: false, message: 'Plan ID required' });
    const plan = db.get("SELECT * FROM discount_plans WHERE id = ? AND status = 1", [plan_id]);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
    const existing = db.get("SELECT id FROM member_discount_enrollments WHERE user_id = ? AND plan_id = ? AND status = 'active'", [req.user.id, plan_id]);
    if (existing) return res.status(400).json({ success: false, message: 'Already enrolled' });
    const result = db.run("INSERT INTO member_discount_enrollments (user_id, plan_id, status, end_date) VALUES (?, ?, 'active', datetime('now', '+1 year'))", [req.user.id, plan_id]);
    res.json({ success: true, data: db.get("SELECT * FROM member_discount_enrollments WHERE id = ?", [result.lastInsertRowid]), message: 'Enrolled!' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/enroll-wellness', authMiddleware, (req, res) => {
  try {
    const { plan_id } = req.body;
    if (!plan_id) return res.status(400).json({ success: false, message: 'Plan ID required' });
    const plan = db.get("SELECT * FROM wellness_plans WHERE id = ? AND status = 1", [plan_id]);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
    const now = new Date();
    const result = db.run("INSERT INTO member_wellness_enrollments (user_id, plan_id, status, annual_year, end_date) VALUES (?, ?, 'active', ?, datetime('now', '+1 year'))", [req.user.id, plan_id, now.getFullYear()]);
    res.json({ success: true, data: db.get("SELECT * FROM member_wellness_enrollments WHERE id = ?", [result.lastInsertRowid]), message: 'Enrolled!' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/vet-transaction', authMiddleware, (req, res) => {
  try {
    const { pet_id, clinic_id, service_type, original_amount, description, invoice_no } = req.body;
    if (!original_amount || original_amount <= 0) return res.status(400).json({ success: false, message: 'Valid amount required' });
    const enrollment = db.get("SELECT me.*, dp.discount_percent FROM member_discount_enrollments me JOIN discount_plans dp ON dp.id = me.plan_id WHERE me.user_id = ? AND me.status = 'active' LIMIT 1", [req.user.id]);
    let discountAmount = 0, finalAmount = parseFloat(original_amount);
    if (enrollment) { discountAmount = finalAmount * (enrollment.discount_percent / 100); finalAmount = finalAmount - discountAmount; }
    const result = db.run("INSERT INTO vet_transactions (user_id, pet_id, clinic_id, service_type, original_amount, discount_amount, final_amount, description, invoice_no) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [req.user.id, pet_id||null, clinic_id||null, service_type||null, original_amount, discountAmount, finalAmount, description||null, invoice_no||null]);
    res.json({ success: true, data: db.get("SELECT * FROM vet_transactions WHERE id = ?", [result.lastInsertRowid]), message: 'Discount applied: $' + discountAmount.toFixed(2) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/vet-transactions', authMiddleware, (req, res) => {
  try {
    res.json({ success: true, data: db.all("SELECT vt.*, p.name as pet_name, c.name as clinic_name FROM vet_transactions vt LEFT JOIN pets p ON p.id = vt.pet_id LEFT JOIN vet_clinics c ON c.id = vt.clinic_id WHERE vt.user_id = ? ORDER BY vt.transaction_date DESC", [req.user.id]) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/reimbursement', authMiddleware, (req, res) => {
  try {
    const { pet_id, enrollment_id, claim_amount, vet_name, service_date, description } = req.body;
    if (!claim_amount || claim_amount <= 0) return res.status(400).json({ success: false, message: 'Valid amount required' });
    const enrollment = db.get("SELECT mw.*, wp.reimbursement_percent, wp.max_reimbursement FROM member_wellness_enrollments mw JOIN wellness_plans wp ON wp.id = mw.plan_id WHERE mw.id = ? AND mw.user_id = ? AND mw.status = 'active'", [enrollment_id, req.user.id]);
    if (!enrollment) return res.status(404).json({ success: false, message: 'Active enrollment not found' });
    let reimbAmount = parseFloat(claim_amount) * (enrollment.reimbursement_percent / 100);
    if ((enrollment.reimbursement_used + reimbAmount) > enrollment.max_reimbursement) reimbAmount = Math.max(0, enrollment.max_reimbursement - enrollment.reimbursement_used);
    const result = db.run("INSERT INTO reimbursement_claims (user_id, pet_id, enrollment_id, claim_amount, reimbursement_amount, vet_name, service_date, description, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')",
      [req.user.id, pet_id||null, enrollment_id, claim_amount, reimbAmount, vet_name||null, service_date||null, description||null]);
    res.json({ success: true, data: db.get("SELECT * FROM reimbursement_claims WHERE id = ?", [result.lastInsertRowid]), message: 'Claim submitted! Reimbursement: $' + reimbAmount.toFixed(2) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/reimbursements', authMiddleware, (req, res) => {
  try {
    res.json({ success: true, data: db.all("SELECT rc.*, p.name as pet_name FROM reimbursement_claims rc LEFT JOIN pets p ON p.id = rc.pet_id WHERE rc.user_id = ? ORDER BY rc.created_at DESC", [req.user.id]) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;