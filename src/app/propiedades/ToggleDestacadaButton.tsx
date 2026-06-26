"use client";

import { useState } from "react";
import { toggleDestacada } from "@/lib/propiedades/storage";
import type { Propiedad } from "@/lib/propiedades/types";

export default function ToggleDestacadaButton({
  propiedad,
  onChange,
}: {
  propiedad: Propiedad;
  onChange: (p: Propiedad) => void;
}) {
  const [pending, setPending] = useState(false);
  const destacada = propiedad.destacada;

  async function handleClick() {
    setPending(true);
    try {
      const updated = await toggleDestacada(propiedad.id, !destacada);
      onChange(updated);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al actualizar");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={handleClick}
      title={destacada ? "Quitar destaque" : "Destacar"}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors ${
        destacada
          ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
      } ${pending ? "opacity-50" : ""}`}
    >
      <svg viewBox="0 0 24 24" className={`h-3 w-3 ${destacada ? "fill-current" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
      {destacada ? "Destacada" : "Normal"}
    </button>
  );
}
