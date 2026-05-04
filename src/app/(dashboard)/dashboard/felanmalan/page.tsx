"use client";

import { useState } from "react";

export default function FelanmalanPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTitle("");
    setDescription("");
    alert("Din felanmälan har skickats in!");
  };

  return (
    <div className="animate-fade-in max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Mina Ärenden</h1>
      </div>
      
      <div className="bg-white p-8 rounded-2xl shadow-card border border-slate-100 mb-8 animate-slide-up">
        <h2 className="text-xl font-bold mb-6 text-slate-900">Skapa ny felanmälan</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Titel</label>
            <input 
              type="text" 
              required
              className="block w-full rounded-xl border-slate-200 border p-3 shadow-inner-sm focus:border-brand-500 focus:ring-brand-500 transition-colors outline-none" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex. Läckande kran i köket"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Beskrivning</label>
            <textarea 
              required
              rows={4}
              className="block w-full rounded-xl border-slate-200 border p-3 shadow-inner-sm focus:border-brand-500 focus:ring-brand-500 transition-colors outline-none resize-y" 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Beskriv problemet mer ingående..."
            />
          </div>
          <button type="submit" className="py-3 px-8 bg-brand-600 text-white font-medium rounded-xl hover:bg-brand-700 transition-all shadow-card hover:shadow-card-md active:scale-[0.98]">
            Skicka in ärende
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow-card border border-slate-100 overflow-hidden animate-slide-up" style={{ animationDelay: '100ms' }}>
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-lg font-bold text-slate-900">Dina pågående ärenden</h2>
        </div>
        <div className="p-12 text-center">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </div>
          <p className="text-slate-500 font-medium">Du har inga aktiva felanmälningar just nu.</p>
        </div>
      </div>
    </div>
  );
}
