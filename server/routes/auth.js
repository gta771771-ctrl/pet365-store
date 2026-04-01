const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'pet-service-platform-secret-key-2024';
const INVITE_REWARD_LEVEL1 = 10;
const INVITE_REWARD_LEVEL2 = 5;

function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Unauthorized' });
  try { req.user = jwt.verify(h.split(' ')[1], JWT_SECRET); next(); }
  catch (e) { return res.status(401).json({ success: false, message: 'Invalid token' }); }
}

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, email, phone, password, invite_code } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'Username and password required' });
    const existing = await db.get("SELECT id FROM users WHERE username = $1 OR email = $2 OR phone = $3",
      [username, email || null, phone || null]);
    if (existing) return res.status(400).json({ success: false, message: 'User already exists' });

    const hashedPassword = bcrypt.hashSync(password, 10);
    const userInviteCode = uuidv4().substring(0, 8).toUpperCase();
    let parentId = null;

    if (invite_code) {
      const inviter = await db.get("SELECT id, level FROM users WHERE invite_code = $1", [invite_code]);
      if (inviter) parentId = inviter.id;
    }

    const result = await db.run(
      "INSERT INTO users (username, email, phone, password, invite_code, parent_id, level) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [username, email || null, phone || null, hashedPassword, userInviteCode, parentId, parentId ? 1 : 0]
    );
    const userId = result.lastInsertRowid;

    if (parentId) {
      const parent = await db.get("SELECT parent_id, balance FROM users WHERE id = $1", [parentId]);
      if (parent) {
        const newBalance = parent.balance + INVITE_REWARD_LEVEL1;
        await db.run("UPDATE users SET balance = $1 WHERE id = $2", [newBalance, parentId]);
        await db.run("INSERT INTO balance_logs (user_id, type, amount, before_balance, after_balance, reason) VALUES ($1,'add',$2,$3,$4,$5)",
          [parentId, INVITE_REWARD_LEVEL1, parent.balance, newBalance, 'Invite reward (Level 1)']);
        if (parent.parent_id) {
          const grandparent = await db.get("SELECT balance FROM users WHERE id = $1", [parent.parent_id]);
          if (grandparent) {
            const ggNewBalance = grandparent.balance + INVITE_REWARD_LEVEL2;
            await db.run("UPDATE users SET balance = $1 WHERE id = $2", [ggNewBalance, parent.parent_id]);
            await db.run("INSERT INTO balance_logs (user_id, type, amount, before_balance, after_balance, reason) VALUES ($1,'add',$2,$3,$4,$5)",
              [parent.parent_id, INVITE_REWARD_LEVEL2, grandparent.balance, ggNewBalance, 'Invite reward (Level 2)']);
          }
        }
      }
    }

    const token = jwt.sign({ id: userId, username, level: parentId ? 1 : 0 }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, data: { token, user: { id: userId, username, email, phone, invite_code: userInviteCode, balance: 0 } } });
  } catch (e) {
    console.error('Register error:', e);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { account, password } = req.body;
    if (!account || !password) return res.status(400).json({ success: false, message: 'Account and password required' });
    const user = await db.get("SELECT * FROM users WHERE username = $1 OR email = $2 OR phone = $3",
      [account, account, account]);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    if (user.status === 0) return res.status(403).json({ success: false, message: 'Account disabled' });
    const token = jwt.sign({ id: user.id, username: user.username, level: user.level }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, data: { token, user: { id: user.id, username: user.username, email: user.email, phone: user.phone, balance: user.balance, invite_code: user.invite_code } } });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// Get profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await db.get("SELECT id, username, email, phone, balance, invite_code, created_at FROM users WHERE id = $1", [req.user.id]);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (e) {
    console.error('Profile error:', e);
    res.status(500).json({ success: false, message: 'Failed to get profile' });
  }
});

// Balance logs
router.get('/balance-logs', auth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;
    const logs = await db.all("SELECT * FROM balance_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3", [req.user.id, limit, offset]);
    const total = await db.get("SELECT COUNT(*) as count FROM balance_logs WHERE user_id = $1", [req.user.id]);
    res.json({ success: true, data: logs, pagination: { total: parseInt(total.count), page, limit } });
  } catch (e) {
    console.error('Balance logs error:', e);
    res.status(500).json({ success: false, message: 'Failed to get balance logs' });
  }
});

// Team
router.get('/team', auth, async (req, res) => {
  try {
    const level1 = await db.all(
      "SELECT u.username, u.created_at as invite_time, bl.amount as reward_amount FROM users u LEFT JOIN balance_logs bl ON bl.user_id = u.id AND bl.reason LIKE '%Level 1%' WHERE u.parent_id = $1",
      [req.user.id]
    );
    const level2 = await db.all(
      "SELECT u.username, u.parent_id, p.username as parent_name, u.created_at, bl.amount as reward_amount FROM users u LEFT JOIN users p ON p.id = u.parent_id LEFT JOIN balance_logs bl ON bl.user_id = u.id AND bl.reason LIKE '%Level 2%' WHERE u.parent_id IN (SELECT id FROM users WHERE parent_id = $1)",
      [req.user.id]
    );
    const stats = {
      level1_count: level1.length,
      level2_count: level2.length,
      level1_reward: level1.reduce((sum, u) => sum + (u.reward_amount || 0), 0),
      level2_reward: level2.reduce((sum, u) => sum + (u.reward_amount || 0), 0)
    };
    res.json({ success: true, data: { level1, level2, stats } });
  } catch (e) {
    console.error('Team error:', e);
    res.status(500).json({ success: false, message: 'Failed to get team data' });
  }
});

module.exports = router;
