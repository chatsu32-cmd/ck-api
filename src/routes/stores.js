const express  = require('express');
const bcrypt   = require('bcrypt');
const { pool } = require('../db/database');
const auth     = require('../middleware/auth');
const router   = express.Router();

router.get('/', auth, async (req, res) => {
  if (req.user.role !== 'ck') return res.status(403).json({ error: 'CK管理者のみ' });
  const { rows } = await pool.query("SELECT id, name, role, created_at FROM stores WHERE role='store' ORDER BY id");
  res.json(rows);
});

router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'ck') return res.status(403).json({ error: 'CK管理者のみ' });
  const { name, password } = req.body;
  if (!name || !password) return res.status(400).json({ error: '名前とパスワードが必要です' });
  const hash = await bcrypt.hash(password, 10);
  const { rows: [s] } = await pool.query(
    "INSERT INTO stores (name, password_hash, role) VALUES ($1,$2,'store') RETURNING id, name, role",
    [name, hash]
  );
  res.status(201).json(s);
});

module.exports = router;
