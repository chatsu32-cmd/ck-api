require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const { initDb, pool } = require('./db/database');
const bcrypt     = require('bcrypt');

const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/auth',     require('./routes/auth'));
app.use('/orders',   require('./routes/orders'));
app.use('/products', require('./routes/products'));
app.use('/stores',   require('./routes/stores'));

app.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

async function seedIfEmpty() {
  const { rows } = await pool.query("SELECT id FROM stores WHERE role='ck' LIMIT 1");
  if (rows.length > 0) return;

  const stores = [
    { name: 'セントラルキッチン', pass: 'ck-admin-pass', role: 'ck' },
    { name: '新宿店',  pass: 'shinjuku123' },
    { name: '渋谷店',  pass: 'shibuya123'  },
    { name: '池袋店',  pass: 'ikebukuro123' },
  ];
  for (const s of stores) {
    const hash = await bcrypt.hash(s.pass, 10);
    await pool.query(
      "INSERT INTO stores (name, password_hash, role) VALUES ($1,$2,$3)",
      [s.name, hash, s.role || 'store']
    );
  }

  const products = [
    { name: 'カルビ',         unit: 'kg', category: '肉類'  },
    { name: 'ロース',         unit: 'kg', category: '肉類'  },
    { name: '牛タン',         unit: 'kg', category: '肉類'  },
    { name: 'ハラミ',         unit: 'kg', category: '肉類'  },
    { name: 'ホルモン',       unit: 'kg', category: '内臓類' },
    { name: 'レバー',         unit: 'kg', category: '内臓類' },
    { name: 'テッチャン',     unit: 'kg', category: '内臓類' },
    { name: 'キムチ',         unit: 'kg', category: '副菜'  },
    { name: 'ナムル',         unit: 'kg', category: '副菜'  },
    { name: 'ご飯（仕込み）', unit: '合', category: 'その他' },
    { name: 'タレ（醤油）',   unit: 'L',  category: 'タレ'  },
    { name: 'タレ（塩）',     unit: 'L',  category: 'タレ'  },
  ];
  for (const p of products) {
    await pool.query('INSERT INTO products (name, unit, category) VALUES ($1,$2,$3)', [p.name, p.unit, p.category]);
  }
  console.log('✅ 初期データ投入完了');
}

const PORT = process.env.PORT || 3000;

initDb()
  .then(seedIfEmpty)
  .then(() => app.listen(PORT, () => console.log(`✅ CK-API 起動中 → http://localhost:${PORT}`)))
  .catch(err => { console.error('DB初期化失敗:', err); process.exit(1); });
