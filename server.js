require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const path = require('path');
const db = require('./src/db');
const stripeLib = require('stripe');

const STRIPE_SECRET = process.env.STRIPE_SECRET || process.env.STRIPE_SECRET_KEY || '';
const USE_STRIPE_MOCK = process.env.USE_STRIPE_MOCK === 'true' || !STRIPE_SECRET || STRIPE_SECRET.includes('sk_test_xxx');
let stripe;
if (USE_STRIPE_MOCK) {
  stripe = require('./src/mockStripe');
  console.log('Using mock Stripe');
} else {
  stripe = stripeLib(STRIPE_SECRET);
}

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
}));

app.use(express.static(path.join(__dirname, 'public')));

const { requireAuth, requireActiveSubscription } = require('./src/expressMiddleware');

app.get('/', (req, res) => {
  res.render('index', { user: req.session.userId });
});

app.get('/signup', (req, res) => res.render('signup'));
app.post('/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.redirect('/signup');
  const hash = await bcrypt.hash(password, 10);
  try {
    const user = await db.createUser(email, hash);
    req.session.userId = user.id;
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.redirect('/signup');
  }
});

app.get('/login', (req, res) => res.render('login'));
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await db.findUserByEmail(email);
  if (!user) return res.redirect('/login');
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.redirect('/login');
  req.session.userId = user.id;
  res.redirect('/dashboard');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.get('/dashboard', requireAuth, requireActiveSubscription, async (req, res) => {
  const user = await db.findUserById(req.session.userId);
  res.render('dashboard', { user });
});

app.get('/billing', requireAuth, async (req, res) => {
  const user = await db.findUserById(req.session.userId);
  res.render('billing', { user, stripePublicKey: process.env.STRIPE_PUBLISHABLE });
});

app.post('/create-checkout-session', requireAuth, async (req, res) => {
  const domain = process.env.DOMAIN || 'http://localhost:3000';
  const origin = req.headers.origin || domain;
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) return res.status(500).send('Price not configured');
  const user = await db.findUserById(req.session.userId);
  let customerId = user.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email });
    customerId = customer.id;
    await db.updateUserStripeCustomer(user.id, customerId);
  }
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { userId: String(user.id) },
    success_url: `${origin}/dashboard?success=true`,
    cancel_url: `${origin}/billing?canceled=true`
  });
  res.redirect(303, session.url);
});

// API route used by client components to start checkout and receive JSON { url }
app.post('/api/checkout', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const { paymentMethod, amount, productName, customerPhone, customerName } = body;
    const domain = process.env.DOMAIN || 'http://localhost:3000';
    const origin = req.headers.origin || domain;

    if (!amount || !productName) return res.status(400).json({ error: 'missing amount or productName' });
    const unitAmount = Math.round(Number(amount) * 100); // in cents

    // Find or create customer for authenticated user
    const user = await db.findUserById(req.session.userId);
    let customerId = user && user.stripe_customer_id;
    if (!customerId && user) {
      const customer = await stripe.customers.create({ email: user.email, name: customerName, phone: customerPhone });
      customerId = customer.id;
      await db.updateUserStripeCustomer(user.id, customerId);
    }

    // Prepare session metadata
    const sessionMetadata = { customerPhone: customerPhone || '', productName };

    if (paymentMethod === 'card') {
      // One-time payment with card and installments
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        payment_method_options: { card: { installments: { enabled: true } } },
        line_items: [{
          price_data: {
            currency: 'brl',
            product_data: { name: productName, description: 'Qualidade Baltussen' },
            unit_amount: unitAmount
          },
          quantity: 1
        }],
        mode: 'payment',
        metadata: sessionMetadata,
        success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/`
      });
      return res.json({ url: session.url });
    }

    if (paymentMethod === 'pix') {
      // Pix as a monthly subscription (10 months)
      const price = await stripe.prices.create({
        currency: 'brl',
        unit_amount: Math.round(unitAmount / 10),
        recurring: { interval: 'month', interval_count: 1 },
        product_data: { name: `${productName} (Parcelado Pix 10x)` }
      });

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['pix'],
        payment_method_options: { pix: { expires_at: Math.floor(Date.now() / 1000) + 3600 } },
        line_items: [{ price: price.id, quantity: 1 }],
        mode: 'subscription',
        subscription_data: { description: 'Parcelamento Pix Baltussen', metadata: { max_installments: '10', payments_made: '0' } },
        metadata: sessionMetadata,
        success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/`
      });

      return res.json({ url: session.url });
    }

    // Default behavior: create a subscription using STRIPE_PRICE_ID (existing flow)
    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) return res.status(500).json({ error: 'Price not configured' });
    if (!user) return res.status(400).json({ error: 'user not found' });

    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email });
      customerId = customer.id;
      await db.updateUserStripeCustomer(user.id, customerId);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { userId: String(user.id) },
      success_url: `${origin}/dashboard?success=true`,
      cancel_url: `${origin}/billing?canceled=true`
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Error creating checkout session', err);
    res.status(500).json({ error: 'internal' });
  }
});

