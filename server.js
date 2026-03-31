const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploads
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/shop', require('./routes/shop'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/content', require('./routes/content'));
app.use('/api/files', require('./routes/files'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/vet', require('./routes/vet'));

// Pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/shop', (req, res) => res.sendFile(path.join(__dirname, 'public/pages/shop.html')));
app.get('/services', (req, res) => res.sendFile(path.join(__dirname, 'public/pages/services.html')));
app.get('/blog', (req, res) => res.sendFile(path.join(__dirname, 'public/pages/blog.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public/pages/login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public/pages/register.html')));
app.get('/profile', (req, res) => res.sendFile(path.join(__dirname, 'public/pages/profile.html')));
app.get('/cart', (req, res) => res.sendFile(path.join(__dirname, 'public/pages/cart.html')));
app.get('/orders', (req, res) => res.sendFile(path.join(__dirname, 'public/pages/orders.html')));
app.get('/team', (req, res) => res.sendFile(path.join(__dirname, 'public/pages/team.html')));
app.get('/upload', (req, res) => res.sendFile(path.join(__dirname, 'public/pages/upload.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/admin/index.html')));
app.get('/admin/*', (req, res) => res.sendFile(path.join(__dirname, 'public/admin/index.html')));

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  if (err.message && err.message.includes('Only PDF and image')) {
    return res.status(400).json({ success: false, message: err.message });
  }
  res.status(500).json({ success: false, message: 'Server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

// Initialize database and start server
const db = require('./database');

async function start() {
  try {
    await db.init();
    console.log('Database initialized');

    app.listen(PORT, () => {
      console.log(`\n🐾 PetPaw - Pet Service Platform`);
      console.log(`   Local: http://localhost:${PORT}`);
      console.log(`   Admin: http://localhost:${PORT}/admin`);
      console.log(`   Default admin: admin / 123456\n`);
    });
  } catch (e) {
    console.error('Failed to start server:', e);
    process.exit(1);
  }
}

start();
