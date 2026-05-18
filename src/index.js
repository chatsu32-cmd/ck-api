require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const { initDb } = require('./db/database');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/auth',     require('./routes/auth'));
app.use('/orders',   require('./routes/orders'));
app.use('/products', require('./routes/products'));
app.use('/stores',   require('./routes/stores'));

app.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

const PORT = process.env.PORT || 3000;

initDb()
  .then(() => app.listen(PORT, () => console.log(`✅ CK-API 起動中 → http://localhost:${PORT}`)))
  .catch(err => { console.error('DB初期化失敗:', err); process.exit(1); });
