'use server'

import { prisma } from '@/lib/prisma'
import { hash, compare } from 'bcryptjs'
import { createSession, deleteSession } from '@/lib/session'
import { redirect } from 'next/navigation'

export async function register(prevState: any, formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const name = formData.get('name') as string || ''

  if (!email || !password) {
    return { error: 'Email and password are required' }
  }

  const existingUser = await prisma.user.findUnique({ where: { email } })
  if (existingUser) {
    return { error: 'User already exists' }
  }

  const hashedPassword = await hash(password, 10)
  
  const firstName = name.split(' ')[0] || 'Unknown'
  const lastName = name.split(' ').slice(1).join(' ') || 'User'

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: hashedPassword,
      firstName,
      lastName,
    },
  })

  await createSession(user.id, user.email)
  redirect('/dashboard')
}

export async function login(prevState: any, formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Email and password are required' }
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    return { error: 'Invalid credentials' }
  }

  const isPasswordValid = await compare(password, user.passwordHash)
  if (!isPasswordValid) {
    return { error: 'Invalid credentials' }
  }

  await createSession(user.id, user.email)
  redirect('/dashboard')
}

export async function logout() {
  await deleteSession()
  redirect('/login')
}
