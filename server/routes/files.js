const express = require('express');
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'pet-service-platform-secret-key-2024';

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, db.UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueName = uuidv4() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: function (req, file, cb) {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and image files are allowed'));
    }
  }
});

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

// Upload file
router.post('/upload', authMiddleware, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const fileType = req.file.mimetype === 'application/pdf' ? 'pdf' : 'image';
    const description = req.body.description || null;

    const result = db.run(
      "INSERT INTO uploaded_files (user_id, original_name, stored_name, file_path, file_type, file_size, description, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [req.user.id, req.file.originalname, req.file.filename, '/uploads/' + req.file.filename, fileType, req.file.size, description, 0]
    );

    res.json({
      success: true,
      data: {
        id: result.lastInsertRowid,
        original_name: req.file.originalname,
        file_type: fileType,
        file_size: req.file.size,
        status: 0
      },
      message: 'File uploaded successfully'
    });
  } catch (e) {
    console.error('Upload error:', e);
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
});

// Get my files
router.get('/my-files', authMiddleware, (req, res) => {
  try {
    const files = db.all("SELECT * FROM uploaded_files WHERE user_id = ? ORDER BY created_at DESC", [req.user.id]);
    res.json({ success: true, data: files });
  } catch (e) {
    console.error('Get files error:', e);
    res.status(500).json({ success: false, message: 'Failed to get files' });
  }
});

// Delete my file
router.delete('/my-files/:id', authMiddleware, (req, res) => {
  try {
    const file = db.get("SELECT * FROM uploaded_files WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);

    if (!file) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    // Only allow delete if pending
    if (file.status !== 0) {
      return res.status(400).json({ success: false, message: 'Cannot delete reviewed file' });
    }

    // Delete physical file
    try {
      const filePath = path.join(__dirname, '../../public', file.file_path);
      require('fs').unlinkSync(filePath);
    } catch (e) {}

    db.run("DELETE FROM uploaded_files WHERE id = ?", [req.params.id]);

    res.json({ success: true, message: 'File deleted' });
  } catch (e) {
    console.error('Delete file error:', e);
    res.status(500).json({ success: false, message: 'Failed to delete file' });
  }
});

module.exports = router;
