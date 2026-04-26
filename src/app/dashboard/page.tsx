import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wrench, CheckCircle2, Clock, AlertTriangle, Building2, Plus, Sparkles, ArrowRight } from "lucide-react";
import { requireAuth } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await requireAuth();
  
  const userName = session.email.split('@')[0];
  const displayName = userName.charAt(0).toUpperCase() + userName.slice(1);

  if (!session.companyId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="w-24 h-24 bg-gradient-to-tr from-gray-100 to-gray-50 rounded-[2rem] flex items-center justify-center mb-8 border border-gray-200/50 shadow-sm">
          <Building2 className="w-10 h-10 text-gray-900" />
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-950 mb-3">Välkommen, {displayName}!</h1>
        <p className="text-lg text-gray-500 max-w-lg mb-10 leading-relaxed">
          Ditt personliga konto är redo. För att börja hantera fastigheter och ärenden behöver du knyta kontot till en organisation.
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <Button href="/dashboard/onboarding" className="h-12 px-8 text-base shadow-md">
            <Plus className="w-5 h-5 mr-2" /> Skapa organisation
          </Button>
          <Button variant="secondary" className="h-12 px-8 text-base">
            Har du en inbjudningskod?
          </Button>
        </div>
      </div>
    );
  }

  // Hämta riktig data för det inloggade företaget
  const [openTickets, inProgress, resolved, recentTickets, propertyCount] = await Promise.all([
    prisma.ticket.count({ where: { companyId: session.companyId, status: { in: ['new', 'received'] } } }),
    prisma.ticket.count({ where: { companyId: session.companyId, status: 'in_progress' } }),
    prisma.ticket.count({ where: { companyId: session.companyId, status: { in: ['completed', 'closed'] } } }),
    prisma.ticket.findMany({ 
      where: { companyId: session.companyId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { property: true }
    }),
    prisma.property.count({ where: { companyId: session.companyId } })
  ]);

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-950">Översikt</h1>
          <p className="text-gray-500 mt-2 text-sm font-medium">Välkommen tillbaka. Här är läget för dina fastigheter just nu.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button href="/dashboard/tickets/new" className="shadow-sm">
            <Plus className="w-4 h-4 mr-2" /> Ny felanmälan
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-white hover:border-gray-300 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-gray-600">Öppna Ärenden</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-950">{openTickets}</div>
            <p className="text-xs text-gray-500 font-medium mt-1">Kräver uppmärksamhet</p>
          </CardContent>
        </Card>
        
        <Card className="bg-white hover:border-gray-300 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-gray-600">Pågående</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-950">{inProgress}</div>
            <p className="text-xs text-gray-500 font-medium mt-1">Tilldelade / Arbete pågår</p>
          </CardContent>
        </Card>
        
        <Card className="bg-white hover:border-gray-300 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-gray-600">Lösta (Totalt)</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-950">{resolved}</div>
            <p className="text-xs text-gray-500 font-medium mt-1">Avslutade ärenden</p>
          </CardContent>
        </Card>
        
        <Card className="bg-white hover:border-gray-300 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-gray-600">Fastigheter</CardTitle>
            <Building2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-950">{propertyCount}</div>
            <p className="text-xs text-gray-500 font-medium mt-1">Aktiva i portföljen</p>
          </CardContent>
        </Card>
      </div>

      {/* Grid for Table and AI Insights */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Recent Tickets Table */}
        <Card className="md:col-span-2 flex flex-col">
          <CardHeader className="border-b border-gray-100 pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold text-gray-950">Senaste felanmälningar</CardTitle>
              <Link href="/dashboard/tickets" className="text-sm font-medium text-primary hover:underline flex items-center">
                Visa alla <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1">
            {recentTickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center px-4">
                <Wrench className="w-8 h-8 text-gray-300 mb-3" />
                <p className="text-sm font-medium text-gray-900">Inga ärenden ännu</p>
                <p className="text-xs text-gray-500 mt-1">När hyresgäster gör felanmälningar dyker de upp här.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {recentTickets.map(ticket => (
                  <div key={ticket.id} className="flex items-center justify-between p-4 hover:bg-gray-50/50 transition-colors">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{ticket.title}</p>
                      <p className="text-xs font-medium text-gray-500 mt-0.5">
                        {ticket.property?.name || 'Okänd fastighet'} • {new Date(ticket.createdAt).toLocaleDateString('sv-SE')}
                      </p>
                    </div>
                    <Badge variant={ticket.status === 'new' ? 'destructive' : ticket.status === 'in_progress' ? 'warning' : 'success'}>
                      {ticket.status === 'new' ? 'Ny' : ticket.status === 'in_progress' ? 'Pågår' : 'Klar'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Insights Card */}
        <Card className="bg-gradient-to-b from-gray-900 to-gray-950 text-white border-0 shadow-xl overflow-hidden relative">
          {/* Decorative background glow */}
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-white/10 blur-3xl"></div>
          
          <CardHeader className="pb-4 relative z-10">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-300" />
              <CardTitle className="text-lg font-semibold text-white">Revalta AI</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <p className="text-sm text-gray-300 leading-relaxed mb-6">
              AI-motorn är aktiv och övervakar inkommande ärenden. Den kategoriserar och riskbedömer automatiskt åt dig.
            </p>
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-300">Analyserade ärenden</span>
                <span className="text-xs font-bold text-emerald-400">100%</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-1.5 mb-1">
                <div className="bg-emerald-400 h-1.5 rounded-full" style={{ width: '100%' }}></div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
