const express    = require('express');
const bcrypt     = require('bcrypt');
const jwt        = require('jsonwebtoken');
const { pool }   = require('../db/database');
const router     = express.Router();

router.post('/login', async (req, res) => {
  const { store_id, password } = req.body;
  if (!store_id || !password) {
    return res.status(400).json({ error: '店舗IDとパスワードを入力してください' });
  }
  const { rows } = await pool.query('SELECT * FROM stores WHERE id=$1', [store_id]);
  const store = rows[0];
  if (!store || !(await bcrypt.compare(password, store.password_hash))) {
    return res.status(401).json({ error: 'IDまたはパスワードが違います' });
  }
  const token = jwt.sign(
    { store_id: store.id, name: store.name, role: store.role },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '24h' }
  );
  res.json({ token, store: { id: store.id, name: store.name, role: store.role } });
});

module.exports = router;
