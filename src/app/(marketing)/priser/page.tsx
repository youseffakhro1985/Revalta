import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

export default function PriserPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-base font-semibold leading-7 text-primary">Transparenta priser</h2>
        <p className="mt-2 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          Ett pris som skalar med dig
        </p>
      </div>

      <div className="mx-auto mt-16 grid max-w-lg grid-cols-1 items-center gap-y-6 sm:mt-20 sm:gap-y-0 lg:max-w-4xl lg:grid-cols-2">
        {/* Basic Plan */}
        <div className="rounded-3xl rounded-t-3xl bg-white p-8 sm:p-10 lg:rounded-tr-none lg:rounded-br-none border border-gray-200 shadow-sm">
          <h3 className="text-base font-semibold leading-7 text-gray-900">Growth</h3>
          <p className="mt-4 flex items-baseline gap-x-2">
            <span className="text-5xl font-bold tracking-tight text-gray-900">995</span>
            <span className="text-base text-gray-500">kr/mån</span>
          </p>
          <p className="mt-6 text-base leading-7 text-gray-600">Perfekt för den mindre förvaltaren eller bostadsrättsföreningen.</p>
          <ul role="list" className="mt-8 space-y-3 text-sm leading-6 text-gray-600 sm:mt-10">
            <li className="flex gap-x-3"><CheckCircle2 className="h-6 w-5 flex-none text-primary" /> Upp till 5 fastigheter</li>
            <li className="flex gap-x-3"><CheckCircle2 className="h-6 w-5 flex-none text-primary" /> Obegränsade ärenden</li>
            <li className="flex gap-x-3"><CheckCircle2 className="h-6 w-5 flex-none text-primary" /> AI Felanmälan</li>
          </ul>
          <Button href="/register" variant="secondary" className="mt-8 w-full">Välj Growth</Button>
        </div>

        {/* Premium Plan */}
        <div className="rounded-3xl bg-gray-950 p-8 shadow-2xl ring-1 ring-gray-900/10 sm:p-10 relative z-10 lg:-ml-4 lg:rounded-l-3xl">
          <h3 className="text-base font-semibold leading-7 text-white">Enterprise</h3>
          <p className="mt-4 flex items-baseline gap-x-2">
            <span className="text-5xl font-bold tracking-tight text-white">2 995</span>
            <span className="text-base text-gray-400">kr/mån</span>
          </p>
          <p className="mt-6 text-base leading-7 text-gray-300">För fullskaliga fastighetsbolag med komplexa behov.</p>
          <ul role="list" className="mt-8 space-y-3 text-sm leading-6 text-gray-300 sm:mt-10">
            <li className="flex gap-x-3"><CheckCircle2 className="h-6 w-5 flex-none text-white" /> Obegränsat antal fastigheter</li>
            <li className="flex gap-x-3"><CheckCircle2 className="h-6 w-5 flex-none text-white" /> Avancerad AI & Analys</li>
            <li className="flex gap-x-3"><CheckCircle2 className="h-6 w-5 flex-none text-white" /> Leverantörsportal</li>
            <li className="flex gap-x-3"><CheckCircle2 className="h-6 w-5 flex-none text-white" /> SLA och personlig support</li>
          </ul>
          <Button href="/register" className="mt-8 w-full bg-white text-gray-950 hover:bg-gray-100">Välj Enterprise</Button>
        </div>
      </div>
    </div>
  );
}
