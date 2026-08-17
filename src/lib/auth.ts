import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from "crypto";
export { signToken, verifyToken } from './session';

// bcryptjs is pure JavaScript, so cost 12 can exceed Revalta's registration
// latency budget on constrained serverless CPUs. OWASP's legacy-bcrypt
// guidance requires a work factor of 10 or greater; cost 10 keeps new hashes
// within that floor while existing higher-cost hashes remain fully verifiable.
const BCRYPT_COST_FACTOR = 10;

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
