const db = require('./db');

async function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) return res.redirect('/login');
  next();
}

async function requireActiveSubscription(req, res, next) {
  if (!req.session || !req.session.userId) return res.redirect('/login');
  const user = await db.findUserById(req.session.userId);
  if (!user) return res.redirect('/login');
  if (user.stripe_status !== 'active') return res.redirect('/billing');
  next();
}

module.exports = { requireAuth, requireActiveSubscription };
