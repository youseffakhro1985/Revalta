"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    // TODO: Byt mot riktigt API-anrop när /api/auth/login är redo
    router.push("/dashboard");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-md border border-gray-100">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-6">Logga in</h2>
        {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">E-post</label>
            <input 
              type="email" 
              required
              className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-primary focus:ring-primary" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Lösenord</label>
            <input 
              type="password" 
              required
              className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-primary focus:ring-primary" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="w-full py-2 px-4 bg-primary text-white font-medium rounded-md hover:bg-blue-800 transition">
            Logga in
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-600">
          Har du inget konto? <Link href="/register" className="text-primary hover:underline">Skapa ett här</Link>
        </p>
      </div>
    </div>
  );
}
