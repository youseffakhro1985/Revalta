import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const secretKey = process.env.SESSION_SECRET || 'super-secret-key-revalta-development'
const encodedKey = new TextEncoder().encode(secretKey)

export type SessionPayload = {
  userId: string;
  email: string;
  role: string;
  status: string;
  companyId: string | null;
  companyStatus: string | null;
  expiresAt: Date;
}

export async function encrypt(payload: SessionPayload) {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(encodedKey)
}

export async function decrypt(session: string | undefined = '') {
  try {
    const { payload } = await jwtVerify(session, encodedKey, {
      algorithms: ['HS256'],
    })
    return payload as SessionPayload
  } catch {
    return null
  }
}

export async function createSession(payload: Omit<SessionPayload, 'expiresAt'>) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const session = await encrypt({ ...payload, expiresAt })

  const cookieStore = await cookies()
  cookieStore.set('revalta_session', session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
    sameSite: 'lax',
    path: '/',
  })
}

export async function deleteSession() {
  const cookieStore = await cookies()
  cookieStore.delete('revalta_session')
}

export async function getSession() {
  const cookieStore = await cookies()
  const session = cookieStore.get('revalta_session')?.value
  if (!session) return null
  return await decrypt(session)
}
