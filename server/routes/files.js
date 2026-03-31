const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'pet-service-platform-secret-key-2024';

function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Unauthorized' });
  try { req.user = jwt.verify(h.split(' ')[1], JWT_SECRET); next(); }
  catch (e) { return res.status(401).json({ success: false, message: 'Invalid token' }); }
}

const uploadDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.random().toString(36).substr(2, 8) + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF and image files are allowed'));
  }
});

// Upload file
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const fileType = req.file.mimetype === 'application/pdf' ? 'pdf' : 'image';
    await db.run(
      "INSERT INTO uploaded_files (user_id, original_name, stored_name, file_path, file_type, file_size, description) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [req.user.id, req.file.originalname, req.file.filename, '/uploads/' + req.file.filename, fileType, req.file.size, req.body.description || '']
    );
    res.json({ success: true, data: { url: '/uploads/' + req.file.filename, type: fileType } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Get my files
router.get('/my', auth, async (req, res) => {
  try {
    const files = await db.all("SELECT * FROM uploaded_files WHERE user_id = $1 ORDER BY created_at DESC", [req.user.id]);
    res.json({ success: true, data: files });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Delete file
router.delete('/:id', auth, async (req, res) => {
  try {
    const file = await db.get("SELECT * FROM uploaded_files WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });
    const filePath = path.join(__dirname, '../../public', file.file_path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await db.run("DELETE FROM uploaded_files WHERE id = $1", [req.params.id]);
    res.json({ success: true, message: 'File deleted' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
