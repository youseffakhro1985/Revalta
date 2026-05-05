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
      body: JSON.stringify({ email: 'warmup@test.se', password: 'whatever1' }),
    }).catch(() => {});
    await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'warmup@test.se', password: 'whatever1' }),
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
        body: JSON.stringify({ password: 'something123' }),
      });

      expect(res.status).toBe(400);
    });

    it('rejects short password', async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'short@test.se', password: '1234567' }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('8 tecken');
    });

    it('rejects invalid email format', async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email', password: 'Password123' }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Ogiltig');
    });

    it('normalizes email to lowercase', async () => {
      const upperEmail = `UPPER-${Date.now()}@REVALTA.SE`;
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Upper', email: upperEmail, password: 'Password123' }),
      });

      expect(res.status).toBe(201);

      // Clean up
      await db.user.deleteMany({ where: { email: upperEmail.trim().toLowerCase() } });
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
        body: JSON.stringify({ email: testEmail, password: 'WrongPassword1' }),
      });

      expect(res.status).toBe(401);
    });

    it('rejects non-existent user', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nobody@revalta.se', password: 'whatever1' }),
      });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears the auth cookie', async () => {
      const res = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: { Cookie: authCookie },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toContain('token=');
    });

    it('still works after logout (re-login for subsequent tests)', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail, password: testPassword }),
      });
      expect(res.status).toBe(200);
      const setCookie = res.headers.get('set-cookie');
      authCookie = setCookie!.split(';')[0];
    });
  });

  describe('Tickets API', () => {
    it('rejects unauthenticated ticket creation', async () => {
      const res = await fetch(`${baseUrl}/api/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test', description: 'Test description' }),
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
        body: JSON.stringify({ description: 'Missing title here' }),
      });

      expect(res.status).toBe(400);
    });

    it('trims and limits title/description length', async () => {
      const longTitle = 'A'.repeat(300);
      const res = await fetch(`${baseUrl}/api/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie,
        },
        body: JSON.stringify({ title: longTitle, description: 'Test' }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();

      // Verify it was truncated
      const ticketRes = await fetch(`${baseUrl}/api/tickets/${data.id}`, {
        headers: { Cookie: authCookie },
      });
      const ticketData = await ticketRes.json();
      expect(ticketData.ticket.title.length).toBeLessThanOrEqual(200);
    });
  });
});
