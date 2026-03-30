const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { run, get, all, save } = require('../database');
const { authMiddleware, generateToken } = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { username, email, phone, password, invite_code } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'Username and password required' });
    if (!email && !phone) return res.status(400).json({ success: false, message: 'Email or phone required' });

    const exists = get('SELECT id FROM users WHERE username = ? OR email = ? OR phone = ?', [username, email || '', phone || '']);
    if (exists) return res.status(400).json({ success: false, message: 'User already exists' });

    const hash = await bcrypt.hash(password, 10);
    const code = uuidv4().substring(0, 8).toUpperCase();
    let parentId = null;
    if (invite_code) {
      const ref = get('SELECT id FROM users WHERE invite_code = ?', [invite_code]);
      if (ref) parentId = ref.id;
    }

    const result = run('INSERT INTO users (username, email, phone, password, invite_code, parent_id) VALUES (?, ?, ?, ?, ?, ?)', [username, email || null, phone || null, hash, code, parentId]);
    const userId = result.lastInsertRowid;

    if (parentId) {
      const parent = get('SELECT id, parent_id, balance FROM users WHERE id = ?', [parentId]);
      if (parent) {
        const r1 = 10;
        run('UPDATE users SET balance = balance + ? WHERE id = ?', [r1, parent.id]);
        run('INSERT INTO balance_logs (user_id, type, amount, before_balance, after_balance, reason) VALUES (?, ?, ?, ?, ?, ?)', [parent.id, 'add', r1, parent.balance, parent.balance + r1, 'Level 1 referral reward']);
        run('INSERT INTO invite_rewards (inviter_id, invitee_id, level, reward_amount) VALUES (?, ?, ?, ?)', [parent.id, userId, 1, r1]);
        if (parent.parent_id) {
          const gp = get('SELECT id, balance FROM users WHERE id = ?', [parent.parent_id]);
          if (gp) {
            const r2 = 5;
            run('UPDATE users SET balance = balance + ? WHERE id = ?', [r2, gp.id]);
            run('INSERT INTO balance_logs (user_id, type, amount, before_balance, after_balance, reason) VALUES (?, ?, ?, ?, ?, ?)', [gp.id, 'add', r2, gp.balance, gp.balance + r2, 'Level 2 referral reward']);
            run('INSERT INTO invite_rewards (inviter_id, invitee_id, level, reward_amount) VALUES (?, ?, ?, ?)', [gp.id, userId, 2, r2]);
          }
        }
      }
    }
    save();
    const token = generateToken({ id: userId, username, role: 'user' });
    res.json({ success: true, data: { token, user: { id: userId, username, invite_code: code } } });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = get('SELECT * FROM users WHERE username = ? OR email = ? OR phone = ?', [username, username, username]);
    if (!user) return res.status(400).json({ success: false, message: 'User not found' });
    if (user.status === 0) return res.status(400).json({ success: false, message: 'Account disabled' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ success: false, message: 'Incorrect password' });
    const token = generateToken(user);
    res.json({ success: true, data: { token, user: { id: user.id, username: user.username, email: user.email, phone: user.phone, balance: user.balance, invite_code: user.invite_code, role: user.role } } });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.get('/profile', authMiddleware, (req, res) => {
  const user = get('SELECT id, username, email, phone, avatar, balance, invite_code, parent_id, created_at FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, data: user });
});

router.get('/team', authMiddleware, (req, res) => {
  const level1 = all(`SELECT u.id, u.username, u.created_at, r.reward_amount, r.created_at as invite_time FROM users u LEFT JOIN invite_rewards r ON u.id = r.invitee_id AND r.inviter_id = ? WHERE u.parent_id = ?`, [req.user.id, req.user.id]);
  const level2Ids = level1.map(u => u.id);
  let level2 = [];
  if (level2Ids.length > 0) {
    level2 = all(`SELECT u.id, u.username, u.created_at, r.reward_amount, r.created_at as invite_time, p.username as parent_name FROM users u LEFT JOIN invite_rewards r ON u.id = r.invitee_id AND r.level = 2 LEFT JOIN users p ON u.parent_id = p.id WHERE u.parent_id IN (${level2Ids.map(() => '?').join(',')})`, level2Ids);
  }
  const stats = { level1_count: level1.length, level2_count: level2.length, level1_reward: level1.reduce((s, u) => s + (u.reward_amount || 0), 0), level2_reward: level2.reduce((s, u) => s + (u.reward_amount || 0), 0) };
  res.json({ success: true, data: { level1, level2, stats } });
});

router.get('/balance-logs', authMiddleware, (req, res) => {
  const logs = all('SELECT * FROM balance_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [req.user.id]);
  res.json({ success: true, data: logs });
});

module.exports = router;
