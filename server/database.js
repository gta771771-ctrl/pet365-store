// PetPaw - Pet Service Platform
// Database Module using sql.js (pure JavaScript SQLite - no native compilation needed)
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Database path - use /data on Render/Railway, local otherwise
const IS_CLOUD = process.env.RENDER || process.env.RAILWAY_ENVIRONMENT;
const DATA_DIR = IS_CLOUD ? '/data' : path.join(__dirname);
const DB_PATH = path.join(DATA_DIR, 'database.sqlite');
const UPLOAD_DIR = IS_CLOUD ? '/data/uploads' : path.join(__dirname, '../public/uploads');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
}
if (!fs.existsSync(UPLOAD_DIR)) {
  try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (e) {}
}

let db = null;
let dbBuffer = null;

// Save database to file
function saveDb() {
  if (db && DB_PATH) {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DB_PATH, buffer);
    } catch (e) {
      console.error('Failed to save database:', e.message);
    }
  }
}

// Auto-save every 30 seconds
setInterval(saveDb, 30000);

// Graceful shutdown
process.on('exit', saveDb);
process.on('SIGINT', () => { saveDb(); process.exit(); });
process.on('SIGTERM', () => { saveDb(); process.exit(); });

async function init() {
  // Initialize SQL.js
  const SQL = await initSqlJs();

  // Load existing database or create new one
  try {
    if (fs.existsSync(DB_PATH)) {
      const fileBuffer = fs.readFileSync(DB_PATH);
      dbBuffer = new Uint8Array(fileBuffer);
      db = new SQL.Database(dbBuffer);
      console.log('Database loaded from file');
    } else {
      db = new SQL.Database();
      console.log('New database created');
    }
  } catch (e) {
    db = new SQL.Database();
    console.log('Database created (fallback):', e.message);
  }

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');

  // Create tables
  db.run(`
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

  db.run(`
    CREATE TABLE IF NOT EXISTS balance_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      before_balance REAL NOT NULL,
      after_balance REAL NOT NULL,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
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

  db.run(`
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
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT,
      product_image TEXT,
      price REAL NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      specification TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS cart (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 1,
      specification TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
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

  db.run(`
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

  db.run(`
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes
  db.run('CREATE INDEX IF NOT EXISTS idx_users_invite_code ON users(invite_code)');
  db.run('CREATE INDEX IF NOT EXISTS idx_users_parent_id ON users(parent_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_cart_user_id ON cart(user_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)');

  // Seed admin user
  const adminExists = db.exec("SELECT id FROM admin_users WHERE username = 'admin'");
  if (adminExists.length === 0 || adminExists[0].values.length === 0) {
    const hashedPassword = bcrypt.hashSync('123456', 10);
    db.run("INSERT INTO admin_users (username, password) VALUES ('admin', ?)", [hashedPassword]);
    console.log('Admin user created: admin / 123456');
  }

  // Seed products if empty
  const productCount = db.exec("SELECT COUNT(*) as count FROM products");
  if (productCount.length === 0 || productCount[0].values[0][0] === 0) {
    const products = [
      ['Premium Dog Food', 'High-quality nutrition for your dog', 45.99, 59.99, 'https://images.unsplash.com/photo-1589924691995-400dc9ecc119?w=400&h=400&fit=crop', 'food', 100],
      ['Organic Cat Food', 'Natural and healthy cat food', 38.99, 49.99, 'https://images.unsplash.com/photo-1615497001839-b0a0eac3274c?w=400&h=400&fit=crop', 'food', 80],
      ['Dental Treats', "Keep your pet's teeth clean", 12.99, 15.99, 'https://images.unsplash.com/photo-1585562126204-35d5791d3edc?w=400&h=400&fit=crop', 'treats', 200],
      ['Training Treats', 'Perfect for obedience training', 15.99, 19.99, 'https://images.unsplash.com/photo-1568640347023-a616a30bc3bd?w=400&h=400&fit=crop', 'treats', 150],
      ['Pet Water Fountain', 'Continuous fresh water for pets', 35.99, 45.99, 'https://images.unsplash.com/photo-1601758124510-52d02ddb7cbd?w=400&h=400&fit=crop', 'supplies', 50],
      ['Automatic Feeder', 'Programmable pet food dispenser', 65.99, 79.99, 'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=400&h=400&fit=crop', 'supplies', 40],
      ['Interactive Toy Set', 'Keep your pet entertained', 24.99, 29.99, 'https://images.unsplash.com/photo-1535294435445-d7249524ef2e?w=400&h=400&fit=crop', 'toys', 120],
      ['Squeaky Ball Set', 'Fun and engaging dog toys', 18.99, 22.99, 'https://images.unsplash.com/photo-1560807707-8cc77767d783?w=400&h=400&fit=crop', 'toys', 100],
      ['Flea & Tick Prevention', 'Monthly protection for pets', 32.99, 39.99, 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=400&h=400&fit=crop', 'medicine', 60],
      ['Pet Vitamins', 'Essential vitamins for pet health', 22.99, 27.99, 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=400&h=400&fit=crop', 'health', 90],
    ];
    for (const p of products) {
      db.run("INSERT INTO products (name, description, price, original_price, image, category, stock) VALUES (?, ?, ?, ?, ?, ?, ?)", p);
    }
    console.log(`Seeded ${products.length} products`);
  }

  // Seed articles if empty
  const articleCount = db.exec("SELECT COUNT(*) FROM articles");
  if (articleCount.length === 0 || articleCount[0].values[0][0] === 0) {
    const articles = [
      ['10 Tips for Keeping Your Pet Healthy', 'Regular vet checkups, proper nutrition, and exercise are key to keeping your pet healthy and happy. Learn about the best practices for pet wellness.', 'Learn the best practices for maintaining your pet\'s health and happiness.', 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=400&h=200&fit=crop', 'health'],
      ['Understanding Pet Nutrition', 'A balanced diet is essential for your pet\'s wellbeing. Discover the right nutrients for different pets.', 'Everything you need to know about feeding your furry friend.', 'https://images.unsplash.com/photo-1589924691995-400dc9ecc119?w=400&h=200&fit=crop', 'nutrition'],
      ['Basic Dog Training Commands', 'Start with sit, stay, and come - the foundation of good behavior.', 'Master these essential commands for a well-behaved dog.', 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=400&h=200&fit=crop', 'training'],
      ['Pet Grooming at Home', 'Regular grooming keeps your pet clean and comfortable. Tips for home grooming.', 'Tips for grooming your pet without leaving home.', 'https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?w=400&h=200&fit=crop', 'grooming'],
      ['Common Pet Health Issues', 'Be aware of these common health problems. Early detection saves lives.', 'Early detection can save your pet\'s life.', 'https://images.unsplash.com/photo-1583500178450-e59e4309b57d?w=400&h=200&fit=crop', 'health'],
    ];
    for (const a of articles) {
      db.run("INSERT INTO articles (title, content, excerpt, image, category) VALUES (?, ?, ?, ?, ?)", a);
    }
    console.log(`Seeded ${articles.length} articles`);
  }

  // Seed services if empty
  const serviceCount = db.exec("SELECT COUNT(*) FROM services");
  if (serviceCount.length === 0 || serviceCount[0].values[0][0] === 0) {
    const services = [
      ['Vet Discount Program', 'Get up to 50% off at participating veterinarians', 'stethoscope', 9.99, JSON.stringify(['Up to 50% discount', '1000+ partner vets', 'No paperwork needed'])],
      ['Annual Health Checkup', 'Comprehensive wellness exams for early detection', 'heartbeat', 19.99, JSON.stringify(['Full body exam', 'Vaccination updates', 'Dental check'])],
      ['Pet Insurance', 'Complete coverage for accidents and illnesses', 'shield-alt', 29.99, JSON.stringify(['Accident coverage', 'Illness coverage', '24/7 support'])],
      ['Grooming Services', 'Professional grooming to keep pets looking great', 'cut', 15.99, JSON.stringify(['Bath & dry', 'Nail trimming', 'Ear cleaning'])],
    ];
    for (const s of services) {
      db.run("INSERT INTO services (name, description, icon, price, features) VALUES (?, ?, ?, ?, ?)", s);
    }
    console.log(`Seeded ${services.length} services`);
  }

  saveDb();
  console.log('Database initialized successfully');
  return db;
}

// Helper function to run queries
function run(sql, params = []) {
  try {
    db.run(sql, params);
    saveDb();
    return { changes: db.getRowsModified(), lastInsertRowid: getLastInsertRowid() };
  } catch (e) {
    throw e;
  }
}

function getLastInsertRowid() {
  const result = db.exec("SELECT last_insert_rowid()");
  if (result.length > 0 && result[0].values.length > 0) {
    return result[0].values[0][0];
  }
  return 0;
}

function get(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  } catch (e) {
    throw e;
  }
}

function all(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  } catch (e) {
    throw e;
  }
}

function exec(sql) {
  try {
    db.run(sql);
    saveDb();
    return { changes: db.getRowsModified() };
  } catch (e) {
    throw e;
  }
}

module.exports = { init, run, get, all, exec, getDb: () => db, saveDb, UPLOAD_DIR };
