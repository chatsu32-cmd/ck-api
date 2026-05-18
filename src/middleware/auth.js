const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const header = req.headers.authorization;
  const token = (header && header.startsWith('Bearer ') ? header.slice(7) : null)
    || req.query.token;
  if (!token) {
    return res.status(401).json({ error: '認証トークンがありません' });
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    next();
  } catch {
    res.status(401).json({ error: 'トークンが無効または期限切れです' });
  }
};
