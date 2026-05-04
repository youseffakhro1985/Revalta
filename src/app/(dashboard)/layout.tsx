import Link from 'next/link';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex">
              <Link href="/dashboard" className="text-2xl font-bold text-primary">
                Revalta
              </Link>
            </div>
            <nav className="flex space-x-4">
              <Link href="/dashboard" className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium">Dashboard</Link>
              <Link href="/dashboard/felanmalan" className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium">Mina Felanmälningar</Link>
            </nav>
            <div>
              <Link href="/login" className="text-sm font-medium text-gray-500 hover:text-gray-700">Logga ut</Link>
            </div>
          </div>
        </div>
      </header>
      <main className="flex-1 w-full max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
