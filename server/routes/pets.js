const express = require('express');
const router = express.Router();
const db = require('../database');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'pet-service-platform-secret-key-2024';
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

// Get all pets
router.get('/', authMiddleware, (req, res) => {
  try {
    const pets = db.all("SELECT * FROM pets WHERE user_id = ? AND status = 1 ORDER BY created_at DESC", [req.user.id]);
    res.json({ success: true, data: pets });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Get single pet
router.get('/:id', authMiddleware, (req, res) => {
  try {
    const pet = db.get("SELECT * FROM pets WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
    if (!pet) return res.status(404).json({ success: false, message: 'Pet not found' });
    res.json({ success: true, data: pet });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Add pet
router.post('/', authMiddleware, (req, res) => {
  try {
    const { name, species, breed, gender, birth_date, weight, color, microchip, notes } = req.body;
    if (!name || !species) return res.status(400).json({ success: false, message: 'Name and species required' });
    
    const result = db.run(
      "INSERT INTO pets (user_id, name, species, breed, gender, birth_date, weight, color, microchip, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [req.user.id, name, species, breed || null, gender || null, birth_date || null, weight || null, color || null, microchip || null, notes || null]
    );
    
    const pet = db.get("SELECT * FROM pets WHERE id = ?", [result.lastInsertRowid]);
    res.json({ success: true, data: pet });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Update pet
router.put('/:id', authMiddleware, (req, res) => {
  try {
    const pet = db.get("SELECT * FROM pets WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
    if (!pet) return res.status(404).json({ success: false, message: 'Pet not found' });
    
    const { name, species, breed, gender, birth_date, weight, color, microchip, notes } = req.body;
    db.run(
      "UPDATE pets SET name=?, species=?, breed=?, gender=?, birth_date=?, weight=?, color=?, microchip=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
      [name||pet.name, species||pet.species, breed||pet.breed, gender||pet.gender, birth_date||pet.birth_date, weight||pet.weight, color||pet.color, microchip||pet.microchip, notes||pet.notes, req.params.id]
    );
    
    const updated = db.get("SELECT * FROM pets WHERE id = ?", [req.params.id]);
    res.json({ success: true, data: updated });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Delete pet
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const pet = db.get("SELECT * FROM pets WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
    if (!pet) return res.status(404).json({ success: false, message: 'Pet not found' });
    db.run("UPDATE pets SET status = 0 WHERE id = ?", [req.params.id]);
    res.json({ success: true, message: 'Pet deleted' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;