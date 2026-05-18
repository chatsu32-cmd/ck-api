const nodemailer = require('nodemailer');

async function notify({ order, items }) {
  const method = (process.env.NOTIFY_METHOD || 'none').toLowerCase();
  if (method === 'none') return;

  const text = buildText(order, items);
  if (method === 'email' || method === 'both') await sendEmail(text, order);
  if (method === 'line'  || method === 'both') await sendLine(text);
}

function buildText(order, items) {
  return [
    '【新規発注が届きました】',
    `発注No: ${order.id}`,
    `店舗:   ${order.store_name}`,
    `日時:   ${order.ordered_at}`,
    `納品予定: ${order.delivery_date || '未定'}`,
    '',
    '--- 発注内容 ---',
    ...items.map(i => `${i.product_name}: ${i.quantity} ${i.unit}`),
    ...(order.notes ? ['', `備考: ${order.notes}`] : []),
  ].join('\n');
}

async function sendEmail(text, order) {
  const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: parseInt(process.env.MAIL_PORT || '587'),
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
  });
  await transporter.sendMail({
    from:    process.env.MAIL_FROM,
    to:      process.env.MAIL_TO,
    subject: `[CK発注] ${order.store_name} — No.${order.id}`,
    text,
  });
}

async function sendLine(text) {
  const https = require('https');
  const body  = new URLSearchParams({ message: '\n' + text }).toString();
  await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'notify-api.line.me',
      path:     '/api/notify',
      method:   'POST',
      headers: {
        Authorization:    `Bearer ${process.env.LINE_TOKEN}`,
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => { res.resume(); res.on('end', resolve); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { notify };
