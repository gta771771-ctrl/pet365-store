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
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// API routes
app.use('/api/auth', require('./server/routes/auth'));
app.use('/api/shop', require('./server/routes/shop'));
app.use('/api/orders', require('./server/routes/orders'));
app.use('/api/content', require('./server/routes/content'));
app.use('/api/files', require('./server/routes/files'));
app.use('/api/admin', require('./server/routes/admin'));
app.use('/api/pets', require('./server/routes/pets'));
app.use('/api/vet', require('./server/routes/vet'));

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
app.get('/pets', (req, res) => res.sendFile(path.join(__dirname, 'public/pages/pets.html')));
app.get('/vet-discount', (req, res) => res.sendFile(path.join(__dirname, 'public/pages/vet-discount.html')));
app.get('/wellness', (req, res) => res.sendFile(path.join(__dirname, 'public/pages/wellness.html')));
app.get('/reimbursements', (req, res) => res.sendFile(path.join(__dirname, 'public/pages/reimbursements.html')));
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
const db = require('./server/database');

async function start() {
  try {
    await db.init();
    console.log('Database initialized');

    app.listen(PORT, () => {
      console.log('PetPaw server running on port ' + PORT);
    });
  } catch (e) {
    console.error('Failed to start server:', e);
    process.exit(1);
  }
}

start();
