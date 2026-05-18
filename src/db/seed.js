require('dotenv').config();
const bcrypt     = require('bcrypt');
const { pool, initDb } = require('./database');

const ROUNDS = 10;

async function seed() {
  await initDb();

  // CK管理者
  const ckExists = await pool.query("SELECT id FROM stores WHERE role='ck'");
  if (ckExists.rows.length === 0) {
    const hash = await bcrypt.hash('ck-admin-pass', ROUNDS);
    await pool.query("INSERT INTO stores (name, password_hash, role) VALUES ($1,$2,'ck')", ['セントラルキッチン', hash]);
  }

  // サンプル店舗
  const shops = [
    { name: '新宿店',  pass: 'shinjuku123'  },
    { name: '渋谷店',  pass: 'shibuya123'   },
    { name: '池袋店',  pass: 'ikebukuro123' },
  ];
  for (const s of shops) {
    const exists = await pool.query('SELECT id FROM stores WHERE name=$1', [s.name]);
    if (exists.rows.length === 0) {
      const hash = await bcrypt.hash(s.pass, ROUNDS);
      await pool.query('INSERT INTO stores (name, password_hash) VALUES ($1,$2)', [s.name, hash]);
    }
  }

  // 商品マスタ
  const products = [
    { name: 'カルビ',         unit: 'kg', category: '肉類'   },
    { name: 'ロース',         unit: 'kg', category: '肉類'   },
    { name: '牛タン',         unit: 'kg', category: '肉類'   },
    { name: 'ハラミ',         unit: 'kg', category: '肉類'   },
    { name: 'ホルモン',       unit: 'kg', category: '内臓類'  },
    { name: 'レバー',         unit: 'kg', category: '内臓類'  },
    { name: 'テッチャン',     unit: 'kg', category: '内臓類'  },
    { name: 'キムチ',         unit: 'kg', category: '副菜'   },
    { name: 'ナムル',         unit: 'kg', category: '副菜'   },
    { name: 'ご飯（仕込み）', unit: '合', category: 'その他'  },
    { name: 'タレ（醤油）',   unit: 'L',  category: 'タレ'   },
    { name: 'タレ（塩）',     unit: 'L',  category: 'タレ'   },
  ];
  for (const p of products) {
    const exists = await pool.query('SELECT id FROM products WHERE name=$1', [p.name]);
    if (exists.rows.length === 0) {
      await pool.query('INSERT INTO products (name, unit, category) VALUES ($1,$2,$3)', [p.name, p.unit, p.category]);
    }
  }

  console.log('✅ シードデータを投入しました');
  console.log('');
  console.log('--- ログイン情報 ---');
  console.log('CK管理者: 店舗ID=1  パスワード=ck-admin-pass');
  console.log('新宿店:   店舗ID=2  パスワード=shinjuku123');
  console.log('渋谷店:   店舗ID=3  パスワード=shibuya123');
  console.log('池袋店:   店舗ID=4  パスワード=ikebukuro123');
  await pool.end();
}

seed().catch(console.error);
