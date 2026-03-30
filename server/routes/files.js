const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { run, get, all, save } = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const uploadDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${uuidv4().substring(0, 8)}${path.extname(file.originalname)}`)
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

router.post('/upload', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  const fileType = req.file.mimetype === 'application/pdf' ? 'pdf' : 'image';
  const filePath = `/uploads/${req.file.filename}`;
  const result = run('INSERT INTO files (user_id, original_name, file_name, file_path, file_type, file_size, description) VALUES (?, ?, ?, ?, ?, ?, ?)', [req.user.id, req.file.originalname, req.file.filename, filePath, fileType, req.file.size, req.body.description || '']);
  save();
  res.json({ success: true, data: { id: result.lastInsertRowid, filePath, fileType } });
});

router.get('/my-files', authMiddleware, (req, res) => {
  const files = all('SELECT * FROM files WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
  res.json({ success: true, data: files });
});

router.delete('/my-files/:id', authMiddleware, (req, res) => {
  const file = get('SELECT * FROM files WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!file) return res.status(404).json({ success: false, message: 'File not found' });
  if (file.status !== 0) return res.status(400).json({ success: false, message: 'Cannot delete reviewed file' });
  const filePath = path.join(__dirname, '../../public', file.file_path);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  run('DELETE FROM files WHERE id = ?', [req.params.id]);
  save();
  res.json({ success: true });
});

module.exports = router;
