const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');

let db;

async function init() {
  db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password_hash TEXT,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      stripe_price_id TEXT,
      stripe_status TEXT
    );
  `);
}

async function createUser(email, password_hash) {
  const result = await db.run('INSERT INTO users (email, password_hash) VALUES (?, ?)', [email, password_hash]);
  return findUserById(result.lastID);
}

async function findUserByEmail(email) {
  return db.get('SELECT * FROM users WHERE email = ?', [email]);
}

async function findUserById(id) {
  return db.get('SELECT * FROM users WHERE id = ?', [id]);
}

async function updateUserStripeCustomer(id, customerId) {
  return db.run('UPDATE users SET stripe_customer_id = ? WHERE id = ?', [customerId, id]);
}

async function updateUserStripeDetailsById(id, { subscriptionId, customerId, priceId, status }) {
  const updates = [];
  const params = [];
  if (customerId !== undefined) { updates.push('stripe_customer_id = ?'); params.push(customerId); }
  if (subscriptionId !== undefined) { updates.push('stripe_subscription_id = ?'); params.push(subscriptionId); }
  if (priceId !== undefined) { updates.push('stripe_price_id = ?'); params.push(priceId); }
  if (status !== undefined) { updates.push('stripe_status = ?'); params.push(status); }
  if (updates.length === 0) return;
  params.push(id);
  return db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
}

async function updateUserStripeDetailsBySubscriptionId(subscriptionId, { status }) {
  return db.run('UPDATE users SET stripe_status = ? WHERE stripe_subscription_id = ?', [status, subscriptionId]);
}

async function findUserByStripeSubscriptionId(subscriptionId) {
  return db.get('SELECT * FROM users WHERE stripe_subscription_id = ?', [subscriptionId]);
}

module.exports = {
  init,
  createUser,
  findUserByEmail,
  findUserById,
  updateUserStripeCustomer,
  updateUserStripeDetailsById,
  updateUserStripeDetailsBySubscriptionId,
  findUserByStripeSubscriptionId,
};
