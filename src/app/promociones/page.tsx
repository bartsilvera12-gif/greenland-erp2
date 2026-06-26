"use client";

import { Megaphone } from "lucide-react";

export default function PromocionesPage() {
  return (
    <div className="space-y-6 px-4 py-4 md:px-6 md:py-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Promociones</h1>
        <p className="mt-1 text-sm text-slate-500">Catálogo de promociones</p>
      </header>

      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#4FAEB2]/10 text-[#3F8E91]">
          <Megaphone className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium text-slate-700">Módulo en construcción</p>
        <p className="max-w-md text-xs text-slate-500">
          Acá vas a poder cargar y gestionar las promociones de Green Land.
        </p>
      </div>
    </div>
  );
}
