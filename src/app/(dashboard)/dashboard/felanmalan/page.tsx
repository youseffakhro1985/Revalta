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
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Felanmälan</h1>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 mb-8">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">Skapa ny felanmälan</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Titel</label>
            <input 
              type="text" 
              required
              className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-primary focus:ring-primary" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex. Läckande kran i köket"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Beskrivning</label>
            <textarea 
              required
              rows={4}
              className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-primary focus:ring-primary" 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Beskriv problemet mer ingående..."
            />
          </div>
          <button type="submit" className="py-2 px-6 bg-primary text-white font-medium rounded-md hover:bg-blue-800 transition">
            Skicka in ärende
          </button>
        </form>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">Dina pågående ärenden</h2>
        </div>
        <div className="p-6">
          <p className="text-gray-500 italic">Du har inga aktiva felanmälningar just nu.</p>
        </div>
      </div>
    </div>
  );
}
