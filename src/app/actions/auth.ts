'use server'

import { prisma } from '@/lib/prisma'
import { hashPassword, verifyPassword } from '@/lib/password'
import { createSession, deleteSession } from '@/lib/session'
import { redirect } from 'next/navigation'

export async function register(prevState: unknown, formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const name = formData.get('name') as string || ''

  if (!email || !password) {
    return { error: 'E-post och lösenord krävs.' }
  }

  const existingUser = await prisma.user.findUnique({ where: { email } })
  if (existingUser) {
    return { error: 'Användaren finns redan.' }
  }

  const hashedPassword = await hashPassword(password)
  
  const firstName = name.split(' ')[0] || 'Okänd'
  const lastName = name.split(' ').slice(1).join(' ') || 'Användare'

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: hashedPassword,
      firstName,
      lastName,
      role: 'company_owner', 
      status: 'active',
    },
  })

  await createSession({
    userId: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    companyId: null,
    companyStatus: null
  })

  redirect('/dashboard')
}

export async function login(prevState: unknown, formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'E-post och lösenord krävs.' }
  }

  const user = await prisma.user.findUnique({ 
    where: { email },
    include: { memberships: { include: { company: true } } }
  })

  if (!user) {
    return { error: 'Ogiltiga inloggningsuppgifter.' }
  }

  if (user.status === 'blocked' || user.status === 'deleted') {
    return { error: 'Ditt konto är spärrat. Kontakta support.' }
  }

  const primaryMembership = user.memberships[0]
  const company = primaryMembership?.company

  if (company && (company.status === 'blocked' || company.status === 'deleted')) {
    return { error: 'Ditt företag är spärrat från plattformen.' }
  }

  const isPasswordValid = await verifyPassword(password, user.passwordHash)
  if (!isPasswordValid) {
    return { error: 'Ogiltiga inloggningsuppgifter.' }
  }

  await createSession({
    userId: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    companyId: company?.id || null,
    companyStatus: company?.status || null
  })

  redirect('/dashboard')
}

export async function logout() {
  await deleteSession()
  redirect('/login')
}
