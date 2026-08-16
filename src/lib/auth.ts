import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from "crypto";
export { signToken, verifyToken } from './session';

// 12 rounds balances resistance to offline cracking against bcryptjs's (pure-JS,
// slower than native bcrypt) per-hash latency on serverless CPUs.
const BCRYPT_COST_FACTOR = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST_FACTOR);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function createResetToken() {
  return randomBytes(32).toString("hex");
}

export function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