// Billing Portal: cria uma sessão para o Stripe Customer Portal e retorna { url }
app.post('/api/portal', requireAuth, async (req, res) => {
  try {
    const domain = process.env.DOMAIN || 'http://localhost:3000';
    const origin = req.headers.origin || domain;
    const user = await db.findUserById(req.session.userId);
    if (!user || !user.stripe_customer_id) return res.status(400).json({ error: 'no_customer' });

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${origin}/dashboard`
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Error creating billing portal session', err);
    res.status(500).json({ error: 'internal' });
  }
});

// Admin: gerar cobranca UI
app.get('/admin/gerar-cobranca', requireAuth, async (req, res) => {
  res.render('admin_gerar');
});

// One-time payment endpoint for product purchases (card + pix)
app.post('/api/payment', async (req, res) => {
  try {
    const { name, unit_amount, quantity = 1, images = [] } = req.body || {};
    if (!name || !unit_amount) return res.status(400).json({ error: 'missing name or unit_amount' });

    const domain = process.env.DOMAIN || 'http://localhost:3000';
    const origin = req.headers.origin || domain;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'pix'],
      payment_method_options: {
        card: {
          installments: { enabled: true }
        }
      },
      line_items: [{
        price_data: {
          currency: 'brl',
          product_data: { name, images },
          unit_amount: Number(unit_amount)
        },
        quantity: Number(quantity)
      }],
      mode: 'payment',
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/`
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Error creating payment session', err);
    res.status(500).json({ error: 'internal' });
  }
});

app.get('/success', requireAuth, (req, res) => res.render('success'));

