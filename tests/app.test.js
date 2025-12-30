const request = require('supertest');
const app = require('../server');
const db = require('../src/db');

beforeAll(async () => {
  // Use in-memory DB for tests
  process.env.DB_PATH = ':memory:';
  await db.init();
});

afterAll(async () => {
  // nothing to close for sqlite open in this setup
});

describe('Basic routes', () => {
  test('GET / returns 200', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
    // Page contains the main heading from views/index.ejs
    expect(res.text).toContain('Painel SaaS');
  }, 10000);

  test('Signup flow (basic)', async () => {
    const res = await request(app)
      .post('/signup')
      .send({ email: 'test@example.com', password: 'secret' });
    // signup redirects to /dashboard on success
    expect(res.statusCode).toBe(302);
  }, 10000);
});
