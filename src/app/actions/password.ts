'use server'

import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/password'
import { randomBytes } from 'crypto'

export async function forgotPassword(prevState: unknown, formData: FormData) {
  const email = formData.get('email') as string

  if (!email) {
    return { error: 'E-postadress krävs.' }
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    // Returnera "success" även om användaren inte finns, för att förhindra e-postfiske (enumeration attacks)
    return { success: 'Om e-postadressen finns i vårt system har en återställningslänk skickats.' }
  }

  // TODO: Implementera token-generering och spara i en databastabell (t.ex. PasswordResetToken)
  // För tillfället simulerar vi flödet i MVP:n. I produktion skickas ett mail här med SendGrid/Resend.
  
  // Simulera fördröjning för premium-känsla
  await new Promise(resolve => setTimeout(resolve, 1000))

  return { success: 'Återställningslänk har skickats (Simulerat för MVP).' }
}

export async function resetPassword(prevState: unknown, formData: FormData) {
  const password = formData.get('password') as string
  const token = formData.get('token') as string

  if (!password || password.length < 8) {
    return { error: 'Lösenordet måste vara minst 8 tecken långt.' }
  }

  // TODO: Här validerar man token mot databasen och hämtar ut kopplad email.
  // Eftersom vi inte har skapat PasswordResetToken-tabellen ännu, mockar vi success.
  
  // const hashedPassword = await hashPassword(password)
  // await prisma.user.update({ where: { email }, data: { passwordHash: hashedPassword } })

  await new Promise(resolve => setTimeout(resolve, 1000))

  return { success: 'Ditt lösenord har återställts. Du kan nu logga in.' }
}
