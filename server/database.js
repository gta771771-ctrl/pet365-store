// PetPaw - Pet Service Platform
// Database Module using JSON file storage (for Render.com free tier compatibility)
// This module provides SQLite-like API but stores data in JSON files
// which persist across service restarts on Render

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Database path - use /data on Render, local otherwise
const DATA_DIR = process.env.RENDER ? '/data' : path.join(__dirname);
const DB_PATH = path.join(DATA_DIR, 'database.sqlite');
const UPLOAD_DIR = process.env.RENDER ? '/data/uploads' : path.join(__dirname, '../public/uploads');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
}
if (!fs.existsSync(UPLOAD_DIR)) {
  try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (e) {}
}

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

async function init() {
  const database = getDb();

  // Users table
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      phone TEXT UNIQUE,
      password TEXT NOT NULL,
      avatar TEXT,
      balance REAL DEFAULT 0,
      invite_code TEXT UNIQUE,
      parent_id INTEGER,
      level INTEGER DEFAULT 0,
      status INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Balance logs table
  database.exec(`
    CREATE TABLE IF NOT EXISTS balance_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      before_balance REAL NOT NULL,
      after_balance REAL NOT NULL,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Products table
  database.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL DEFAULT 0,
      original_price REAL,
      image TEXT,
      category TEXT,
      stock INTEGER DEFAULT 0,
      sales INTEGER DEFAULT 0,
      status INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Orders table
  database.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      total_amount REAL NOT NULL DEFAULT 0,
      pay_amount REAL NOT NULL DEFAULT 0,
      balance_used REAL DEFAULT 0,
      status INTEGER DEFAULT 1,
      receiver_name TEXT,
      receiver_phone TEXT,
      receiver_address TEXT,
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Order items table
  database.exec(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT,
      product_image TEXT,
      price REAL NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      specification TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `);

  // Cart table
  database.exec(`
    CREATE TABLE IF NOT EXISTS cart (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 1,
      specification TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // Articles table
  database.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT,
      excerpt TEXT,
      image TEXT,
      category TEXT,
      views INTEGER DEFAULT 0,
      status INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Services table
  database.exec(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      price REAL DEFAULT 0,
      features TEXT,
      status INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Files table
  database.exec(`
    CREATE TABLE IF NOT EXISTS uploaded_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      description TEXT,
      status INTEGER DEFAULT 0,
      admin_remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Admin users table
  database.exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_invite_code ON users(invite_code);
    CREATE INDEX IF NOT EXISTS idx_users_parent_id ON users(parent_id);
    CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_cart_user_id ON cart(user_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
  `);

  // Seed admin user
  const adminExists = database.prepare('SELECT id FROM admin_users WHERE username = ?').get('admin');
  if (!adminExists) {
    const hashedPassword = bcrypt.hashSync('123456', 10);
    database.prepare('INSERT INTO admin_users (username, password) VALUES (?, ?)').run('admin', hashedPassword);
    console.log('Admin user created: admin / 123456');
  }

  // Seed products if empty
  const productCount = database.prepare('SELECT COUNT(*) as count FROM products').get().count;
  if (productCount === 0) {
    const products = [
      { name: 'Premium Dog Food', description: 'High-quality nutrition for your dog', price: 45.99, original_price: 59.99, image: 'https://images.unsplash.com/photo-1589924691995-400dc9ecc119?w=400&h=400&fit=crop', category: 'food', stock: 100 },
      { name: 'Organic Cat Food', description: 'Natural and healthy cat food', price: 38.99, original_price: 49.99, image: 'https://images.unsplash.com/photo-1615497001839-b0a0eac3274c?w=400&h=400&fit=crop', category: 'food', stock: 80 },
      { name: 'Dental Treats', description: 'Keep your pet\'s teeth clean', price: 12.99, original_price: 15.99, image: 'https://images.unsplash.com/photo-1585562126204-35d5791d3edc?w=400&h=400&fit=crop', category: 'treats', stock: 200 },
      { name: 'Training Treats', description: 'Perfect for obedience training', price: 15.99, original_price: 19.99, image: 'https://images.unsplash.com/photo-1568640347023-a616a30bc3bd?w=400&h=400&fit=crop', category: 'treats', stock: 150 },
      { name: 'Pet Water Fountain', description: 'Continuous fresh water for pets', price: 35.99, original_price: 45.99, image: 'https://images.unsplash.com/photo-1601758124510-52d02ddb7cbd?w=400&h=400&fit=crop', category: 'supplies', stock: 50 },
      { name: 'Automatic Feeder', description: 'Programmable pet food dispenser', price: 65.99, original_price: 79.99, image: 'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=400&h=400&fit=crop', category: 'supplies', stock: 40 },
      { name: 'Interactive Toy Set', description: 'Keep your pet entertained', price: 24.99, original_price: 29.99, image: 'https://images.unsplash.com/photo-1535294435445-d7249524ef2e?w=400&h=400&fit=crop', category: 'toys', stock: 120 },
      { name: 'Squeaky Ball Set', description: 'Fun and engaging dog toys', price: 18.99, original_price: 22.99, image: 'https://images.unsplash.com/photo-1560807707-8cc77767d783?w=400&h=400&fit=crop', category: 'toys', stock: 100 },
      { name: 'Flea & Tick Prevention', description: 'Monthly protection for pets', price: 32.99, original_price: 39.99, image: 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=400&h=400&fit=crop', category: 'medicine', stock: 60 },
      { name: 'Pet Vitamins', description: 'Essential vitamins for pet health', price: 22.99, original_price: 27.99, image: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=400&h=400&fit=crop', category: 'health', stock: 90 },
    ];
    const insert = database.prepare('INSERT INTO products (name, description, price, original_price, image, category, stock) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const p of products) {
      insert.run(p.name, p.description, p.price, p.original_price, p.image, p.category, p.stock);
    }
    console.log(`Seeded ${products.length} products`);
  }

  // Seed articles if empty
  const articleCount = database.prepare('SELECT COUNT(*) as count FROM articles').get().count;
  if (articleCount === 0) {
    const articles = [
      { title: '10 Tips for Keeping Your Pet Healthy', content: 'Regular vet checkups, proper nutrition, and exercise are key...', excerpt: 'Learn the best practices for maintaining your pet\'s health and happiness.', image: 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=400&h=200&fit=crop', category: 'health' },
      { title: 'Understanding Pet Nutrition', content: 'A balanced diet is essential for your pet\'s wellbeing...', excerpt: 'Everything you need to know about feeding your furry friend.', image: 'https://images.unsplash.com/photo-1589924691995-400dc9ecc119?w=400&h=200&fit=crop', category: 'nutrition' },
      { title: 'Basic Dog Training Commands', content: 'Start with sit, stay, and come...', excerpt: 'Master these essential commands for a well-behaved dog.', image: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=400&h=200&fit=crop', category: 'training' },
      { title: 'Pet Grooming at Home', content: 'Regular grooming keeps your pet clean and comfortable...', excerpt: 'Tips for grooming your pet without leaving home.', image: 'https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?w=400&h=200&fit=crop', category: 'grooming' },
      { title: 'Common Pet Health Issues', content: 'Be aware of these common health problems...', excerpt: 'Early detection can save your pet\'s life.', image: 'https://images.unsplash.com/photo-1583500178450-e59e4309b57d?w=400&h=200&fit=crop', category: 'health' },
    ];
    const insert = database.prepare('INSERT INTO articles (title, content, excerpt, image, category) VALUES (?, ?, ?, ?, ?)');
    for (const a of articles) {
      insert.run(a.title, a.content, a.excerpt, a.image, a.category);
    }
    console.log(`Seeded ${articles.length} articles`);
  }

  // Seed services if empty
  const serviceCount = database.prepare('SELECT COUNT(*) as count FROM services').get().count;
  if (serviceCount === 0) {
    const services = [
      { name: 'Vet Discount Program', description: 'Get up to 50% off at participating veterinarians', icon: 'stethoscope', price: 9.99, features: JSON.stringify(['Up to 50% discount', '1000+ partner vets', 'No paperwork']) },
      { name: 'Annual Health Checkup', description: 'Comprehensive wellness exams for early detection', icon: 'heartbeat', price: 19.99, features: JSON.stringify(['Full body exam', 'Vaccination updates', 'Dental check']) },
      { name: 'Pet Insurance', description: 'Complete coverage for accidents and illnesses', icon: 'shield-alt', price: 29.99, features: JSON.stringify(['Accident coverage', 'Illness coverage', '24/7 support']) },
      { name: 'Grooming Services', description: 'Professional grooming to keep pets looking great', icon: 'cut', price: 15.99, features: JSON.stringify(['Bath & dry', 'Nail trimming', 'Ear cleaning']) },
    ];
    const insert = database.prepare('INSERT INTO services (name, description, icon, price, features) VALUES (?, ?, ?, ?, ?)');
    for (const s of services) {
      insert.run(s.name, s.description, s.icon, s.price, s.features);
    }
    console.log(`Seeded ${services.length} services`);
  }

  console.log('Database initialized successfully');
  return database;
}

module.exports = { init, getDb, UPLOAD_DIR };
