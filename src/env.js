module.exports = function validateEnv() {
  const env = process.env.NODE_ENV || 'development';
  const requiredInProd = ['SESSION_SECRET', 'DOMAIN', 'STRIPE_PRICE_ID'];

  if (env === 'production') {
    const missing = requiredInProd.filter(k => !process.env[k]);
    if (missing.length > 0) {
      console.error(`Missing required env vars for production: ${missing.join(', ')}`);
      process.exit(1);
    }
  } else {
    // warn for development
    const warnings = [];
    if (!process.env.SESSION_SECRET) warnings.push('SESSION_SECRET');
    if (!process.env.STRIPE_SECRET && process.env.USE_STRIPE_MOCK !== 'true') warnings.push('STRIPE_SECRET');
    if (warnings.length) console.warn(`Warning: Recommended env vars not set: ${warnings.join(', ')}`);
  }

  // Initialize Sentry if provided (optional)
  if (process.env.SENTRY_DSN) {
    try {
      // lazy require so it is optional
      const Sentry = require('@sentry/node');
      Sentry.init({ dsn: process.env.SENTRY_DSN });
      console.log('Sentry initialized');
    } catch (err) {
      console.warn('SENTRY_DSN provided but @sentry/node is not installed');
    }
  }
};
