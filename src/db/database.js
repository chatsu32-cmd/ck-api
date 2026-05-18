const { Pool } = require('pg');

const isExternalDb = process.env.DATABASE_URL?.includes('.render.com');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isExternalDb ? { rejectUnauthorized: false } : false,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stores (
      id            SERIAL PRIMARY KEY,
      name          TEXT   NOT NULL,
      password_hash TEXT   NOT NULL,
      role          TEXT   NOT NULL DEFAULT 'store',
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id       SERIAL  PRIMARY KEY,
      name     TEXT    NOT NULL,
      unit     TEXT    NOT NULL DEFAULT 'kg',
      category TEXT    NOT NULL DEFAULT 'その他',
      active   SMALLINT NOT NULL DEFAULT 1
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id            SERIAL  PRIMARY KEY,
      store_id      INTEGER NOT NULL REFERENCES stores(id),
      status        TEXT    NOT NULL DEFAULT 'pending',
      delivery_date TEXT,
      notes         TEXT,
      ordered_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id         SERIAL  PRIMARY KEY,
      order_id   INTEGER NOT NULL REFERENCES orders(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity   REAL    NOT NULL,
      unit       TEXT    NOT NULL
    )
  `);
}

module.exports = { pool, initDb };
