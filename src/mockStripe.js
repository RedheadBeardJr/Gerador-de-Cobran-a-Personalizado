// Minimal mock of Stripe API used by the app (for local testing without Stripe)
// Only implements the subset the server uses: customers.create, checkout.sessions.create,
// prices.create, billingPortal.sessions.create, subscriptions.retrieve/update/del,
// paymentIntents.retrieve (returns a mock amount when requested).

const DOMAIN = process.env.DOMAIN || 'http://localhost:3000';
let idCounter = 1;
const subs = new Map();

function gen(prefix) {
  return `${prefix}_${Date.now()}_${(idCounter++).toString(36)}`;
}

module.exports = {
  customers: {
    async create(opts) {
      return { id: gen('mock_cus'), email: opts && opts.email };
    }
  },

  checkout: {
    sessions: {
      async create(opts) {
        const id = gen('mock_cs');
        const metadata = (opts && opts.metadata) || {};
        // Provide a URL that points to a mock checkout page in the app
        const url = `${DOMAIN}/_mock/checkout?session_id=${id}&userId=${metadata.userId || ''}`;

        // If subscription mode create an in-memory subscription object to simulate later retrieval
        if (opts && opts.mode === 'subscription') {
          const subscriptionId = gen('mock_sub');
          subs.set(subscriptionId, {
            id: subscriptionId,
            metadata: opts.subscription_data?.metadata || {},
            items: { data: [{ price: { id: opts.line_items?.[0]?.price || null } }] },
            status: 'incomplete'
          });
          return { id, url, subscription: subscriptionId };
        }

        return { id, url };
      }
    }
  },

  prices: {
    async create(opts) {
      const id = gen('mock_price');
      return { id };
    }
  },

  billingPortal: {
    sessions: {
      async create(opts) {
        const url = `${DOMAIN}/_mock/billing-portal?customer=${opts.customer}`;
        return { url };
      }
    }
  },

  subscriptions: {
    async retrieve(id) {
      return subs.get(id) || { id, metadata: {}, items: { data: [] }, status: 'active' };
    },
    async update(id, data) {
      const s = subs.get(id) || { id, metadata: {}, items: { data: [] }, status: 'active' };
      s.metadata = { ...(s.metadata || {}), ...(data.metadata || {}) };
      subs.set(id, s);
      return s;
    },
    async del(id) {
      subs.delete(id);
      return { id, deleted: true };
    }
  },

  paymentIntents: {
    async retrieve(id) {
      return { id, amount: 1000 };
    }
  }
};
