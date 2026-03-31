const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../database');
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'pet-service-platform-secret-key-2024';

function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Unauthorized' });
  try {
    req.user = jwt.verify(h.split(' ')[1], JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

// Get my pets
router.get('/', auth, async (req, res) => {
  try {
    const pets = await db.all("SELECT * FROM pets WHERE user_id = $1 AND status = 1 ORDER BY created_at ASC", [req.user.id]);
    res.json({ success: true, data: pets });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Add a pet
router.post('/', auth, async (req, res) => {
  try {
    const { name, type, breed, age, gender, neutered } = req.body;
    if (!name || !type) return res.status(400).json({ success: false, message: 'Name and type required' });
    await db.run(
      "INSERT INTO pets (user_id, name, type, breed, age, gender, neutered) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [req.user.id, name, type, breed || '', parseFloat(age) || 0, gender || '', neutered || '']
    );
    const pet = await db.get("SELECT * FROM pets WHERE user_id = $1 ORDER BY id DESC LIMIT 1", [req.user.id]);
    res.json({ success: true, data: pet });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Update a pet
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, type, breed, age, gender, neutered } = req.body;
    const pet = await db.get("SELECT id FROM pets WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    if (!pet) return res.status(404).json({ success: false, message: 'Pet not found' });
    await db.run(
      "UPDATE pets SET name=$1, type=$2, breed=$3, age=$4, gender=$5, neutered=$6 WHERE id=$7",
      [name, type, breed || '', parseFloat(age) || 0, gender || '', neutered || '', req.params.id]
    );
    res.json({ success: true, message: 'Pet updated' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Delete a pet
router.delete('/:id', auth, async (req, res) => {
  try {
    await db.run("UPDATE pets SET status = 0 WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    res.json({ success: true, message: 'Pet removed' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
