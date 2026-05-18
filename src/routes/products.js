const express  = require('express');
const { pool } = require('../db/database');
const auth     = require('../middleware/auth');
const router   = express.Router();

router.get('/', auth, async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM products WHERE active=1 ORDER BY category, name');
  res.json(rows);
});

router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'ck') return res.status(403).json({ error: 'CK管理者のみ' });
  const { name, unit = 'kg', category = 'その他' } = req.body;
  if (!name) return res.status(400).json({ error: '商品名は必須です' });
  const { rows: [p] } = await pool.query(
    'INSERT INTO products (name, unit, category) VALUES ($1,$2,$3) RETURNING *',
    [name, unit, category]
  );
  res.status(201).json(p);
});

router.put('/:id', auth, async (req, res) => {
  if (req.user.role !== 'ck') return res.status(403).json({ error: 'CK管理者のみ' });
  const { name, unit, category, active } = req.body;
  const { rows: [p] } = await pool.query(
    'UPDATE products SET name=$1, unit=$2, category=$3, active=$4 WHERE id=$5 RETURNING *',
    [name, unit, category, active ? 1 : 0, req.params.id]
  );
  res.json(p);
});

router.delete('/:id', auth, async (req, res) => {
  if (req.user.role !== 'ck') return res.status(403).json({ error: 'CK管理者のみ' });
  await pool.query('UPDATE products SET active=0 WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
