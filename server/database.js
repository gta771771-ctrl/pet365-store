// PetPaw - Database Module using PostgreSQL
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://petpaw_user:jZA0M1oBANb5r89apc3eUanwaeimd2W3@dpg-d75s75m3jp1c73dj1ng0-a/petpaw';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

pool.on('error', (err) => {
  console.error('Pool error:', err.message);
});

async function init() {
  const client = await pool.connect();
  try {
    console.log('PostgreSQL connected');

    // Drop and recreate settings table to fix schema issues
    await client.query(`DROP TABLE IF EXISTS settings`).catch(() => {});
    await client.query(`CREATE TABLE settings (id SERIAL PRIMARY KEY, key VARCHAR(100) UNIQUE NOT NULL, value TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    
    await client.query(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username VARCHAR(100) UNIQUE NOT NULL, email VARCHAR(255), phone VARCHAR(50), password VARCHAR(255) NOT NULL, avatar TEXT, balance REAL DEFAULT 0, invite_code VARCHAR(20) UNIQUE, parent_id INTEGER, level INTEGER DEFAULT 0, status INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await client.query(`CREATE TABLE IF NOT EXISTS balance_logs (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, type VARCHAR(20) NOT NULL, amount REAL NOT NULL, before_balance REAL NOT NULL, after_balance REAL NOT NULL, reason TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await client.query(`CREATE TABLE IF NOT EXISTS products (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, description TEXT, price REAL NOT NULL DEFAULT 0, original_price REAL, image TEXT, category VARCHAR(100), stock INTEGER DEFAULT 0, sales INTEGER DEFAULT 0, status INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await client.query(`CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, order_no VARCHAR(50) UNIQUE NOT NULL, user_id INTEGER NOT NULL, total_amount REAL NOT NULL DEFAULT 0, pay_amount REAL NOT NULL DEFAULT 0, balance_used REAL DEFAULT 0, status INTEGER DEFAULT 1, receiver_name TEXT, receiver_phone TEXT, receiver_address TEXT, remark TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await client.query(`CREATE TABLE IF NOT EXISTS order_items (id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL, product_id INTEGER, product_name TEXT, product_image TEXT, price REAL NOT NULL, quantity INTEGER NOT NULL DEFAULT 1, specification TEXT)`);
    await client.query(`CREATE TABLE IF NOT EXISTS cart (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, product_id INTEGER NOT NULL, quantity INTEGER DEFAULT 1, specification TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await client.query(`CREATE TABLE IF NOT EXISTS articles (id SERIAL PRIMARY KEY, title TEXT NOT NULL, content TEXT, excerpt TEXT, image TEXT, category VARCHAR(100), views INTEGER DEFAULT 0, status INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await client.query(`CREATE TABLE IF NOT EXISTS services (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, description TEXT, icon VARCHAR(50), price REAL DEFAULT 0, features TEXT, status INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await client.query(`CREATE TABLE IF NOT EXISTS uploaded_files (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, original_name TEXT NOT NULL, stored_name TEXT NOT NULL, file_path TEXT NOT NULL, file_type VARCHAR(100), file_size INTEGER NOT NULL, description TEXT, status INTEGER DEFAULT 0, admin_remark TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await client.query(`CREATE TABLE IF NOT EXISTS admin_users (id SERIAL PRIMARY KEY, username VARCHAR(100) UNIQUE NOT NULL, password VARCHAR(255) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await client.query(`CREATE TABLE IF NOT EXISTS vet_discount_plans (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, description TEXT, price REAL NOT NULL DEFAULT 0, features TEXT, status INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await client.query(`CREATE TABLE IF NOT EXISTS wellness_plans (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, description TEXT, price REAL NOT NULL DEFAULT 0, duration_days INTEGER DEFAULT 365, reimbursement_amount REAL DEFAULT 0, features TEXT, status INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await client.query(`CREATE TABLE IF NOT EXISTS vet_transactions (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, clinic_id INTEGER, amount REAL NOT NULL, savings REAL DEFAULT 0, status INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await client.query(`CREATE TABLE IF NOT EXISTS vet_clinics (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, address TEXT, phone VARCHAR(50), status INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await client.query(`CREATE TABLE IF NOT EXISTS pets (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, name VARCHAR(100) NOT NULL, type VARCHAR(50), breed VARCHAR(100), age REAL DEFAULT 0, gender VARCHAR(20), neutered VARCHAR(10), status INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);

    // Seed admin
    const adminResult = await client.query("SELECT id FROM admin_users WHERE username = 'admin'");
    if (adminResult.rows.length === 0) {
      const hashed = bcrypt.hashSync('123456', 10);
      await client.query("INSERT INTO admin_users (username, password) VALUES ($1, $2)", ['admin', hashed]);
      console.log('Admin created: admin / 123456');
    }

    // Seed vet discount plans
    const vdc = await client.query("SELECT COUNT(*) FROM vet_discount_plans");
    if (parseInt(vdc.rows[0].count) === 0) {
      await client.query("INSERT INTO vet_discount_plans (name, description, price, features) VALUES ($1,$2,$3,$4)", ['Basic Vet Discount', '25% off all vet services', 9.99, JSON.stringify(['25% off vet bills', '5000+ network vets', 'No waiting period', 'No claim forms'])]);
      await client.query("INSERT INTO vet_discount_plans (name, description, price, features) VALUES ($1,$2,$3,$4)", ['Premium Vet Discount', '35% off + teleconsultations', 19.99, JSON.stringify(['35% off vet bills', 'Unlimited teleconsultations', 'Priority booking'])]);
      await client.query("INSERT INTO vet_discount_plans (name, description, price, features) VALUES ($1,$2,$3,$4)", ['Family Vet Plan', '25% off for up to 4 pets', 24.99, JSON.stringify(['25% off for 4 pets', 'Nationwide coverage', '24/7 support'])]);
    }

    // Seed wellness plans
    const wc = await client.query("SELECT COUNT(*) FROM wellness_plans");
    if (parseInt(wc.rows[0].count) === 0) {
      await client.query("INSERT INTO wellness_plans (name, description, price, duration_days, reimbursement_amount, features) VALUES ($1,$2,$3,$4,$5,$6)", ['Basic Wellness', 'Essential routine care', 14.99, 365, 500, JSON.stringify(['$500 annual reimbursement', 'Annual checkups', 'Vaccinations'])]);
      await client.query("INSERT INTO wellness_plans (name, description, price, duration_days, reimbursement_amount, features) VALUES ($1,$2,$3,$4,$5,$6)", ['Plus Wellness', 'Comprehensive coverage', 29.99, 365, 1500, JSON.stringify(['$1500 annual reimbursement', 'Everything in Basic', 'Spay/neuter'])]);
      await client.query("INSERT INTO wellness_plans (name, description, price, duration_days, reimbursement_amount, features) VALUES ($1,$2,$3,$4,$5,$6)", ['Premium Wellness', 'Full-spectrum protection', 49.99, 365, 3000, JSON.stringify(['$3000 annual reimbursement', 'Everything in Plus', 'Behavioral therapy'])]);
    }

    // Seed vet clinics
    const cc = await client.query("SELECT COUNT(*) FROM vet_clinics");
    if (parseInt(cc.rows[0].count) === 0) {
      await client.query("INSERT INTO vet_clinics (name, address, phone) VALUES ($1,$2,$3)", ['Happy Paws Veterinary Clinic', '123 Pet Street, New York, NY 10001', '(555) 123-4567']);
      await client.query("INSERT INTO vet_clinics (name, address, phone) VALUES ($1,$2,$3)", ['City Pet Hospital', '456 Animal Ave, Los Angeles, CA 90001', '(555) 234-5678']);
      await client.query("INSERT INTO vet_clinics (name, address, phone) VALUES ($1,$2,$3)", ['Animal Care Center', '789 Vet Blvd, Chicago, IL 60601', '(555) 345-6789']);
      await client.query("INSERT INTO vet_clinics (name, address, phone) VALUES ($1,$2,$3)", ['Furry Friends Vet', '321 Pet Lane, Houston, TX 77001', '(555) 456-7890']);
      await client.query("INSERT INTO vet_clinics (name, address, phone) VALUES ($1,$2,$3)", ['Pet Wellness Clinic', '654 Care Road, Phoenix, AZ 85001', '(555) 567-8901']);
    }

    // Seed products
    const pc = await client.query("SELECT COUNT(*) FROM products");
    if (parseInt(pc.rows[0].count) === 0) {
      const products = [
        ['Premium Dog Food', 'High-quality nutrition for your dog', 45.99, 59.99, 'https://images.unsplash.com/photo-1589924691995-400dc9ecc119?w=400&h=400&fit=crop', 'food', 100],
        ['Organic Cat Food', 'Natural and healthy cat food', 38.99, 49.99, 'https://images.unsplash.com/photo-1615497001839-b0a0eac3274c?w=400&h=400&fit=crop', 'food', 80],
        ['Dental Treats', "Keep your pet's teeth clean", 12.99, 15.99, 'https://images.unsplash.com/photo-1585562126204-35d5791d3edc?w=400&h=400&fit=crop', 'treats', 200],
        ['Training Treats', 'Perfect for obedience training', 15.99, 19.99, 'https://images.unsplash.com/photo-1568640347023-a616a30bc3bd?w=400&h=400&fit=crop', 'treats', 150],
        ['Pet Water Fountain', 'Continuous fresh water for pets', 35.99, 45.99, 'https://images.unsplash.com/photo-1601758124510-52d02ddb7cbd?w=400&h=400&fit=crop', 'supplies', 50],
        ['Interactive Toy Set', 'Keep your pet entertained', 24.99, 29.99, 'https://images.unsplash.com/photo-1535294435445-d7249524ef2e?w=400&h=400&fit=crop', 'toys', 120],
        ['Flea & Tick Prevention', 'Monthly protection for pets', 32.99, 39.99, 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=400&h=400&fit=crop', 'medicine', 60],
        ['Pet Vitamins', 'Essential vitamins for pet health', 22.99, 27.99, 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=400&h=400&fit=crop', 'health', 90],
      ];
      for (const p of products) {
        await client.query("INSERT INTO products (name, description, price, original_price, image, category, stock) VALUES ($1,$2,$3,$4,$5,$6,$7)", p);
      }
    }

    // Seed articles
    const ac = await client.query("SELECT COUNT(*) FROM articles");
    if (parseInt(ac.rows[0].count) === 0) {
      await client.query("INSERT INTO articles (title, content, excerpt, image, category) VALUES ($1,$2,$3,$4,$5)", ['10 Tips for Keeping Your Pet Healthy', 'Regular vet checkups, proper nutrition, and exercise are key.', 'Learn the best practices for maintaining your pet health.', 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=400&h=200&fit=crop', 'health']);
      await client.query("INSERT INTO articles (title, content, excerpt, image, category) VALUES ($1,$2,$3,$4,$5)", ['Understanding Pet Nutrition', 'A balanced diet is essential for your pet wellbeing.', 'Everything you need to know about feeding your furry friend.', 'https://images.unsplash.com/photo-1589924691995-400dc9ecc119?w=400&h=200&fit=crop', 'nutrition']);
    }

    // Seed services
    const sc = await client.query("SELECT COUNT(*) FROM services");
    if (parseInt(sc.rows[0].count) === 0) {
      await client.query("INSERT INTO services (name, description, icon, price, features) VALUES ($1,$2,$3,$4,$5)", ['Vet Discount Program', 'Get up to 25% off at participating veterinarians', 'stethoscope', 9.99, JSON.stringify(['Up to 25% discount', '5000+ partner vets', 'No claim forms needed'])]);
      await client.query("INSERT INTO services (name, description, icon, price, features) VALUES ($1,$2,$3,$4,$5)", ['Annual Health Checkup', 'Comprehensive wellness exams', 'heartbeat', 19.99, JSON.stringify(['Full body exam', 'Vaccination updates', 'Dental check'])]);
    }

    console.log('Database initialized successfully');
    return pool;
  } finally {
    client.release();
  }
}

async function run(sql, params) {
  const safeParams = (params || []).map(p => (p === null || p === undefined) ? null : p);
  const client = await pool.connect();
  try {
    const result = await client.query(sql, safeParams);
    return { changes: result.rowCount, lastInsertRowid: result.rows[0] ? result.rows[0].id : 0 };
  } finally {
    client.release();
  }
}

async function get(sql, params) {
  const safeParams = (params || []).map(p => (p === null || p === undefined) ? null : p);
  const client = await pool.connect();
  try {
    const result = await client.query(sql, safeParams);
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

async function all(sql, params) {
  const safeParams = (params || []).map(p => (p === null || p === undefined) ? null : p);
  const client = await pool.connect();
  try {
    const result = await client.query(sql, safeParams);
    return result.rows;
  } finally {
    client.release();
  }
}

async function exec(sql) {
  const client = await pool.connect();
  try {
    await client.query(sql);
    return { changes: 0 };
  } finally {
    client.release();
  }
}

function getDb() { return pool; }

module.exports = { init, run, get, all, exec, getDb };
