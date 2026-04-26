import Link from 'next/link'
import RegisterForm from './RegisterForm'

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-sm border border-gray-100">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Skapa konto</h1>
          <p className="text-gray-500 mt-2">Börja hantera dina fastigheter med AI</p>
        </div>

        <RegisterForm />

        <p className="text-center text-sm text-gray-600 mt-8">
          Har du redan ett konto?{' '}
          <Link href="/login" className="text-black font-medium hover:underline">
            Logga in
          </Link>
        </p>
      </div>
    </div>
  )
}
