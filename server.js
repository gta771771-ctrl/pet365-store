const express = require('express');
const path = require('path');
const cors = require('cors');

const db = require('./server/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database and start server
db.init().then(() => {
  console.log('Database initialized');

  // API routes
  app.use('/api/auth', require('./server/routes/auth'));
  app.use('/api/shop', require('./server/routes/shop'));
  app.use('/api/orders', require('./server/routes/orders'));
  app.use('/api/content', require('./server/routes/content'));
  app.use('/api/admin', require('./server/routes/admin'));
  app.use('/api/files', require('./server/routes/files'));

  // Frontend pages
  const pages = ['shop', 'services', 'blog', 'login', 'register', 'profile', 'cart', 'orders', 'team', 'upload'];
  pages.forEach(p => app.get(`/${p}`, (req, res) => res.sendFile(path.join(__dirname, `public/pages/${p}.html`))));
  app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
  app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/admin/index.html')));
  app.get('/admin/*', (req, res) => res.sendFile(path.join(__dirname, 'public/admin/index.html')));

  app.use((req, res) => res.status(404).json({ success: false, message: 'Not found' }));
  app.use((err, req, res, next) => { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); });

  app.listen(PORT, () => console.log(`\n  PetPaw running at http://localhost:${PORT}\n  Admin: http://localhost:${PORT}/admin\n  Default: admin / 123456\n`));
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
