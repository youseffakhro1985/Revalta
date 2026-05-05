import { describe, it, expect, beforeAll } from 'vitest';
import { hashPassword, comparePassword, signToken, verifyToken } from '@/lib/auth';

beforeAll(() => {
  process.env.JWT_SECRET = 'test_secret_key_for_vitest_12345';
});

describe('auth utilities', () => {
  describe('hashPassword / comparePassword', () => {
    it('hashes a password and verifies it correctly', async () => {
      const password = 'SecurePass123!';
      const hash = await hashPassword(password);

      expect(hash).not.toBe(password);
      expect(hash).toMatch(/^\$2[aby]\$/);
      expect(await comparePassword(password, hash)).toBe(true);
    });

    it('rejects an incorrect password', async () => {
      const hash = await hashPassword('CorrectPassword');
      expect(await comparePassword('WrongPassword', hash)).toBe(false);
    });

    it('produces different hashes for the same password (salt)', async () => {
      const password = 'SamePassword';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('signToken / verifyToken', () => {
    it('signs and verifies a JWT token', async () => {
      const payload = { sub: 'user-123', email: 'test@revalta.se' };
      const token = await signToken(payload);

      expect(token).toBeTruthy();
      expect(token.split('.')).toHaveLength(3);

      const decoded = await verifyToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded!.sub).toBe('user-123');
      expect(decoded!.email).toBe('test@revalta.se');
    });

    it('returns null for an invalid token', async () => {
      const result = await verifyToken('invalid.token.value');
      expect(result).toBeNull();
    });

    it('returns null for a tampered token', async () => {
      const token = await signToken({ sub: 'user-1', email: 'x@x.se' });
      const tampered = token.slice(0, -5) + 'XXXXX';
      const result = await verifyToken(tampered);
      expect(result).toBeNull();
    });

    it('includes iat and exp claims', async () => {
      const token = await signToken({ sub: 'user-1', email: 'x@x.se' });
      const decoded = await verifyToken(token);
      expect(decoded!.iat).toBeDefined();
      expect(decoded!.exp).toBeDefined();
      expect(decoded!.exp! - decoded!.iat!).toBe(86400);
    });

    it('throws if JWT_SECRET is not set', async () => {
      const original = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;
      await expect(signToken({ sub: 'x', email: 'x@x.se' })).rejects.toThrow('JWT_SECRET');
      process.env.JWT_SECRET = original;
    });
  });
});
