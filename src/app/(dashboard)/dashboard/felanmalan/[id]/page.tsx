import Link from "next/link";

export default function TicketDetailPage({ params }: { params: { id: string } }) {
  return (
    <div>
      <div className="mb-6">
        <Link href="/dashboard/felanmalan" className="text-primary hover:underline text-sm flex items-center">
          &larr; Tillbaka till alla ärenden
        </Link>
      </div>
      <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-100">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Ärende #{params.id}</h1>
            <p className="text-gray-500 text-sm">Skapad den: {new Date().toLocaleDateString('sv-SE')}</p>
          </div>
          <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium">ÖPPEN</span>
        </div>
        <div className="prose max-w-none text-gray-700">
          <h3 className="text-lg font-semibold mb-2">Beskrivning</h3>
          <p>
            Detta är en platshållare för ärendebeskrivningen. När databasen är fullt integrerad kommer detaljerna för detta ärende att visas här.
          </p>
        </div>
      </div>
    </div>
  );
}
