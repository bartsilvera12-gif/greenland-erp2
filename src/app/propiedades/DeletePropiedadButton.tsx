"use client";

import { useState } from "react";
import { deletePropiedad } from "@/lib/propiedades/storage";
import type { Propiedad } from "@/lib/propiedades/types";

export default function DeletePropiedadButton({
  propiedad,
  onDeleted,
}: {
  propiedad: Propiedad;
  onDeleted: (id: string) => void;
}) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (!confirm(`¿Eliminar la propiedad "${propiedad.titulo}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    setPending(true);
    try {
      await deletePropiedad(propiedad.id);
      onDeleted(propiedad.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={handleClick}
      title="Eliminar"
      aria-label="Eliminar"
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md bg-rose-50 text-rose-600 ring-1 ring-rose-200 transition-colors hover:bg-rose-100 ${
        pending ? "opacity-50" : ""
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
        <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      </svg>
    </button>
  );
}
