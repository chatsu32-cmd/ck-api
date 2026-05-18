const express         = require('express');
const { pool }        = require('../db/database');
const auth            = require('../middleware/auth');
const { generatePdf } = require('../utils/pdfGenerator');
const { notify }      = require('../utils/notify');
const router          = express.Router();

const ORDER_SELECT = `
  SELECT o.*, s.name AS store_name,
    TO_CHAR(o.ordered_at AT TIME ZONE 'Asia/Tokyo', 'YYYY/MM/DD HH24:MI') AS ordered_at,
    TO_CHAR(o.updated_at AT TIME ZONE 'Asia/Tokyo', 'YYYY/MM/DD HH24:MI') AS updated_at
  FROM orders o JOIN stores s ON o.store_id = s.id
`;

// 発注一覧
router.get('/', auth, async (req, res) => {
  const { role, store_id } = req.user;
  const { rows } = role === 'ck'
    ? await pool.query(ORDER_SELECT + ' ORDER BY o.ordered_at DESC')
    : await pool.query(ORDER_SELECT + ' WHERE o.store_id=$1 ORDER BY o.ordered_at DESC', [store_id]);
  res.json(rows);
});

// 発注詳細
router.get('/:id', auth, async (req, res) => {
  const { rows } = await pool.query(ORDER_SELECT + ' WHERE o.id=$1', [req.params.id]);
  const order = rows[0];
  if (!order) return res.status(404).json({ error: '発注が見つかりません' });
  if (req.user.role !== 'ck' && order.store_id !== req.user.store_id) {
    return res.status(403).json({ error: 'アクセス権限がありません' });
  }
  const { rows: items } = await pool.query(`
    SELECT oi.*, p.name AS product_name, p.category
    FROM order_items oi JOIN products p ON oi.product_id = p.id
    WHERE oi.order_id=$1
  `, [req.params.id]);
  res.json({ ...order, items });
});

// 発注作成
router.post('/', auth, async (req, res) => {
  const { delivery_date, notes, items } = req.body;
  if (!items || items.length === 0) {
    return res.status(400).json({ error: '商品を1つ以上選択してください' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [order] } = await client.query(
      'INSERT INTO orders (store_id, delivery_date, notes) VALUES ($1,$2,$3) RETURNING id',
      [req.user.store_id, delivery_date || null, notes || null]
    );
    const orderId = order.id;
    for (const item of items) {
      const { rows: [product] } = await client.query(
        'SELECT * FROM products WHERE id=$1 AND active=1', [item.product_id]
      );
      if (!product) throw new Error(`商品ID ${item.product_id} が見つかりません`);
      await client.query(
        'INSERT INTO order_items (order_id, product_id, quantity, unit) VALUES ($1,$2,$3,$4)',
        [orderId, item.product_id, item.quantity, product.unit]
      );
    }
    await client.query('COMMIT');

    const { rows: [fullOrder] } = await pool.query(ORDER_SELECT + ' WHERE o.id=$1', [orderId]);
    const { rows: orderItems }  = await pool.query(`
      SELECT oi.*, p.name AS product_name, p.category
      FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id=$1
    `, [orderId]);

    notify({ order: fullOrder, items: orderItems }).catch(err => console.error('[notify]', err.message));
    res.status(201).json({ ...fullOrder, items: orderItems });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ステータス更新（CKのみ）
router.patch('/:id/status', auth, async (req, res) => {
  if (req.user.role !== 'ck') return res.status(403).json({ error: 'CK管理者のみ変更できます' });
  const VALID = ['pending', 'confirmed', 'preparing', 'delivered', 'cancelled'];
  if (!VALID.includes(req.body.status)) {
    return res.status(400).json({ error: `statusは ${VALID.join(' / ')} のいずれかです` });
  }
  await pool.query('UPDATE orders SET status=$1, updated_at=NOW() WHERE id=$2', [req.body.status, req.params.id]);
  res.json({ ok: true });
});

// PDF出力
router.get('/:id/pdf', auth, async (req, res) => {
  const { rows: [order] } = await pool.query(ORDER_SELECT + ' WHERE o.id=$1', [req.params.id]);
  if (!order) return res.status(404).json({ error: '発注が見つかりません' });
  const { rows: items } = await pool.query(`
    SELECT oi.*, p.name AS product_name, p.category
    FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id=$1
  `, [req.params.id]);
  try {
    const pdfBuffer = await generatePdf({ order, items });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="order_${req.params.id}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ error: 'PDF生成失敗: ' + err.message });
  }
});

module.exports = router;
