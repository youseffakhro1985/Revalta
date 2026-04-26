'use client'

import { useActionState } from 'react'
import { register } from '@/app/actions/auth'

export default function RegisterForm() {
  const [state, formAction, isPending] = useActionState(register, null)

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <div className="p-3 bg-red-50 text-red-500 rounded-lg text-sm">
          {state.error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Namn</label>
        <input
          type="text"
          name="name"
          required
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all"
          placeholder="Förnamn Efternamn"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">E-post</label>
        <input
          type="email"
          name="email"
          required
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all"
          placeholder="namn@exempel.se"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Lösenord</label>
        <input
          type="password"
          name="password"
          required
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all"
          placeholder="Minst 8 tecken"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-black text-white py-2.5 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
      >
        {isPending ? 'Registrerar...' : 'Registrera'}
      </button>
    </form>
  )
}
