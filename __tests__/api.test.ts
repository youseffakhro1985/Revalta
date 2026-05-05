import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import db from '@/lib/db';

describe('API integration tests', () => {
  const baseUrl = 'http://localhost:3000';
  const testEmail = `api-test-${Date.now()}@revalta.se`;
  const testPassword = 'TestApiPass123!';
  let authCookie: string;

  beforeAll(async () => {
    await db.$connect();
    // Warm up the dev server (first request triggers route compilation)
    await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'warmup@test.se', password: 'x' }),
    }).catch(() => {});
    await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'warmup@test.se', password: 'x' }),
    }).catch(() => {});
    await fetch(`${baseUrl}/api/tickets`).catch(() => {});
  }, 30000);

  afterAll(async () => {
    await db.ticket.deleteMany({ where: { user: { email: testEmail } } });
    await db.user.deleteMany({ where: { email: testEmail } });
    await db.$disconnect();
  });

  describe('POST /api/auth/register', () => {
    it('registers a new user successfully', async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'API Tester', email: testEmail, password: testPassword }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('rejects duplicate email', async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Dup', email: testEmail, password: testPassword }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('redan');
    });

    it('rejects request without email', async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'something' }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('logs in with correct credentials', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail, password: testPassword }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.user.email).toBe(testEmail);

      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toContain('token=');
      authCookie = setCookie!.split(';')[0];
    });

    it('rejects wrong password', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail, password: 'WrongPassword' }),
      });

      expect(res.status).toBe(401);
    });

    it('rejects non-existent user', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nobody@revalta.se', password: 'whatever' }),
      });

      expect(res.status).toBe(401);
    });
  });

  describe('Tickets API', () => {
    it('rejects unauthenticated ticket creation', async () => {
      const res = await fetch(`${baseUrl}/api/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test', description: 'Test' }),
      });

      expect(res.status).toBe(401);
    });

    it('creates a ticket when authenticated', async () => {
      const res = await fetch(`${baseUrl}/api/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie,
        },
        body: JSON.stringify({
          title: 'Vattenläcka i badrum',
          description: 'Det läcker vatten från taket i badrummet på våning 3.',
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.id).toBeTruthy();
    });

    it('lists tickets for authenticated user', async () => {
      const res = await fetch(`${baseUrl}/api/tickets`, {
        headers: { Cookie: authCookie },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.tickets).toBeInstanceOf(Array);
      expect(data.tickets.length).toBeGreaterThanOrEqual(1);
      expect(data.tickets[0].title).toBe('Vattenläcka i badrum');
    });

    it('rejects ticket creation without title', async () => {
      const res = await fetch(`${baseUrl}/api/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie,
        },
        body: JSON.stringify({ description: 'Missing title' }),
      });

      expect(res.status).toBe(400);
    });
  });
});
