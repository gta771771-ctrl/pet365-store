const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Load routes one by one
try { app.use('/api/auth', require('./routes/auth')); console.log('auth OK'); } catch(e) { console.error('auth FAIL:', e.message); }
try { app.use('/api/shop', require('./routes/shop')); console.log('shop OK'); } catch(e) { console.error('shop FAIL:', e.message); }
try { app.use('/api/orders', require('./routes/orders')); console.log('orders OK'); } catch(e) { console.error('orders FAIL:', e.message); }
try { app.use('/api/content', require('./routes/content')); console.log('content OK'); } catch(e) { console.error('content FAIL:', e.message); }
try { app.use('/api/files', require('./routes/files')); console.log('files OK'); } catch(e) { console.error('files FAIL:', e.message); }
try { app.use('/api/admin', require('./routes/admin')); console.log('admin OK'); } catch(e) { console.error('admin FAIL:', e.message); }
try { app.use('/api/vet', require('./routes/vet')); console.log('vet OK'); } catch(e) { console.error('vet FAIL:', e.message); }
try { app.use('/api/pets', require('./routes/pets')); console.log('pets OK'); } catch(e) { console.error('pets FAIL:', e.message); }

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/admin/index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public/pages/login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public/pages/register.html')));
app.get('/profile', (req, res) => res.sendFile(path.join(__dirname, 'public/pages/profile.html')));

app.listen(PORT, () => {
  console.log('Server started on port ' + PORT);
});

const db = require('./database');
db.init().then(() => console.log('DB ready')).catch(e => console.error('DB error:', e.message));
