import Link from 'next/link';

export default function Dashboard() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Översikt</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h2 className="text-xl font-semibold mb-2 text-gray-800">Skapa ny felanmälan</h2>
          <p className="text-gray-600 mb-4">Har du upptäckt ett fel i fastigheten? Skapa en felanmälan snabbt och enkelt för snabbast möjliga service.</p>
          <Link href="/dashboard/felanmalan" className="inline-block px-4 py-2 bg-primary text-white font-medium rounded-md hover:bg-blue-800 transition">
            Gå till felanmälan
          </Link>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h2 className="text-xl font-semibold mb-2 text-gray-800">Mina uppgifter</h2>
          <p className="text-gray-600 mb-4">Se över dina kontaktuppgifter och inställningar på din profil.</p>
          <button className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-md hover:bg-gray-50 transition">
            Redigera profil
          </button>
        </div>
      </div>
    </div>
  );
}