app.post('/webhook', bodyParser.raw({type: 'application/json'}), (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
  let event = null;
  try {
    if (webhookSecret) event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    else event = req.body;
  } catch (err) {
    console.error('Webhook signature verification failed.', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const { sendWhatsApp } = require('./src/notifications');

  (async () => {
    try {
      // checkout.session.completed
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const subscriptionId = session.subscription;
        let subscription = null;
        if (subscriptionId) {
          subscription = await stripe.subscriptions.retrieve(subscriptionId);
        }

        const userIdFromMetadata = session.metadata && session.metadata.userId;
        if (userIdFromMetadata) {
          await db.updateUserStripeDetailsById(userIdFromMetadata, {
            subscriptionId: subscription ? subscription.id : null,
            customerId: session.customer,
            priceId: subscription && subscription.items && subscription.items.data[0] ? subscription.items.data[0].price.id : null,
            status: 'active',
          });
        } else if (session.customer_details && session.customer_details.email) {
          const user = await db.findUserByEmail(session.customer_details.email);
          if (user) {
            await db.updateUserStripeDetailsById(user.id, {
              subscriptionId: subscription ? subscription.id : null,
              customerId: session.customer,
              priceId: subscription && subscription.items && subscription.items.data[0] ? subscription.items.data[0].price.id : null,
              status: 'active',
            });
          }
        }

        // Send notification (admin) about successful checkout
        try {
          let amount = session.amount_total;
          if (!amount && session.payment_intent) {
            const pi = await stripe.paymentIntents.retrieve(session.payment_intent);
            amount = pi.amount;
          }
          const amountBRL = amount ? (amount / 100).toFixed(2) : '—';
          const email = session.customer_details && session.customer_details.email || session.customer_email || 'cliente';
          const adminPhone = process.env.ADMIN_WHATSAPP || '';
          const msg = `\u{1F4B0} Pagamento recebido: R$ ${amountBRL} \nCliente: ${email} \nTipo: ${subscriptionId ? 'assinatura' : 'pagamento único'}`;
          if (adminPhone) await sendWhatsApp(adminPhone, msg);
        } catch (err) {
          console.error('Error sending checkout notification', err);
        }
      }

      // invoice.payment_succeeded
      if (event.type === 'invoice.payment_succeeded') {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        if (subscriptionId) {
          // Retrieve subscription to read metadata
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const maxInstallments = parseInt(subscription.metadata?.max_installments || '0', 10);
          const paymentsMade = parseInt(subscription.metadata?.payments_made || '0', 10) + 1;

          // update payments_made metadata
          await stripe.subscriptions.update(subscriptionId, { metadata: { ...(subscription.metadata || {}), payments_made: String(paymentsMade) } });

          // Notify admin/user via WhatsApp
          try {
            const adminPhone = process.env.ADMIN_WHATSAPP || '';
            const customerEmail = invoice.customer_email || 'cliente';
            const amountPaid = (invoice.amount_paid || invoice.total || 0) / 100;
            const msg = `\u{1F4C8} Parcela paga: R$ ${amountPaid.toFixed(2)} \nCliente: ${customerEmail} \nAssinatura: ${subscriptionId} \nParcela: ${paymentsMade}/${maxInstallments || '∞'}`;
            if (adminPhone) await sendWhatsApp(adminPhone, msg);
          } catch (err) {
            console.error('Error sending invoice success notification', err);
          }

          // If we've reached the max, cancel the subscription
          if (maxInstallments > 0 && paymentsMade >= maxInstallments) {
            try {
              await stripe.subscriptions.del(subscriptionId);
              await db.updateUserStripeDetailsBySubscriptionId(subscriptionId, { status: 'canceled' });
            } catch (err) {
              console.error('Error cancelling subscription after max installments', err);
            }
          } else {
            // otherwise mark active
            await db.updateUserStripeDetailsBySubscriptionId(subscriptionId, { status: 'active' });
          }
        }
      }

      // subscription cancelled
      if (event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object;
        if (subscription && subscription.id) {
          await db.updateUserStripeDetailsBySubscriptionId(subscription.id, { status: 'canceled' });
        }
      }

      // invoice.payment_failed -> mark as past_due
      if (event.type === 'invoice.payment_failed') {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        if (subscriptionId) {
          await db.updateUserStripeDetailsBySubscriptionId(subscriptionId, { status: 'past_due' });
        }

        // Notify admin about failed payment
        try {
          const adminPhone = process.env.ADMIN_WHATSAPP || '';
          const customerEmail = invoice.customer_email || 'cliente';
          const amountDue = (invoice.amount_due || invoice.total || 0) / 100;
          const msg = `\u{26A0} Pagamento falhou: R$ ${amountDue.toFixed(2)} \nCliente: ${customerEmail} \nAssinatura: ${subscriptionId || '—'}`;
          if (adminPhone) await sendWhatsApp(adminPhone, msg);
        } catch (err) {
          console.error('Error sending invoice failed notification', err);
        }
      }
    } catch (err) {
      console.error('Error handling webhook event', err);
    }
  })();

  res.json({ received: true });
});

// Mock checkout UI and helper endpoints (used when USE_STRIPE_MOCK=true)
if (USE_STRIPE_MOCK) {
  app.get('/_mock/checkout', (req, res) => {
    const sessionId = req.query.session_id || '';
    const userId = req.query.userId || '';
    res.send(`<!doctype html><html><body><h1>Mock Checkout</h1><p>Session: ${sessionId}</p><p>User: ${userId}</p><button onclick="complete()">Complete checkout</button><script>async function complete(){ const res = await fetch('/_mock/complete-checkout', {method:'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ sessionId: '${sessionId}', userId: '${userId}' })}); const j = await res.json(); if (j.ok) { alert('Checkout completed (mock)'); window.location = '/dashboard'; } else alert('Error'); }</script></body></html>`);
  });

  app.post('/_mock/complete-checkout', bodyParser.json(), async (req, res) => {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'missing userId' });
    try {
      const subscriptionId = `mock_sub_${Date.now()}`;
      await db.updateUserStripeDetailsById(userId, { subscriptionId, customerId: `mock_cus_${Date.now()}`, priceId: null, status: 'active' });
      return res.json({ ok: true, subscriptionId });
    } catch (err) {
      console.error('Error completing mock checkout', err);
      return res.status(500).json({ error: 'internal' });
    }
  });
}

// Mock WhatsApp provider for local testing
app.post('/_mock-wa', bodyParser.json(), (req, res) => {
  console.log('[MOCK-WA] received', req.body);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  await db.init();
  console.log(`Server running on port ${PORT}`);
});
