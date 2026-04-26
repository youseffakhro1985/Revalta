import { Button } from "@/components/ui/button";

export default function DemoPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Boka en demo</h2>
        <p className="mt-6 text-lg leading-8 text-gray-600 mb-8">
          Vi visar dig gärna hur Revalta kan effektivisera din verksamhet. Boka ett 15-minuters möte med oss.
        </p>
        <Button href="/register" className="px-8 py-3">Skapa gratis konto istället</Button>
      </div>
    </div>
  );
}
